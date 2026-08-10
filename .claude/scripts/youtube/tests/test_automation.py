import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from codex_headless import sanitized_environment
from _common import jwt_is_usable
from extract_locations_headless import load_evidence, merge_results
from renew_playlists import (
    discover,
    parse_json_output,
    write_primary_transcript,
    youtube_video_id,
)
from review_transcripts import update_reviewed_transcript
from upload_artifacts import artifact_entries, manifest_value


class RenewalTests(unittest.TestCase):
    def test_expired_admin_token_is_not_reused(self):
        import base64

        payload = base64.urlsafe_b64encode(b'{"exp":1}').rstrip(b"=").decode()
        self.assertFalse(jwt_is_usable(f"header.{payload}.signature"))

    def test_discover_includes_failed_before_new(self):
        remote = [
            {"videoId": "known", "position": 0},
            {"videoId": "failed", "position": 1},
            {"videoId": "new", "position": 2},
        ]
        state = {
            "knownVideoIds": ["known"],
            "videos": {"failed": {"status": "failed"}},
        }

        self.assertEqual([item["videoId"] for item in discover(remote, state)], ["failed", "new"])

    def test_discover_excludes_production_and_terminal_videos(self):
        remote = [
            {"videoId": "production", "position": 0},
            {"videoId": "reviewed", "position": 1},
            {"videoId": "new", "position": 2},
        ]
        state = {
            "knownVideoIds": [],
            "videos": {"reviewed": {"status": "review_pending"}},
        }

        self.assertEqual(
            [item["videoId"] for item in discover(remote, state, {"production"})],
            ["new"],
        )

    def test_youtube_video_id_supports_spot_link_formats(self):
        expected = "aDcCeWReTG0"
        links = [
            f"https://www.youtube.com/watch?v={expected}&t=30",
            f"https://youtu.be/{expected}?t=30",
            f"https://www.youtube.com/shorts/{expected}",
            f"https://www.youtube.com/embed/{expected}",
            expected,
        ]

        self.assertEqual([youtube_video_id(link) for link in links], [expected] * 5)
        self.assertIsNone(youtube_video_id("https://example.com/not-youtube"))

    def test_parse_json_output_ignores_progress_logs(self):
        value = {
            "videoId": "abc",
            "segments": [{"text": "last nested object", "start": 1, "duration": 2}],
        }
        output = "download {not json}\nprogress\n" + json.dumps(value, indent=2)
        parsed = parse_json_output(output)
        self.assertEqual(parsed["videoId"], "abc")
        self.assertEqual(len(parsed["segments"]), 1)

    def test_ocr_can_be_primary_transcript(self):
        metadata = {"videoId": "abc", "title": "Title"}
        ocr = {
            "videoId": "abc",
            "language": "ko",
            "segments": [{"text": "장소 이름", "start": 3, "duration": 2}],
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            value = write_primary_transcript(
                Path(temp_dir),
                metadata,
                {"error": "no captions"},
                {"error": "no audio"},
                ocr,
            )
            video = value["videos"][0]
            self.assertEqual(video["source"], "ocr_frames")
            self.assertFalse(video["approved"])
            self.assertEqual(video["segments"][0]["start"], 3.0)

    def test_reviewed_transcript_takes_precedence_for_location_evidence(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            raw = {"videoId": "abc", "segments": [{"text": "권성중", "start": 0}]}
            reviewed = {"videos": [{"videoId": "abc", "segments": [{"text": "권성준", "start": 0}]}]}
            (workspace / "captions.json").write_text(
                json.dumps(raw, ensure_ascii=False), encoding="utf-8"
            )
            (workspace / "transcripts.reviewed.json").write_text(
                json.dumps(reviewed, ensure_ascii=False), encoding="utf-8"
            )

            evidence, paths = load_evidence(workspace, "abc")

        self.assertEqual(evidence["captions"]["segments"][0]["text"], "권성준")
        self.assertEqual({path.name for path in paths}, {"captions.json", "transcripts.reviewed.json"})

    def test_accepted_correction_updates_missing_cleaned_text(self):
        source = {
            "videos": [
                {
                    "videoId": "abc",
                    "segments": [{"text": "권성중", "start": 0, "duration": 1}],
                    "fullText": "권성중입니다",
                }
            ]
        }
        review = {
            "videos": {
                "abc": {
                    "corrections": [
                        {
                            "segmentIndex": 0,
                            "originalText": "권성중",
                            "correctedText": "권성준",
                            "confidence": "high",
                            "decision": "accept",
                        }
                    ]
                }
            }
        }

        reviewed = update_reviewed_transcript(source, review, "none")

        video = reviewed["videos"][0]
        self.assertEqual(video["segments"][0]["text"], "권성준")
        self.assertEqual(video["cleanedText"], "권성준입니다")

    def test_location_merge_keeps_pending_decision(self):
        metadata = {"videoId": "abc", "title": "Title"}
        first = {
            "concept": "Tokyo food",
            "geographicScope": "Tokyo",
            "locations": [
                {
                    "name": "가게 A",
                    "aliases": [],
                    "category": "restaurant",
                    "area": "Tokyo",
                    "evidence": [{"source": "captions", "quote": "가게 A", "startSeconds": 10}],
                    "description": "영상에서 방문한 라멘 전문점이다.",
                    "reason": "visited",
                    "confidence": "medium",
                    "needsVerification": False,
                }
            ],
            "issues": [],
            "window": {"startSeconds": 0, "endSeconds": 100},
        }
        second = json.loads(json.dumps(first, ensure_ascii=False))
        second["locations"][0]["confidence"] = "high"
        second["locations"][0]["evidence"][0]["source"] = "audio"

        merged = merge_results(metadata, "sha", [first, second])

        self.assertEqual(len(merged["locations"]), 1)
        self.assertEqual(merged["locations"][0]["confidence"], "high")
        self.assertEqual(merged["locations"][0]["decision"], "pending")
        self.assertEqual(len(merged["locations"][0]["evidence"]), 2)

    def test_artifacts_are_gzipped_and_raw_media_is_ignored(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_dir = Path(temp_dir)
            (run_dir / "metadata.json").write_text('{"videoId":"abc"}', encoding="utf-8")
            (run_dir / "audio.wav").write_bytes(b"raw")
            entries = artifact_entries(run_dir, "bucket", "region", "prefix")

        self.assertEqual([entry["file"] for entry in entries], ["metadata.json"])
        self.assertEqual(entries[0]["contentEncoding"], "gzip")
        manifest = manifest_value("playlist", "abc", "run", "bucket", "region", "prefix", entries)
        self.assertNotIn("body", manifest["artifacts"][0])
        self.assertEqual(manifest["reviewStatus"], "pending")

    def test_codex_environment_removes_ingest_credentials(self):
        previous = dict(os.environ)
        try:
            os.environ["AWS_ACCESS_KEY_ID"] = "secret"
            os.environ["SUNREI_ADMIN_TOKEN"] = "secret"
            os.environ["PATH"] = "/bin"
            env = sanitized_environment()
        finally:
            os.environ.clear()
            os.environ.update(previous)

        self.assertNotIn("AWS_ACCESS_KEY_ID", env)
        self.assertNotIn("SUNREI_ADMIN_TOKEN", env)
        self.assertEqual(env["PATH"], "/bin")


if __name__ == "__main__":
    unittest.main()
