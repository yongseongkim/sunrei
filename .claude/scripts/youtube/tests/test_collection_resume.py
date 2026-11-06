"""Offline tests for reconciling collection POSTs against fresh video detail."""

import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from collection_api import CollectionApi, workflow_write_key


class MemoryTransport:
    def __init__(self):
        self.calls = []
        self.posts = []
        self.get_count = 0
        self.fail_gets = set()
        self.lose_next_post = False
        self.store_lost_post = True
        self.detail = {"video": {"id": "video-1"}, "texts": [], "runs": []}

    def __call__(self, method, path, body=None, **kwargs):
        self.calls.append((method, path, copy.deepcopy(body)))
        if method == "GET":
            self.get_count += 1
            if self.get_count in self.fail_gets:
                raise RuntimeError("verification unavailable")
            return copy.deepcopy(self.detail)
        if method != "POST":
            raise AssertionError(f"Unexpected offline request: {method} {path}")
        self.posts.append(copy.deepcopy(body))
        collection = "texts" if path.endswith("/texts") else "runs"
        record = {**copy.deepcopy(body), "id": f"stored-{len(self.posts)}", "videoId": "video-1"}
        if collection == "texts":
            record["segmentCount"] = len(record.pop("segments", []))
        lost = self.lose_next_post
        self.lose_next_post = False
        if not lost or self.store_lost_post:
            self.detail[collection].insert(0, copy.deepcopy(record))
        if lost:
            raise RuntimeError("POST response lost")
        return record


