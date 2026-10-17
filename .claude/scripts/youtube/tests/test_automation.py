import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from claude_headless import claude_environment
from codex_headless import parse_final_response, scrubbed_environment
import structured_agent
from _common import jwt_is_usable, load_google_api_key
from evidence_timeline import build_timeline, ensure_timeline
from extract_locations_headless import merge_results, timeline_window
from collection_api import CollectionApi
import renew_playlists
from renew_playlists import (
    MembersOnlyVideo,
    first_timestamp,
    is_members_only,
    parse_json_output,
    place_inputs,
    processing_order,
    reset_stale_processing,
    run_video,
    store_evidence_texts,
    write_primary_transcript,
)
from review_transcripts import update_reviewed_transcript
from youtube_data import duration_seconds, video_inputs


class RenewalTests(unittest.TestCase):
    def test_youtube_api_key_prefers_environment(self):
        previous = os.environ.get("YOUTUBE_API_KEY")
        try:
            os.environ["YOUTUBE_API_KEY"] = "from-environment"
            self.assertEqual(load_google_api_key(), "from-environment")
        finally:
            if previous is None:
                os.environ.pop("YOUTUBE_API_KEY", None)
            else:
                os.environ["YOUTUBE_API_KEY"] = previous

    def test_expired_admin_token_is_not_reused(self):
        import base64

        payload = base64.urlsafe_b64encode(b'{"exp":1}').rstrip(b"=").decode()
        self.assertFalse(jwt_is_usable(f"header.{payload}.signature"))

    def test_processing_order_puts_new_videos_before_failures(self):
        videos = [
            {"id": "failed", "status": "FAILED"},
            {"id": "first", "status": "PENDING"},
            {"id": "second", "status": "PENDING"},
        ]

        self.assertEqual([video["id"] for video in processing_order(videos)], ["first", "second", "failed"])

    def test_stale_processing_videos_are_reset_to_failed(self):
        updates = []

        class FakeApi:
            def list_videos(self, playlist_id=None, status=None):
                return [
                    {"id": "stale", "stage": "extraction", "updatedAt": "2020-01-01T00:00:00Z"},
                    {"id": "running", "stage": "evidence", "updatedAt": "2999-01-01T00:00:00.123Z"},
                ]

            def update_video(self, video_id, **fields):
                updates.append((video_id, fields))

        reset_stale_processing(FakeApi(), "playlist", 24)

        self.assertEqual(updates, [("stale", {"status": "FAILED", "error": "interrupted during extraction"})])

    def test_duration_and_video_inputs_follow_the_sync_api(self):
        self.assertEqual(duration_seconds("PT1H2M3S"), 3723)
        self.assertEqual(duration_seconds("P1DT1S"), 86401)
        self.assertIsNone(duration_seconds(""))
        remote = {"videos": [{"videoId": "abc", "title": "T" * 300, "position": 4, "channelName": "Ch"}]}
        details = {"abc": {"duration": "PT10M", "publishedAt": "2026-01-01T00:00:00Z", "thumbnailUrl": "u"}}

        [video] = video_inputs(remote, details)
        self.assertEqual(video["id"], "abc")
        self.assertEqual(len(video["title"]), 255)
        self.assertEqual(video["durationSeconds"], 600)
        self.assertEqual(video["channelTitle"], "Ch")
        self.assertEqual(video["position"], 4)

    def test_evidence_texts_are_stored_and_failures_become_attempts(self):
        calls = []

        class FakeApi:
            def create_text(self, video_id, kind, **fields):
                calls.append(("text", kind, fields))
                return {"id": f"YT-{kind}"}

            def update_video(self, video_id, **fields):
                calls.append(("attempt", fields["stage"], fields["error"]))

        evidence = {
            "captions": {"videoId": "abc", "error": "Sign in to confirm you're not a bot"},
            "audio": {
                "videoId": "abc",
                "language": "ko",
                "segments": [{"text": "안녕", "start": 1.5, "end": 3.0}],
            },
            "onscreen": {"videoId": "abc", "error": "disabled"},
        }

        ids = store_evidence_texts(FakeApi(), "abc", evidence, {"whisperModel": "small"})

        self.assertEqual(ids, ["YT-WHISPER"])
        self.assertEqual(calls[0], ("attempt", "captions", "Sign in to confirm you're not a bot"))
        _, kind, fields = calls[1]
        self.assertEqual(kind, "WHISPER")
        self.assertEqual(fields["segments"], [{"start": 1.5, "end": 3.0, "text": "안녕"}])
        self.assertEqual(fields["params"]["model"], "small")
        self.assertEqual(fields["payload"], {"videoId": "abc", "language": "ko"})
        self.assertEqual(len(calls), 2)

    def test_place_inputs_map_candidates_without_a_geocoding_key(self):
        candidates = {
            "locations": [
                {
                    "name": "Il San Pietro",
                    "aliases": ["산 피에트로"],
                    "category": "hotel",
                    "area": "Positano",
                    "description": "설명",
                    "reason": "자막과 OCR이 일치",
                    "confidence": "high",
                    "needsVerification": False,
                    "evidence": [
                        {"source": "title", "quote": "Il San Pietro", "startSeconds": 0},
                        {"source": "ocr", "quote": "IL SAN PIETRO", "startSeconds": 95.4},
                        {"source": "whisper", "quote": "산 피에트로", "startSeconds": 80.2},
                    ],
                }
            ]
        }

        [place] = place_inputs(candidates, None)
        self.assertEqual(place["confidence"], "HIGH")
        self.assertEqual(place["timestampSeconds"], 80)
        self.assertIsNone(place["place"])
        self.assertIn("geocode skipped", place["geocodeWarning"])
        self.assertIsNone(first_timestamp([{"source": "description", "quote": "x", "startSeconds": 0}]))

    def test_collection_api_reuses_a_token_until_it_nears_expiry(self):
        import base64
        import time

        def token(expires_in):
            payload = json.dumps({"exp": int(time.time()) + expires_in}).encode()
            return "h." + base64.urlsafe_b64encode(payload).rstrip(b"=").decode() + ".s"

        minted = [token(3600), token(7200)]
        api = CollectionApi(base_url="http://example.invalid", token_provider=lambda: minted.pop(0))
        first = api._token()
        self.assertEqual(api._token(), first)
        api.token = token(60)
        self.assertNotEqual(api._token(), first)
        self.assertEqual(minted, [])

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

    def test_evidence_timeline_combines_and_orders_sources(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            files = {
                "metadata.json": {"videoId": "abc", "title": "Title"},
                "captions.json": {
                    "videoId": "abc",
                    "segments": [{"text": "권성중", "start": 10, "duration": 2}],
                },
                "transcripts.reviewed.json": {
                    "videos": [
                        {
                            "videoId": "abc",
                            "language": "ko",
                            "segments": [{"text": "권성준", "start": 10, "duration": 2}],
                        }
                    ]
                },
                "audio_transcript.json": {
                    "videoId": "abc",
                    "language": "ko",
                    "segments": [{"text": "오디오", "start": 5, "duration": 2}],
                },
                "onscreen_text.json": {
                    "videoId": "abc",
                    "language": "ko",
                    "segments": [{"text": "간판", "start": 7, "duration": 1}],
                },
            }
            for file_name, value in files.items():
                (workspace / file_name).write_text(
                    json.dumps(value, ensure_ascii=False), encoding="utf-8"
                )

            timeline = build_timeline(workspace, "abc")
            cached, output = ensure_timeline(workspace, "abc")

        self.assertEqual(
            [(event["source"], event["text"]) for event in timeline["events"]],
            [("whisper", "오디오"), ("ocr", "간판"), ("transcript", "권성준")],
        )
        self.assertEqual(timeline["sources"]["transcript"]["file"], "transcripts.reviewed.json")
        self.assertEqual(cached["inputFingerprint"], timeline["inputFingerprint"])
        self.assertEqual(output.name, "evidence_timeline.json")
        self.assertEqual(
            [event["text"] for event in timeline_window(timeline, 6, 8)],
            ["오디오", "간판"],
        )

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

    def test_codex_environment_removes_ingest_credentials(self):
        previous = dict(os.environ)
        try:
            os.environ["AWS_ACCESS_KEY_ID"] = "secret"
            os.environ["SUNREI_ADMIN_TOKEN"] = "secret"
            os.environ["PATH"] = "/bin"
            with scrubbed_environment():
                env = dict(os.environ)
            restored = dict(os.environ)
        finally:
            os.environ.clear()
            os.environ.update(previous)

        self.assertNotIn("AWS_ACCESS_KEY_ID", env)
        self.assertNotIn("SUNREI_ADMIN_TOKEN", env)
        self.assertEqual(env["PATH"], "/bin")
        self.assertEqual(restored["AWS_ACCESS_KEY_ID"], "secret")

    def test_codex_final_response_accepts_fenced_json(self):
        self.assertEqual(parse_final_response('```json\n{"locations": []}\n```'), {"locations": []})
        with self.assertRaises(RuntimeError):
            parse_final_response("[]")


    def test_claude_environment_keeps_only_the_subscription_token(self):
        previous = dict(os.environ)
        try:
            os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = "subscription"
            os.environ["ANTHROPIC_API_KEY"] = "secret"
            os.environ["AUTH_JWT_SECRET"] = "secret"
            os.environ["PATH"] = "/bin"
            env = claude_environment()
        finally:
            os.environ.clear()
            os.environ.update(previous)

        self.assertEqual(env["CLAUDE_CODE_OAUTH_TOKEN"], "subscription")
        self.assertNotIn("ANTHROPIC_API_KEY", env)
        self.assertNotIn("AUTH_JWT_SECRET", env)
        self.assertEqual(env["PATH"], "/bin")

    def test_structured_agent_falls_back_to_the_next_provider(self):
        def limited(*args, **kwargs):
            raise RuntimeError("usage limit")

        previous = dict(structured_agent.PROVIDERS)
        try:
            structured_agent.PROVIDERS["codex"] = limited
            structured_agent.PROVIDERS["claude"] = lambda *args, **kwargs: {"locations": []}
            value = structured_agent.run_structured("prompt", "schema.json")
        finally:
            structured_agent.PROVIDERS.update(previous)

        self.assertEqual(value, {"locations": [], "agent": "claude"})

    # 실제 멤버십 전용 영상(1qGquB04pus)을 수집하다 기록된 오류 문구 그대로다.
    MEMBERS_ONLY_DOWNLOAD = (
        "ERROR: [youtube] 1qGquB04pus: Join this channel to get access to "
        "members-only content like this video, and other exclusive perks."
    )
    MEMBERS_ONLY_CAPTIONS = (
        "\nCould not retrieve a transcript for the video https://www.youtube.com/watch?v=1qGquB04pus! "
        "This is most likely caused by:\n\nThe video is unplayable for the following reason: "
        "Join this channel to get access to members-only content like this video, and other exclusive perks."
    )

    def members_only_evidence(self, **overrides):
        evidence = {
            "captions": {"videoId": "abc", "error": self.MEMBERS_ONLY_CAPTIONS},
            "audio": {"videoId": "abc", "error": self.MEMBERS_ONLY_DOWNLOAD},
            "onscreen": {"videoId": "abc", "error": self.MEMBERS_ONLY_DOWNLOAD},
        }
        evidence.update(overrides)
        return evidence

    def test_members_only_needs_every_download_refused_and_no_segments(self):
        self.assertTrue(is_members_only(self.members_only_evidence()))
        self.assertTrue(
            is_members_only(self.members_only_evidence(captions={"videoId": "abc", "error": "no_transcript_available"}))
        )
        self.assertTrue(is_members_only(self.members_only_evidence(onscreen={"videoId": "abc", "error": "disabled"})))

        usable = {"videoId": "abc", "language": "ko", "segments": [{"text": "간판", "start": 3, "duration": 1}]}
        self.assertFalse(is_members_only(self.members_only_evidence(onscreen=usable)))
        self.assertFalse(
            is_members_only(self.members_only_evidence(onscreen={"videoId": "abc", "error": "Command timed out"}))
        )
        self.assertFalse(
            is_members_only(
                self.members_only_evidence(
                    audio={"videoId": "abc", "error": "ERROR: Sign in to confirm you're not a bot"},
                    onscreen={"videoId": "abc", "error": "ERROR: Sign in to confirm you're not a bot"},
                )
            )
        )
        self.assertFalse(
            is_members_only(
                self.members_only_evidence(
                    audio={"videoId": "abc", "error": "disabled"},
                    onscreen={"videoId": "abc", "error": "disabled"},
                )
            )
        )

    def test_members_only_video_stops_before_the_transcript_and_is_stored_as_skipped(self):
        updates = []

        class FakeApi:
            def update_video(self, video_id, **fields):
                updates.append((video_id, fields))

            def create_text(self, video_id, kind, **fields):
                raise AssertionError("no text should be stored for a members-only video")

        config = {"defaults": {"evidence": {"captions": True, "audio": True, "videoOcr": True}}}
        playlist = {"id": "PL", "title": "Playlist"}
        video = {"id": "abc", "title": "Members only", "status": "PENDING"}
        previous = (renew_playlists.collect_evidence, renew_playlists.RUNS_ROOT)
        with tempfile.TemporaryDirectory() as temp_dir:
            renew_playlists.RUNS_ROOT = Path(temp_dir)
            renew_playlists.collect_evidence = lambda run_dir, metadata, evidence_config: self.members_only_evidence()
            try:
                outcome = run_video(FakeApi(), config, playlist, video, {}, None)
            finally:
                renew_playlists.collect_evidence, renew_playlists.RUNS_ROOT = previous
            self.assertFalse((Path(temp_dir) / "abc").exists())

        self.assertEqual(outcome, "skipped")
        self.assertEqual(updates[0], ("abc", {"stage": "evidence", "status": "PROCESSING", "error": ""}))
        last_video_id, last = updates[-1]
        self.assertEqual((last_video_id, last["status"], last["stage"]), ("abc", "SKIPPED", "evidence"))
        self.assertIn("members-only", last["error"])
        self.assertNotIn("FAILED", [fields.get("status") for _, fields in updates])

    def test_other_failures_are_still_stored_as_failed(self):
        updates = []

        class FakeApi:
            def update_video(self, video_id, **fields):
                updates.append((video_id, fields))

        def failing(api, config, playlist, video, item, api_key, progress):
            progress["stage"] = "extraction"
            raise RuntimeError("codex turn timed out after 900s")

        previous = renew_playlists.process_video
        renew_playlists.process_video = failing
        try:
            outcome = run_video(FakeApi(), {}, {"id": "PL"}, {"id": "abc"}, {}, None)
        finally:
            renew_playlists.process_video = previous

        self.assertEqual(outcome, "failed")
        self.assertEqual(
            updates,
            [("abc", {"status": "FAILED", "stage": "extraction", "error": "codex turn timed out after 900s"})],
        )
        self.assertTrue(issubclass(MembersOnlyVideo, RuntimeError))


if __name__ == "__main__":
    unittest.main()
