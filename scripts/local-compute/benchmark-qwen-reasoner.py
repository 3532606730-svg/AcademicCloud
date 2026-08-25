#!/usr/bin/env python3
"""Benchmark the pinned local llama-server with generated bibliographic text."""

from __future__ import annotations

import argparse
import json
import os
import signal
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def allocate_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        return int(server.getsockname()[1])


def gpu_memory_mib() -> int | None:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            check=True,
            capture_output=True,
            text=True,
            timeout=2,
        )
        return int(result.stdout.strip().splitlines()[0])
    except (FileNotFoundError, IndexError, subprocess.SubprocessError, ValueError):
        return None


def process_tree(pid: int) -> list[int]:
    result: list[int] = []
    pending = [pid]
    while pending:
        current = pending.pop()
        if current in result:
            continue
        result.append(current)
        try:
            children = Path(f"/proc/{current}/task/{current}/children").read_text(encoding="ascii").split()
            pending.extend(int(value) for value in children)
        except (FileNotFoundError, PermissionError, ValueError):
            pass
    return result


def rss_bytes(pid: int) -> int:
    total = 0
    for process_id in process_tree(pid):
        try:
            for line in Path(f"/proc/{process_id}/status").read_text(encoding="ascii").splitlines():
                if line.startswith("VmRSS:"):
                    total += int(line.split()[1]) * 1024
                    break
        except (FileNotFoundError, PermissionError, ValueError):
            pass
    return total


def json_request(url: str, body: dict[str, Any] | None = None, timeout: int = 10) -> dict[str, Any]:
    encoded = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=encoded,
        headers={} if encoded is None else {"content-type": "application/json"},
        method="GET" if encoded is None else "POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        value = json.loads(response.read())
    if not isinstance(value, dict):
        raise RuntimeError("server emitted a non-object response")
    return value


def wait_ready(origin: str, process: subprocess.Popen[bytes], timeout_seconds: int = 120) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            diagnostic = "" if process.stderr is None else process.stderr.read(8_192).decode("utf-8", errors="replace")
            raise RuntimeError(f"llama-server exited during startup: {diagnostic}")
        try:
            if json_request(f"{origin}/health", timeout=2).get("status") == "ok":
                return
        except (OSError, TimeoutError, urllib.error.URLError, json.JSONDecodeError):
            pass
        time.sleep(0.2)
    raise RuntimeError("llama-server startup timeout")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--gpu-layers", required=True, type=int, choices=range(0, 1_000))
    parser.add_argument("--requests", type=int, default=2, choices=range(2, 6))
    args = parser.parse_args()

    port = allocate_port()
    origin = f"http://127.0.0.1:{port}"
    baseline_gpu_mib = gpu_memory_mib()
    peak_gpu_mib = baseline_gpu_mib
    peak_rss_bytes = 0
    stop_sampling = threading.Event()
    started_at = time.perf_counter()
    environment = {
        "PATH": os.environ.get("PATH", ""),
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "LD_LIBRARY_PATH": os.environ.get("LD_LIBRARY_PATH", ""),
    }
    process = subprocess.Popen(
        [
            str(args.server),
            "--model",
            str(args.model),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--ctx-size",
            "8192",
            "--threads",
            "2",
            "--parallel",
            "1",
            "--gpu-layers",
            str(args.gpu_layers),
            "--no-webui",
            "--log-disable",
        ],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        env=environment,
        start_new_session=True,
    )

    def sample() -> None:
        nonlocal peak_gpu_mib, peak_rss_bytes
        while not stop_sampling.wait(0.1):
            peak_rss_bytes = max(peak_rss_bytes, rss_bytes(process.pid))
            current_gpu_mib = gpu_memory_mib()
            if current_gpu_mib is not None:
                peak_gpu_mib = current_gpu_mib if peak_gpu_mib is None else max(peak_gpu_mib, current_gpu_mib)

    sampler = threading.Thread(target=sample, daemon=True)
    sampler.start()
    request_timings: list[dict[str, Any]] = []
    final_content = ""
    try:
        wait_ready(origin, process)
        startup_ms = round((time.perf_counter() - started_at) * 1_000)
        body = {
            "model": "Qwen3-1.7B-GGUF",
            "temperature": 0,
            "seed": 0,
            "max_tokens": 128,
            "messages": [
                {"role": "system", "content": "Extract the explicitly labelled title and author. Return only schema-valid JSON. /no_think"},
                {"role": "user", "content": "题名：近代中国史研究\n作者：王明"},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "qualification_bibliography",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["title", "author"],
                        "properties": {"title": {"type": "string"}, "author": {"type": "string"}},
                    },
                },
            },
            "chat_template_kwargs": {"enable_thinking": False},
        }
        for _ in range(args.requests):
            request_started_at = time.perf_counter()
            response = json_request(f"{origin}/v1/chat/completions", body, timeout=420)
            elapsed_ms = round((time.perf_counter() - request_started_at) * 1_000)
            content = response.get("choices", [{}])[0].get("message", {}).get("content")
            if not isinstance(content, str):
                raise RuntimeError("reasoner response missing content")
            parsed = json.loads(content)
            if parsed != {"title": "近代中国史研究", "author": "王明"}:
                raise RuntimeError(f"reasoner qualification mismatch: {parsed}")
            final_content = content
            timings = response.get("timings") if isinstance(response.get("timings"), dict) else {}
            request_timings.append(
                {
                    "elapsedMilliseconds": elapsed_ms,
                    "promptTokensPerSecond": timings.get("prompt_per_second"),
                    "predictedTokensPerSecond": timings.get("predicted_per_second"),
                }
            )
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=10)
        stop_sampling.set()
        sampler.join(timeout=3)

    result = {
        "contractVersion": 1,
        "gpuLayers": args.gpu_layers,
        "startupMilliseconds": startup_ms,
        "requests": request_timings,
        "peakProcessRssMiB": round(peak_rss_bytes / (1024 * 1024)),
        "baselineGpuMemoryMiB": baseline_gpu_mib,
        "peakGpuMemoryMiB": peak_gpu_mib,
        "peakGpuMemoryDeltaMiB": None if baseline_gpu_mib is None or peak_gpu_mib is None else peak_gpu_mib - baseline_gpu_mib,
        "content": json.loads(final_content),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
