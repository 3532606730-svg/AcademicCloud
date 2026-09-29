"""Pure sidecar payload tests; no Paddle import, model, network or GPU needed."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("sidecar", Path(__file__).parents[1] / "scripts" / "paddle_ocr_sidecar.py")
sidecar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sidecar)


class GeometryTests(unittest.TestCase):
    def result(self, payload, reader=True, geometry=True):
        return sidecar.recognition_payload([payload], reader, geometry, 100, 200)

    def test_recognition_indices_survive_blank_filter_and_non_bmp(self):
        result = self.result({"rec_texts": [" ", "𠮷", " B "], "rec_scores": [.9, .9, .9],
                              "rec_boxes": [[0, 0, 5, 5], [10, 20, 40, 40], [20, 50, 60, 70]],
                              "dt_polys": ["deliberately not aligned"]})
        self.assertEqual(result["text"], "𠮷\nB")
        self.assertEqual([(b["start"], b["end"]) for b in result["geometry"]["lineBoxes"]], [(0, 2), (3, 4)])
        self.assertEqual(result["geometry"]["lineBoxes"][0]["x"], .1)
        self.assertEqual(result["geometry"]["lineBoxes"][1]["y"], .25)

    def test_rec_polys_preferred_and_normalized_in_image_frame(self):
        result = self.result({"rec_texts": ["A"], "rec_scores": [.9],
                              "rec_polys": [[[10, 20], [40, 25], [35, 40], [10, 35]]],
                              "rec_boxes": [[0, 0, 100, 200]]})
        self.assertEqual(result["geometry"]["lineBoxes"],
                         [{"start": 0, "end": 1, "x": .1, "y": .1, "width": .3, "height": .1}])

    def test_missing_geometry_does_not_use_detection_boxes(self):
        result = self.result({"rec_texts": ["A"], "rec_scores": [.9], "dt_polys": [[[0, 0]] * 4]})
        self.assertEqual(result["text"], "A")
        self.assertEqual(result["geometry"], {"status": "unavailable"})

    def test_invalid_geometry_keeps_text(self):
        for boxes in ([], [[0, 0, 101, 5]], [[0, 0, float("nan"), 5]], [[3, 4, 1, 2]], [[0, 0, 0, 5]]):
            with self.subTest(boxes=boxes):
                result = self.result({"rec_texts": ["A"], "rec_scores": [.3], "rec_boxes": boxes})
                self.assertEqual(result["text"], "A")
                self.assertEqual(result["status"], "low_confidence")
                self.assertEqual(result["geometry"], {"status": "invalid"})

    def test_box_count_and_text_limits(self):
        result = self.result({"rec_texts": ["A"] * 513, "rec_scores": [.9] * 513,
                              "rec_boxes": [[0, 0, 10, 10]] * 513})
        self.assertEqual(len(result["geometry"]["lineBoxes"]), 512)
        self.assertEqual(result["geometry"]["status"], "limited")
        result = self.result({"rec_texts": ["A", "B" * 16_384], "rec_scores": [.9, .9],
                              "rec_boxes": [[0, 0, 10, 10]] * 2})
        self.assertTrue(result["truncated"])
        self.assertEqual(len(result["geometry"]["lineBoxes"]), 1)
        self.assertEqual(result["geometry"]["status"], "limited")

    def test_legacy_and_reader_without_geometry_keep_existing_behavior(self):
        payload = {"rec_texts": [" uncertain "], "rec_scores": [.3], "rec_boxes": "invalid"}
        self.assertEqual(self.result(payload, False, False), {"status": "low_confidence", "text": "", "confidence": 30})
        self.assertEqual(self.result(payload, True, False),
                         {"status": "low_confidence", "text": "uncertain", "confidence": 30, "truncated": False})
        with self.assertRaises(ValueError):
            self.result({"rec_texts": ["x" * 16_385], "rec_scores": [.9]}, False, False)

    def test_blank_page_has_no_geometry(self):
        result = self.result({"rec_texts": [], "rec_scores": [], "rec_boxes": []})
        self.assertEqual(result["status"], "no_text")
        self.assertEqual(result["geometry"], {"status": "unavailable"})


if __name__ == "__main__":
    unittest.main()
