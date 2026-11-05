import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import extract_locations_headless as extractor
from evidence_timeline import ensure_timeline
from stage_store import StageStore


class ExtractionResumeTests(unittest.TestCase):
    def test_interrupted_window_resumes_then_changed_input_invalidates(self):
        metadata = {"videoId": "abc", "title": "A venue", "description": "Venue A, City, Branch"}
        timeline = {"durationSeconds": 20, "events": [
            {"source": "ocr", "text": "Venue A", "startSeconds": 0, "endSeconds": 1},
            {"source": "ocr", "text": "Venue B", "startSeconds": 15, "endSeconds": 16}]}
        result = {"locations": [], "concept": "walk", "geographicScope": "City", "issues": [], "agent": "test"}
        with tempfile.TemporaryDirectory() as tmp:
            store = StageStore(tmp, "abc")
            with patch.object(extractor, "run_structured", side_effect=[result.copy(), RuntimeError("interrupted")]) as agent:
                with self.assertRaises(RuntimeError):
                    extractor.extract(metadata, timeline, None, 1, 10, 0, store)
                self.assertEqual(agent.call_count, 2)
            with patch.object(extractor, "run_structured", return_value=result.copy()) as agent:
                extractor.extract(metadata, timeline, None, 1, 10, 0, StageStore(tmp, "abc"))
                self.assertEqual(agent.call_count, 1)
            with patch.object(extractor, "run_structured", side_effect=AssertionError("valid window reran")):
                extractor.extract(metadata, timeline, None, 1, 10, 0, store)
            metadata["description"] += " (creator correction)"
            with patch.object(extractor, "run_structured", return_value=result.copy()) as agent:
                extractor.extract(metadata, timeline, None, 1, 10, 0, store)
                self.assertEqual(agent.call_count, 2)
            self.assertTrue(any(a["envelope"]["status"] == "failed" for a in store.snapshot()["attempts"]))

    def test_timeline_conventional_file_cannot_inject_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "metadata.json").write_text(json.dumps({"videoId": "abc"}))
            (root / "captions.json").write_text(json.dumps({"videoId": "abc", "segments": [{"text": "original", "start": 0, "duration": 2}]}))
            original, path = ensure_timeline(root, "abc")
            corrupt = json.loads(path.read_text())
            corrupt["events"][0]["text"] = "fabricated venue"
            path.write_text(json.dumps(corrupt))
            recovered, _ = ensure_timeline(root, "abc")
            self.assertEqual(recovered, original)
            self.assertEqual(json.loads(path.read_text()), original)

    def test_distinct_regions_and_unnamed_destinations_survive_merge(self):
        def loc(name, area, time):
            return {"name": name, "area": area, "evidence": [{"source": "ocr", "quote": name or "building", "startSeconds": time}], "needsVerification": False}
        result = {"locations": [loc("Cafe", "Tokyo", 1), loc("Cafe", "Osaka", 100), loc("Cafe", "Tokyo", 200), loc("", "Tokyo", 300)], "window": {}}
        merged = extractor.merge_results({"videoId": "abc"}, "hash", [result])
        self.assertEqual(len(merged["locations"]), 4)
        self.assertEqual(merged["locations"][-1]["name"], "상호 미상")
        self.assertTrue(merged["locations"][-1]["needsVerification"])


if __name__ == "__main__":
    unittest.main()
