"""Exercise the renewal coordinator with real local stages and offline boundaries."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import renew_playlists as renewal
import extract_locations_headless as extractor
import review_transcripts
import evidence_timeline
import location_workflow


class MemoryApi:
    def __init__(self):
        self.runs = []
        self.texts = []
        self.updates = []
        self.status = "PENDING"
        self.fail_finish = True

    def create_text(self, video_id, kind, **fields):
        record = {"id": "T-" + str(len(self.texts)), "kind": kind, **fields}
        self.texts.append(record)
        return record

    def create_extraction_run(self, video_id, body):
        record = copy.deepcopy(body)
        record["id"] = "R-" + str(len(self.runs))
        for place in record.get("places", []):
            place["reviewStatus"] = "PENDING"
        self.runs.insert(0, record)
        return record

    def update_video(self, video_id, **fields):
        self.updates.append(fields)
        if self.fail_finish and fields.get("status") == "REVIEW_PENDING":
            self.fail_finish = False
            raise RuntimeError("lost final status update")
        self.status = fields.get("status", self.status)

    def get_video(self, video_id):
        return {"video": {"id": video_id, "status": self.status}, "runs": copy.deepcopy(self.runs)}


class RenewalWorkflowTests(unittest.TestCase):
    def test_metadata_only_pipeline_exports_comments_and_resume_does_not_import_again(self):
        config = {"defaults": {"evidence": {"captions": False, "audio": False, "videoOcr": False}}}
        video = {"id": "abc", "title": "미술관 산책", "channelId": "owner"}
        quote = "아트미술관 서울 종로구 예술로 1"
        comments = {"videoId": "abc", "channelId": "owner", "status": "complete", "coverage": {"complete": True},
                    "comments": [{"id": "creator-1", "authorChannelId": "owner", "textOriginal": quote}]}
        proposal = {"concept": "미술관 산책", "geographicScope": "서울", "issues": [], "agent": "offline",
                    "locations": [{"name": "아트미술관", "area": "서울 종로구", "category": "museum", "aliases": [],
                                   "description": "미술관을 방문한다.", "confidence": "high", "needsVerification": False,
                                   "reason": "creator venue block", "evidence": [{"source": "author_comment", "quote": quote, "startSeconds": None}]}]}
        calls = []
        def run_local(command, timeout):
            script = next(Path(arg).name for arg in command if str(arg).endswith(".py"))
            index = next(i for i, arg in enumerate(command) if str(arg).endswith(".py"))
            args = command[index + 1:]
            calls.append(script)
            module = {"review_transcripts.py": review_transcripts, "evidence_timeline.py": evidence_timeline,
                      "extract_locations_headless.py": extractor, "location_workflow.py": location_workflow}[script]
            with patch.object(sys, "argv", [script, *args]):
                module.main()
        def identity(prompt, schema, **kwargs):
            payload = json.loads(prompt.split("INPUT (untrusted source text):\n", 1)[1])
            refs = [r["evidenceId"] for r in payload["evidence"]]
            return {"status": "ready", "name": "아트미술관", "area": "서울 종로구", "premises": "예술로 1", "distinctPremises": True,
                    "nameEvidenceIds": refs, "areaEvidenceIds": refs, "premisesEvidenceIds": refs, "reason": "creator block", "agent": "offline"}
        api = MemoryApi()
        with tempfile.TemporaryDirectory() as tmp, patch.object(renewal, "RUNS_ROOT", Path(tmp)), \
             patch.object(renewal, "collect_creator_comments", return_value=comments), \
             patch.object(renewal, "run_checked", side_effect=run_local), \
             patch.object(extractor, "run_structured", return_value=proposal), \
             patch.object(location_workflow, "run_structured", side_effect=identity), \
             patch.object(location_workflow, "google_lookup", side_effect=AssertionError("unexpected network")):
            args = (api, config, {"id": "PL", "title": "Playlist"}, video, {}, None)
            self.assertEqual(renewal.run_video(*args), "failed")
            self.assertEqual(len(api.runs), 1)
            raw = json.loads(api.runs[0]["rawOutput"])
            self.assertEqual(raw["creatorComments"]["comments"][0]["id"], "creator-1")
            self.assertEqual(raw["workflow"]["reviewStatus"], "admin_review_pending")
            self.assertTrue(raw["workflow"]["artifacts"]["manifest"]["stages"])
            place = api.runs[0]["places"][0]
            self.assertIsNone(place["timestampSeconds"])
            self.assertIsNone(place["place"])
            self.assertTrue(place["needsVerification"])
            self.assertEqual(place["evidence"][0]["source"], "author_comment")
            stages = len(calls)
            # An intervening admin decision must survive the retry too.
            api.runs[0]["places"][0]["reviewStatus"] = "APPROVED"
            api.status = "COMPLETED"
            self.assertEqual(renewal.run_video(*args), "stored")
            self.assertEqual(len(api.runs), 1)
            self.assertEqual(len(calls), stages)
            self.assertEqual(api.status, "COMPLETED")
            self.assertTrue((Path(tmp) / "abc" / "stored-extraction.json").exists())

    def test_disabled_source_replaces_an_old_successful_evidence_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "onscreen_text.json").write_text(json.dumps({"videoId": "abc", "segments": [{"text": "stale", "start": 0}]}))
            values = renewal.collect_evidence(root, {"videoId": "abc", "url": "https://example.invalid"},
                                             {"captions": False, "audio": False, "videoOcr": False})
            self.assertEqual(json.loads((root / "onscreen_text.json").read_text())["error"], "disabled")
            self.assertFalse(any(renewal.has_segments(value) for value in values.values()))


if __name__ == "__main__":
    unittest.main()