class CollectionResumeTests(unittest.TestCase):
    def setUp(self):
        self.make_api()
        self.text_fields = {
            "segments": [{"start": 1, "end": 2, "text": "원문"}],
            "language": "ko",
            "full_text": "원문",
            "payload": {"videoId": "video-1", "source": "whisper"},
            "params": {"model": "small", "settings": {"language": "ko", "task": "transcribe"}},
        }
        self.run_body = {
            "agent": "codex",
            "model": "review-model",
            "status": "SUCCEEDED",
            "promptSha256": "prompt-sha",
            "inputTextIds": ["text-1"],
            "rawOutput": json.dumps({"locations": [{"name": "A venue"}], "concept": "A visit"}),
            "startedAt": "2026-11-06T00:00:00Z",
            "finishedAt": "2026-11-06T00:01:00Z",
            "places": [{"name": "A venue", "description": "Introduced in the video"}],
        }

    def make_api(self, resume_writes=True):
        self.transport = MemoryTransport()
        self.api = CollectionApi(
            "http://fixture.invalid", token_provider=lambda: self.fail("No token is needed offline"),
            resume_writes=resume_writes,
        )
        self.api.request = Mock(side_effect=self.transport)

    def create(self, resource):
        if resource == "text":
            return self.api.create_text("video-1", "WHISPER", **self.text_fields)
        return self.api.create_extraction_run("video-1", self.run_body)

    def test_get_video_fetches_fresh_detail_on_every_call(self):
        self.api.get_video("video-1")
        self.api.get_video("video-1")
        self.assertEqual(self.transport.get_count, 2)
        self.assertEqual(
            [call[:2] for call in self.transport.calls],
            [("GET", "/admin/youtube/videos/video-1")] * 2,
        )

    def test_lost_post_response_is_reconciled_then_explicit_retry_reuses_the_id(self):
        for resource in ("text", "run"):
            with self.subTest(resource=resource):
                self.make_api()
                self.transport.lose_next_post = True

                recovered = self.create(resource)
                retried = self.create(resource)

                self.assertEqual(recovered["id"], "stored-1")
                self.assertEqual(retried["id"], recovered["id"])
                self.assertEqual([call[0] for call in self.transport.calls], ["GET", "POST", "GET", "GET"])
                self.assertEqual(len(self.transport.posts), 1)

    def test_unconfirmed_post_error_is_rethrown_without_automatic_retry(self):
        for resource in ("text", "run"):
            with self.subTest(resource=resource):
                self.make_api()
                self.transport.lose_next_post = True
                self.transport.store_lost_post = False

                with self.assertRaisesRegex(RuntimeError, "POST response lost"):
                    self.create(resource)

                self.assertEqual([call[0] for call in self.transport.calls], ["GET", "POST", "GET"])
                self.assertEqual(len(self.transport.posts), 1)

    def test_unavailable_preflight_verification_never_posts(self):
        for resource in ("text", "run"):
            with self.subTest(resource=resource):
                self.make_api()
                self.transport.fail_gets = {1, 2}

                for _ in range(2):
                    with self.assertRaisesRegex(RuntimeError, "verification unavailable"):
                        self.create(resource)

                self.assertEqual(len(self.transport.posts), 0)

    def test_unavailable_verification_after_commit_and_on_retry_never_duplicates(self):
        for resource in ("text", "run"):
            with self.subTest(resource=resource):
                self.make_api()
                self.transport.lose_next_post = True
                self.transport.fail_gets = {2, 3}

                with self.assertRaisesRegex(RuntimeError, "verification unavailable"):
                    self.create(resource)
                with self.assertRaisesRegex(RuntimeError, "verification unavailable"):
                    self.create(resource)
                recovered = self.create(resource)

                self.assertEqual(recovered["id"], "stored-1")
                self.assertEqual(len(self.transport.posts), 1)
                self.assertEqual(self.transport.get_count, 4)

    def test_unchanged_text_reuses_the_summary_id_with_no_segments_fetch(self):
        original = copy.deepcopy(self.text_fields)
        first = self.create("text")
        second = self.create("text")

        self.assertEqual(first, second)
        self.assertNotIn("segments", second)
        self.assertEqual(len(self.transport.posts), 1)
        self.assertEqual(self.text_fields, original)
        stored = self.transport.posts[0]
        marker = json.loads(stored["params"])["workflowWriteKey"]
        self.assertRegex(marker, r"^[0-9a-f]{64}$")
        self.assertEqual(marker, workflow_write_key(stored, "params", "workflowWriteKey"))

    def test_json_object_order_and_existing_marker_do_not_change_text_identity(self):
        first = self.create("text")
        self.text_fields["payload"] = {"source": "whisper", "videoId": "video-1"}
        self.text_fields["params"] = {
            "settings": {"task": "transcribe", "language": "ko"},
            "model": "small",
            "workflowWriteKey": "a caller-supplied stale marker",
        }

        self.assertEqual(self.create("text")["id"], first["id"])
        self.assertEqual(len(self.transport.posts), 1)

    def test_changed_text_body_creates_a_new_resource(self):
        first = self.create("text")
        self.text_fields["segments"][0]["text"] = "새 원문"

        second = self.create("text")

        self.assertNotEqual(first["id"], second["id"])
        markers = [json.loads(body["params"])["workflowWriteKey"] for body in self.transport.posts]
        self.assertEqual(len(markers), 2)
        self.assertNotEqual(*markers)

    def test_text_without_settings_gets_a_marker_without_mutating_the_caller(self):
        self.text_fields["params"] = None
        self.create("text")
        self.create("text")
        self.assertEqual(len(self.transport.posts), 1)
        self.assertEqual(set(json.loads(self.transport.posts[0]["params"])), {"workflowWriteKey"})
        self.assertIsNone(self.text_fields["params"])

    def test_successful_run_reuses_identity_while_ignoring_only_execution_timestamps(self):
        original = copy.deepcopy(self.run_body)
        first = self.create("run")
        self.assertEqual(self.run_body, original)
        self.run_body["startedAt"] = "2026-11-06T03:00:00Z"
        self.run_body["finishedAt"] = "2026-11-06T03:01:00Z"
        # JSON formatting, property order and an incoming marker are not new content.
        self.run_body["rawOutput"] = json.dumps({
            "_workflowWriteKey": "stale marker",
            "concept": "A visit",
            "locations": [{"name": "A venue"}],
        }, indent=2)

        second = self.create("run")

        self.assertEqual(second["id"], first["id"])
        self.assertEqual(len(self.transport.posts), 1)
        stored = self.transport.posts[0]
        marker = json.loads(stored["rawOutput"])["_workflowWriteKey"]
        self.assertRegex(marker, r"^[0-9a-f]{64}$")
        self.assertEqual(marker, workflow_write_key(
            stored, "rawOutput", "_workflowWriteKey", ("startedAt", "finishedAt"),
        ))

    def test_changed_run_places_or_raw_output_create_new_resources(self):
        first = self.create("run")
        self.run_body["places"][0]["description"] = "Updated source evidence"
        second = self.create("run")
        self.run_body["rawOutput"] = json.dumps({"locations": [{"name": "A different venue"}]})
        third = self.create("run")
        self.assertEqual(len({first["id"], second["id"], third["id"]}), 3)
        self.assertEqual(len(self.transport.posts), 3)

    def test_failed_runs_preserve_normal_post_behavior(self):
        self.run_body.update({"status": "FAILED", "rawOutput": None, "error": "Agent unavailable"})
        original = copy.deepcopy(self.run_body)
        self.create("run")
        self.create("run")
        self.assertEqual(self.transport.posts, [original, original])
        self.assertEqual(self.transport.get_count, 0)

    def test_malformed_video_detail_fails_closed(self):
        for resource, collection in (("text", "texts"), ("run", "runs")):
            with self.subTest(resource=resource):
                self.make_api()
                del self.transport.detail[collection]
                with self.assertRaisesRegex(RuntimeError, "invalid video detail"):
                    self.create(resource)
                self.assertEqual(len(self.transport.posts), 0)

    def test_malformed_stored_marker_document_fails_closed(self):
        for resource, collection, field in (("text", "texts", "params"), ("run", "runs", "rawOutput")):
            with self.subTest(resource=resource):
                self.make_api()
                self.transport.detail[collection] = [{"id": "old-id", field: "invalid JSON"}]
                with self.assertRaisesRegex(RuntimeError, "invalid .* JSON"):
                    self.create(resource)
                self.assertEqual(len(self.transport.posts), 0)

    def test_matching_record_without_id_fails_closed(self):
        for resource, collection in (("text", "texts"), ("run", "runs")):
            with self.subTest(resource=resource):
                self.make_api()
                self.create(resource)
                del self.transport.detail[collection][0]["id"]
                with self.assertRaisesRegex(RuntimeError, "no ID"):
                    self.create(resource)
                self.assertEqual(len(self.transport.posts), 1)

    def test_disabled_resume_keeps_legacy_bodies_and_does_not_verify(self):
        self.make_api(resume_writes=False)
        self.create("text")
        original = copy.deepcopy(self.run_body)
        self.create("run")
        self.assertEqual(self.transport.get_count, 0)
        self.assertEqual(json.loads(self.transport.posts[0]["params"]), self.text_fields["params"])
        self.assertEqual(self.transport.posts[1], original)
        self.assertEqual(self.run_body, original)
        self.assertNotIn("workflowWriteKey", self.transport.posts[0]["params"])
        self.assertNotIn("_workflowWriteKey", self.transport.posts[1]["rawOutput"])

    def test_disabled_resume_does_not_reconcile_a_lost_response(self):
        self.make_api(resume_writes=False)
        self.transport.lose_next_post = True
        with self.assertRaisesRegex(RuntimeError, "POST response lost"):
            self.create("text")
        self.assertEqual([call[0] for call in self.transport.calls], ["POST"])


if __name__ == "__main__":
    unittest.main()
