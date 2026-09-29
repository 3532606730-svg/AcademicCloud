#!/usr/bin/env python3
"""Memory-only JSONL bridge for the pinned PP-OCRv6 small pipeline."""

from __future__ import annotations

import argparse
import base64
import contextlib
import io
import json
import math
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
MAX_LINE_BOXES = 512


def utf16_length(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def line_rectangle(value: Any, polygon: bool, width: int, height: int) -> dict[str, float]:
    """Recognition-filtered geometry, in unchanged decoded-image coordinates."""
    if not isinstance(value, list) or len(value) != 4:
        raise ValueError("invalid line geometry")
    if polygon:
        if any(not isinstance(point, list) or len(point) != 2 for point in value):
            raise ValueError("invalid line polygon")
        points = value
    else:
        points = [[value[0], value[1]], [value[2], value[3]]]
    if any(type(n) not in (int, float) or not math.isfinite(n) for point in points for n in point):
        raise ValueError("invalid line coordinates")
    xs, ys = [point[0] for point in points], [point[1] for point in points]
    left, right, top, bottom = min(xs), max(xs), min(ys), max(ys)
    if (left < 0 or top < 0 or right > width or bottom > height
            or right <= left or bottom <= top or (not polygon and (xs[1] <= xs[0] or ys[1] <= ys[0]))):
        raise ValueError("invalid line bounds")
    x, y = left / width, top / height
    return {"x": x, "y": y, "width": min((right - left) / width, 1 - x),
            "height": min((bottom - top) / height, 1 - y)}


def recognition_payload(results: Any, reader_mode: bool, include_geometry: bool,
                        image_width: int, image_height: int) -> dict[str, Any]:
    texts: list[str] = []
    boxes: list[dict[str, Any]] = []
    weighted_score = 0.0
    score_weight = 0
    text_units = 0
    geometry_status = "available"
    for result in results:
        payload = result_payload(result)
        result_texts = payload.get("rec_texts", [])
        result_scores = payload.get("rec_scores", [])
        if not isinstance(result_texts, list) or not isinstance(result_scores, list):
            geometry_status = "invalid"
            continue
        # dt_polys includes rejected detections and must NEVER be zipped to rec_texts.
        polygon = "rec_polys" in payload
        geometry = payload.get("rec_polys" if polygon else "rec_boxes")
        aligned = isinstance(geometry, list) and len(geometry) == len(result_texts) == len(result_scores)
        if include_geometry and not aligned:
            geometry_status = "unavailable" if geometry is None and len(result_texts) == len(result_scores) and geometry_status != "invalid" else "invalid"
        for index, (text, score) in enumerate(zip(result_texts, result_scores)):
            normalized = str(text).strip()
            if not normalized:
                continue
            start = text_units + (1 if texts else 0)
            texts.append(normalized)
            text_units = start + utf16_length(normalized) if include_geometry else 0
            weight = max(1, len(normalized))
            weighted_score += float(score) * weight
            score_weight += weight
            if include_geometry and aligned:
                try:
                    rectangle = line_rectangle(geometry[index], polygon, image_width, image_height)
                    if len(boxes) < MAX_LINE_BOXES:
                        boxes.append({"start": start, "end": text_units, **rectangle})
                    elif geometry_status == "available":
                        geometry_status = "limited"
                except (ValueError, TypeError, OverflowError):
                    geometry_status = "invalid"
    joined = "\n".join(texts).strip()
    truncated = len(joined) > MAX_TEXT_CHARACTERS
    if truncated and not reader_mode:
        raise ValueError("output limit")
    confidence = None if score_weight == 0 else max(0, min(100, round(100 * weighted_score / score_weight)))
    status = "no_text" if not joined else "low_confidence" if confidence is None or confidence < 55 else "recognized"
    output = joined[:MAX_TEXT_CHARACTERS] if reader_mode or status == "recognized" else ""
    response: dict[str, Any] = {"status": status, "text": output, "confidence": confidence}
    if reader_mode:
        response["truncated"] = truncated
    if include_geometry:
        output_units = utf16_length(output)
        retained = [box for box in boxes if box["end"] <= output_units]
        if geometry_status == "available" and len(retained) != len(boxes):
            geometry_status = "limited"
        if not output:
            geometry_status = "unavailable"
        response["geometry"] = ({"status": geometry_status, "imageWidth": image_width,
                                 "imageHeight": image_height, "lineBoxes": retained}
                                if geometry_status in ("available", "limited") else {"status": geometry_status})
    return response


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
            reader_mode = request.get("readerMode") is True
            include_geometry = request.get("includeGeometry") is True
            if include_geometry and not reader_mode:
                raise ValueError("geometry requires reader mode")
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
            response = {"id": identifier, **recognition_payload(results, reader_mode, include_geometry,
                                                                image.shape[1], image.shape[0])}
        except Exception:
            response = {"id": identifier, "status": "failed"}
        print(json.dumps(response, ensure_ascii=False, separators=(",", ":")), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
