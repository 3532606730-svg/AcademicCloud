#!/usr/bin/env python3
"""Run a generated-page PaddleOCR qualification with bounded resource sampling."""

from __future__ import annotations

import argparse
import base64
import json
import re
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

import cv2  # type: ignore[import-not-found]
import numpy as np  # type: ignore[import-not-found]
import psutil  # type: ignore[import-not-found]


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


def render_page() -> bytes:
    image = np.full((500, 1_400, 3), 255, dtype=np.uint8)
    cv2.putText(image, "The Mongols and the West", (45, 155), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(image, "Peter Jackson", (45, 335), cv2.FONT_HERSHEY_SIMPLEX, 1.7, (0, 0, 0), 4, cv2.LINE_AA)
    encoded, buffer = cv2.imencode(".png", image)
    if not encoded:
        raise RuntimeError("could not encode generated qualification page")
    return buffer.tobytes()


def read_message(process: subprocess.Popen[str]) -> dict[str, Any]:
    assert process.stdout is not None
    line = process.stdout.readline()
    if not line:
        diagnostic = ""
        if process.stderr is not None:
            diagnostic = process.stderr.read(8_192)
        raise RuntimeError(f"sidecar exited before response: {diagnostic}")
    value = json.loads(line)
    if not isinstance(value, dict):
        raise RuntimeError("sidecar emitted a non-object response")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sidecar", required=True, type=Path)
    parser.add_argument("--detection-model", required=True, type=Path)
    parser.add_argument("--recognition-model", required=True, type=Path)
    parser.add_argument("--device", choices=("cpu", "gpu"), required=True)
    parser.add_argument("--requests", type=int, default=3)
    args = parser.parse_args()
    if args.requests < 2 or args.requests > 10:
        parser.error("--requests must be between 2 and 10")

    baseline_gpu_mib = gpu_memory_mib()
    peak_gpu_mib = baseline_gpu_mib
    peak_rss_bytes = 0
    stop_sampling = threading.Event()
    started_at = time.perf_counter()
    process = subprocess.Popen(
        [
            str(Path(__import__("sys").executable)),
            "-I",
            str(args.sidecar),
            "--detection-model",
            str(args.detection_model),
            "--recognition-model",
            str(args.recognition_model),
            "--device",
            args.device,
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )

    def sample() -> None:
        nonlocal peak_gpu_mib, peak_rss_bytes
        root = psutil.Process(process.pid)
        while not stop_sampling.wait(0.1):
            try:
                processes = [root, *root.children(recursive=True)]
                rss = sum(item.memory_info().rss for item in processes if item.is_running())
                peak_rss_bytes = max(peak_rss_bytes, rss)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
            current_gpu_mib = gpu_memory_mib()
            if current_gpu_mib is not None:
                peak_gpu_mib = current_gpu_mib if peak_gpu_mib is None else max(peak_gpu_mib, current_gpu_mib)

    sampler = threading.Thread(target=sample, daemon=True)
    sampler.start()
    durations_ms: list[int] = []
    responses: list[dict[str, Any]] = []
    try:
        ready = read_message(process)
        startup_ms = round((time.perf_counter() - started_at) * 1_000)
        if ready.get("ready") is not True or ready.get("device") != args.device:
            raise RuntimeError(f"unexpected ready handshake: {ready}")
        image = base64.b64encode(render_page()).decode("ascii")
        assert process.stdin is not None
        for index in range(args.requests):
            request_started_at = time.perf_counter()
            process.stdin.write(json.dumps({"id": f"qualification-{index + 1}", "imageBase64": image}) + "\n")
            process.stdin.flush()
            response = read_message(process)
            durations_ms.append(round((time.perf_counter() - request_started_at) * 1_000))
            responses.append(response)
            normalized = re.sub(r"[^A-Z]+", " ", str(response.get("text", "")).upper())
            if response.get("status") != "recognized" or "MONGOLS" not in normalized or "JACKSON" not in normalized:
                raise RuntimeError(f"OCR qualification mismatch: {response}")
    finally:
        if process.stdin is not None:
            process.stdin.close()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        stop_sampling.set()
        sampler.join(timeout=3)

    if process.returncode != 0:
        diagnostic = "" if process.stderr is None else process.stderr.read(8_192)
        raise RuntimeError(f"sidecar exited {process.returncode}: {diagnostic}")
    output = {
        "contractVersion": 1,
        "device": args.device,
        "startupMilliseconds": startup_ms,
        "requestMilliseconds": durations_ms,
        "peakProcessRssMiB": round(peak_rss_bytes / (1024 * 1024)),
        "baselineGpuMemoryMiB": baseline_gpu_mib,
        "peakGpuMemoryMiB": peak_gpu_mib,
        "peakGpuMemoryDeltaMiB": None if baseline_gpu_mib is None or peak_gpu_mib is None else peak_gpu_mib - baseline_gpu_mib,
        "recognizedText": responses[-1].get("text"),
        "confidence": responses[-1].get("confidence"),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
