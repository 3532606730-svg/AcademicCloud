"""Probe existing local checkpoints on synthetic lines; never a quality gate.

Uses an existing Mongology environment without installing, training, fetching,
or reading any academic document. Output must be a new directory outside the
engine tree. Run with the engine's Python and --help for required paths.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import sys
import time

sys.dont_write_bytecode = True
os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"


def digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--font", type=Path, action="append", required=True)
    args = parser.parse_args()
    root, output = args.engine_root.resolve(strict=True), args.output_dir.resolve()
    if output.is_relative_to(root):
        parser.error("output must be outside the engine tree")
    if output.exists():
        parser.error("output directory must be new")
    fonts = [font.resolve(strict=True) for font in args.font]
    candidates = {
        "mongolian_latin_v0_2": root / "work/releases/mongolian_latin_v0_2_max_shareable/crnn_ctc_checkpoint.pt",
        "latin_scholarly_managed_best": root / "work/hystoria_tartarorum/models/latin_scholarly_managed_finetune_from_epoch9/best_crnn_ctc_checkpoint.pt",
    }
    for checkpoint in candidates.values():
        if not checkpoint.is_file():
            parser.error(f"missing checkpoint: {checkpoint}")
    sys.path.insert(0, str(root / "src"))
    import torch
    from PIL import Image, ImageDraw, ImageFont
    from mongology_ocr.metrics import levenshtein_distance
    from mongology_ocr.torch_training import PredictionConfig, load_crnn_ctc_checkpoint, predict_crnn_ctc

    torch.set_num_threads(2)
    output.mkdir(parents=True)
    source_hashes = {str(path.relative_to(root)).replace("\\", "/"): digest(path)
                     for path in sorted((root / "src/mongology_ocr").glob("*.py"))}
    samples = []
    texts = [
        ("basic_latin", "The history of Central Asia."),
        ("basic_latin", "Historia Tartarorum 1234."),
        ("transcription", "qaγan köke üge"),
        ("transcription", "š č Č ǰ ö ü Γ γ"),
        ("distinctions", "I l 1 O 0 V v — ‘ ’"),
        ("distinctions", "ɣ Ɣ Г γ Γ"),
    ]
    for font_path in fonts:
        font = ImageFont.truetype(str(font_path), 32)
        for category, reference in texts:
            bbox = font.getbbox(reference)
            canvas = Image.new("L", (bbox[2] - bbox[0] + 24, max(48, bbox[3] - bbox[1] + 20)), 255)
            ImageDraw.Draw(canvas).text((12 - bbox[0], 10 - bbox[1]), reference, font=font, fill=0)
            sample_id = f"synthetic-{len(samples):03d}"
            image_path = output / f"{sample_id}.png"
            canvas.save(image_path)
            samples.append({"id": sample_id, "category": category, "reference": reference,
                            "font": font_path.name, "image_sha256": digest(image_path)})
    blank_id = f"synthetic-{len(samples):03d}"
    Image.new("L", (256, 48), 255).save(output / f"{blank_id}.png")
    samples.append({"id": blank_id, "category": "blank", "reference": "", "font": None,
                    "image_sha256": digest(output / f"{blank_id}.png")})
    input_path = output / "input.jsonl"
    with input_path.open("w", encoding="utf-8") as handle:
        for sample in samples:
            # References remain in the report, never in model input labels.
            handle.write(json.dumps({
                "schema_version": "1.0", "record_type": "line_training_sample",
                "line_id": sample["id"], "document_id": "synthetic-only", "page_id": "synthetic-page",
                "page_number": 1, "line_image_path": str(output / f"{sample['id']}.png"),
                "transcription": "", "verified": False, "annotation_status": "draft",
                "script_hint": "unknown", "direction_hint": "horizontal_ltr",
            }, ensure_ascii=False) + "\n")

    report = {
        "schema_version": 1, "purpose": "runtime_and_synthetic_diagnostics_only",
        "production_acceptance": False, "accuracy_acceptance": False,
        "limitations": ["Synthetic text and two supplied fonts are not representative book gold data.",
                        "Synthetic glyph rendering coverage is not a script-support qualification.",
                        "CPU inference timings include model reload and input/output, not page throughput.",
                        "No PDF layout, production permissions, WSL/CUDA or recovery tested here."],
        "runtime": {"python": platform.python_version(), "platform": platform.platform(),
                    "packages": {name: importlib.metadata.version(name) for name in ("torch", "Pillow", "PyMuPDF", "numpy")},
                    "device": "cpu", "threads": 2, "weights_only_load": True},
        "script_sha256": digest(Path(__file__)), "engine_source_sha256": source_hashes,
        "fonts": [{"name": font.name, "sha256": digest(font)} for font in fonts],
        "samples": samples, "models": [],
    }
    for label, checkpoint in candidates.items():
        checkpoint_before = digest(checkpoint)
        start = time.perf_counter()
        model, inventory, config, _ = load_crnn_ctc_checkpoint(checkpoint, device="cpu")
        load_seconds = time.perf_counter() - start
        del model
        probe_sets = {"transcription": "öüščČǰγΓ", "original_variants": "ɣƔГᵞ‘’—",
                      "traditional_mongolian_example": "ᠮᠣᠩᠭᠣᠯ", "cyrillic_example": "Монгол"}
        coverage = {name: {"present": sorted(set(text) & set(inventory.characters)),
                           "missing": sorted(set(text) - set(inventory.characters))}
                    for name, text in probe_sets.items()}
        prediction_path = output / f"{label}.jsonl"
        start = time.perf_counter()
        predict_crnn_ctc(checkpoint, input_path, prediction_path,
                         config=PredictionConfig(batch_size=1, image_height=config.image_height, device="cpu"))
        inference_seconds = time.perf_counter() - start
        predictions = [json.loads(line) for line in prediction_path.read_text(encoding="utf-8").splitlines()]
        if len(predictions) != len(samples) or [row["line_id"] for row in predictions] != [row["id"] for row in samples]:
            raise RuntimeError("prediction identity or count mismatch")
        details = []
        for sample, prediction in zip(samples, predictions):
            confidence = prediction["confidence"]
            if confidence is not None and (not math.isfinite(confidence) or not 0 <= confidence <= 1):
                raise RuntimeError("invalid confidence")
            if prediction["status"] != "auto" or not isinstance(prediction["text"], str):
                raise RuntimeError("invalid prediction status/text")
            details.append({"id": sample["id"], "prediction": prediction["text"], "confidence": confidence,
                            "reference_characters": len(sample["reference"]),
                            "nfc_edit_distance": levenshtein_distance(sample["reference"], prediction["text"])})
        checkpoint_after = digest(checkpoint)
        if checkpoint_after != checkpoint_before:
            raise RuntimeError("checkpoint changed during probe")
        report["models"].append({"label": label, "checkpoint_relative_path": checkpoint.relative_to(root).as_posix(),
                                 "checkpoint_bytes": checkpoint.stat().st_size, "checkpoint_sha256": checkpoint_before,
                                 "checkpoint_unchanged": True, "inventory_characters": len(inventory.characters),
                                 "inventory_sha256": hashlib.sha256(json.dumps(inventory.to_dict(), ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
                                 "coverage": coverage, "load_seconds": round(load_seconds, 4),
                                 "inference_seconds_including_reload": round(inference_seconds, 4),
                                 "runtime_pass": True, "predictions": details})
    write_json(output / "report.json", report)
    print(json.dumps({"report": str(output / "report.json"), "models": len(report["models"]),
                      "synthetic_lines_per_model": len(samples), "runtime_pass": True,
                      "accuracy_acceptance": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
