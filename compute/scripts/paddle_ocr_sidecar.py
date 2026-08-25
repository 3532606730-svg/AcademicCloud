#!/usr/bin/env python3
"""Memory-only JSONL bridge for the pinned PP-OCRv6 small pipeline."""

from __future__ import annotations

import argparse
import base64
import contextlib
import io
import json
import os
import sys
from typing import Any

ENGINE_ID = (
    "academiccloud-paddleocr-v1/3.7.0/3.3.1/"
    "det@106c97591b235f607453300d9fc8c1cad1b25488/"
    "rec@bd619643acac4b9650c040234da8d944476ee3f1"
)
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_TEXT_CHARACTERS = 16_384


class Sink(io.TextIOBase):
    def write(self, value: str) -> int:
        return len(value)


def result_payload(result: Any) -> dict[str, Any]:
    value = getattr(result, "json", result)
    if callable(value):
        value = value()
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        return {}
    nested = value.get("res")
    return nested if isinstance(nested, dict) else value


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--detection-model", required=True)
    parser.add_argument("--recognition-model", required=True)
    parser.add_argument("--device", choices=("cpu", "gpu"), default="cpu")
    args = parser.parse_args()

    sink = Sink()
    with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
        import cv2  # type: ignore[import-not-found]
        import numpy as np  # type: ignore[import-not-found]
        import paddle  # type: ignore[import-not-found]
        from paddleocr import PaddleOCR  # type: ignore[import-not-found]

        if paddle.__version__ != "3.3.1":
            return 20
        if args.device == "gpu" and not paddle.is_compiled_with_cuda():
            return 21
        paddle.set_device(args.device)
        engine = PaddleOCR(
            text_detection_model_name="PP-OCRv6_small_det",
            text_detection_model_dir=args.detection_model,
            text_recognition_model_name="PP-OCRv6_small_rec",
            text_recognition_model_dir=args.recognition_model,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            enable_mkldnn=False,
            cpu_threads=2,
            device=args.device,
        )

    print(json.dumps({"ready": True, "engine": ENGINE_ID, "device": args.device}, separators=(",", ":")), flush=True)
    for line in sys.stdin:
        identifier = ""
        try:
            request = json.loads(line)
            identifier = request.get("id", "")
            encoded = request.get("imageBase64", "")
            if not isinstance(identifier, str) or not isinstance(encoded, str):
                raise ValueError("invalid request")
            image_bytes = base64.b64decode(encoded, validate=True)
            if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
                raise ValueError("invalid image")
            image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError("invalid image")
            with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
                results = engine.predict(image)
            texts: list[str] = []
            weighted_score = 0.0
            score_weight = 0
            for result in results:
                payload = result_payload(result)
                result_texts = payload.get("rec_texts", [])
                result_scores = payload.get("rec_scores", [])
                if not isinstance(result_texts, list) or not isinstance(result_scores, list):
                    continue
                for text, score in zip(result_texts, result_scores):
                    normalized = str(text).strip()
                    if not normalized:
                        continue
                    texts.append(normalized)
                    weight = max(1, len(normalized))
                    weighted_score += float(score) * weight
                    score_weight += weight
            joined = "\n".join(texts).strip()
            if len(joined) > MAX_TEXT_CHARACTERS:
                raise ValueError("output limit")
            confidence = None if score_weight == 0 else max(0, min(100, round(100 * weighted_score / score_weight)))
            status = "no_text" if not joined else "low_confidence" if confidence is None or confidence < 55 else "recognized"
            response = {"id": identifier, "status": status, "text": joined if status == "recognized" else "", "confidence": confidence}
        except Exception:
            response = {"id": identifier, "status": "failed"}
        print(json.dumps(response, ensure_ascii=False, separators=(",", ":")), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
