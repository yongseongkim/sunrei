import json
import sys
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from creator_comments import collect_creator_comments, model_creator_comments
from extract_locations_headless import extract, has_metadata_evidence, load_metadata, make_prompt


def comment(comment_id, author="owner", text="花の食堂 京都市中京区1-2", **fields):
    return {
        "id": comment_id,
        "snippet": {
            "authorChannelId": {"value": author},
            "authorDisplayName": "@creator",
            "textOriginal": text,
            "publishedAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-02T00:00:00Z",
            **fields,
        },
    }


def thread(top, *, replies=None, total=0):
    return {
        "id": f"thread-{top['id']}",
        "snippet": {"topLevelComment": top, "totalReplyCount": total},
        "replies": {"comments": replies or []},
    }


class CreatorCommentsTests(unittest.TestCase):
    def test_default_stdlib_transport_uses_data_api_and_classifies_disabled_comments(self):
        error_body = {"error": {"code": 403, "message": "Comments disabled", "errors": [{"reason": "commentsDisabled"}]}}
        with patch("creator_comments.http_json", return_value=(403, error_body)) as http:
            result = collect_creator_comments("video", "owner", "secret")

        self.assertEqual(result["status"], "disabled")
        method, url = http.call_args.args
        parsed = urllib.parse.urlparse(url)
        params = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(method, "GET")
        self.assertEqual(parsed.netloc, "www.googleapis.com")
        self.assertEqual(parsed.path, "/youtube/v3/commentThreads")
        self.assertEqual(params["videoId"], ["video"])
        self.assertEqual(params["key"], ["secret"])
        self.assertNotIn("secret", json.dumps(result))

    def test_threads_are_paginated_and_display_name_never_verifies_a_viewer(self):
        calls = []

        def fetch(resource, params):
            calls.append((resource, params.copy()))
            if params.get("pageToken") == "page-2":
                return {"items": [thread(comment("creator"))]}
            return {"items": [thread(comment("viewer", author="viewer"))], "nextPageToken": "page-2"}

        result = collect_creator_comments("video", "owner", "secret", fetch=fetch)

        self.assertEqual(result["status"], "complete")
        self.assertEqual([item["id"] for item in result["comments"]], ["creator"])
        self.assertEqual(result["coverage"]["threadPagesRead"], 2)
        self.assertEqual(result["coverage"]["commentsInspected"], 2)
        self.assertEqual(calls[0][1]["part"], "snippet,replies")
        self.assertEqual(calls[0][1]["order"], "relevance")
        self.assertEqual(calls[1][1]["pageToken"], "page-2")
        self.assertNotIn("key", calls[0][1])
        [item] = result["comments"]
        self.assertEqual(item["authorChannelId"], "owner")
        self.assertEqual(item["textOriginal"], "花の食堂 京都市中京区1-2")
        self.assertEqual(item["permalink"], "https://www.youtube.com/watch?v=video&lc=creator")
        self.assertEqual(item["updatedAt"], "2026-01-02T00:00:00Z")
        self.assertIsNone(item["sceneSeconds"])
        self.assertNotIn("pinned", item)

    def test_incomplete_inline_replies_trigger_full_reply_pagination(self):
        calls = []
        inline = comment("reply-1", author="viewer")

        def fetch(resource, params):
            calls.append((resource, params.copy()))
            if resource == "commentThreads":
                return {"items": [thread(comment("top", author="viewer"), replies=[inline], total=3)]}
            if params.get("pageToken") == "reply-page-2":
                return {"items": [comment("reply-3")]}
            return {"items": [inline, comment("reply-2", author="viewer")], "nextPageToken": "reply-page-2"}

        result = collect_creator_comments("video", "owner", "secret", fetch=fetch)

        self.assertEqual(result["status"], "complete")
        self.assertEqual([item["id"] for item in result["comments"]], ["reply-3"])
        self.assertEqual(result["comments"][0]["parentId"], "top")
        self.assertEqual(result["coverage"]["commentsInspected"], 4)
        self.assertEqual(result["coverage"]["replyPagesRead"], 2)
        self.assertTrue(result["coverage"]["replyThreads"][0]["complete"])
        self.assertEqual(calls[1][1]["parentId"], "top")
        self.assertEqual(calls[2][1]["pageToken"], "reply-page-2")

    def test_complete_inline_replies_do_not_fetch_again(self):
        calls = []

        def fetch(resource, params):
            calls.append(resource)
            return {"items": [thread(comment("top", author="viewer"), replies=[comment("reply")], total=1)]}

        result = collect_creator_comments("video", "owner", "secret", fetch=fetch)

        self.assertEqual(result["status"], "complete")
        self.assertEqual(calls, ["commentThreads"])
        self.assertEqual(result["coverage"]["replyPagesRead"], 0)

    def test_thread_page_limit_is_explicit_partial_coverage(self):
        result = collect_creator_comments(
            "video", "owner", "secret", max_thread_pages=1,
            fetch=lambda resource, params: {"items": [thread(comment("creator"))], "nextPageToken": "remaining"},
        )

        self.assertEqual(result["status"], "partial")
        self.assertFalse(result["coverage"]["complete"])
        self.assertFalse(result["coverage"]["threadsExhausted"])
        self.assertEqual(result["coverage"]["nextThreadPageToken"], "remaining")
        self.assertEqual(result["coverage"]["threadPagesLimit"], 1)

    def test_reply_page_limit_preserves_unread_reply_token(self):
        def fetch(resource, params):
            if resource == "commentThreads":
                return {"items": [thread(comment("top"), total=3)]}
            return {"items": [comment("reply")], "nextPageToken": "remaining-replies"}

        result = collect_creator_comments("video", "owner", "secret", fetch=fetch, max_reply_pages=1)

        self.assertEqual(result["status"], "partial")
        self.assertTrue(result["coverage"]["threadsExhausted"])
        [replies] = result["coverage"]["replyThreads"]
        self.assertFalse(replies["complete"])
        self.assertEqual(replies["nextPageToken"], "remaining-replies")

    def test_disabled_comments_are_distinct_from_exhausted_empty_comments(self):
        result = collect_creator_comments(
            "video", "owner", "secret",
            fetch=lambda resource, params: {"error": {"code": 403, "message": "Comments disabled", "errors": [{"reason": "commentsDisabled"}]}},
        )

        self.assertEqual(result["status"], "disabled")
        self.assertEqual(result["coverage"]["threadPagesRead"], 0)
        self.assertFalse(result["coverage"]["complete"])
        empty = collect_creator_comments("video", "owner", "secret", fetch=lambda resource, params: {"items": []})
        self.assertEqual(empty["status"], "complete")
        self.assertTrue(empty["coverage"]["complete"])

    def test_fetch_failure_is_recorded_without_exposing_key(self):
        def fail(resource, params):
            raise OSError("Cannot reach endpoint key=secret")

        result = collect_creator_comments("video", "owner", "secret", fetch=fail)

        self.assertEqual(result["status"], "failed")
        self.assertIn("[redacted]", result["errors"][0]["message"])
        self.assertNotIn("secret", json.dumps(result))

    def test_reply_failure_keeps_existing_comments_but_marks_partial(self):
        def fetch(resource, params):
            if resource == "commentThreads":
                return {"items": [thread(comment("top"), total=2)]}
            raise RuntimeError("reply fetch unavailable")

        result = collect_creator_comments("video", "owner", "secret", fetch=fetch)

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["comments"][0]["id"], "top")
        self.assertFalse(result["coverage"]["replyThreads"][0]["complete"])
        self.assertEqual(result["errors"][0]["resource"], "comments")
        self.assertEqual(result["errors"][0]["parentId"], "top")

    def test_missing_owner_never_verifies_an_author_or_calls_api(self):
        def forbidden(resource, params):
            self.fail("Missing video owner must not contact YouTube")

        result = collect_creator_comments("video", "", "secret", fetch=forbidden)

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["errors"][0]["reason"], "missing_channel_id")
        self.assertEqual(result["comments"], [])

    def test_repeated_pagination_token_does_not_claim_exhaustion(self):
        result = collect_creator_comments(
            "video", "owner", "secret", max_thread_pages=None,
            fetch=lambda resource, params: {"items": [], "nextPageToken": "same"},
        )

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["coverage"]["threadPagesRead"], 2)
        self.assertEqual(result["errors"][0]["reason"], "repeated_page_token")

    def test_model_filters_viewers_gratitude_and_duplicates_without_losing_refs(self):
        raw = [comment("a"), comment("b"), comment("thanks", text="감사합니다 🙏"), comment("emoji", text="👏❤️"), comment("viewer", author="viewer", text="Wrong place")]
        envelope = collect_creator_comments("video", "owner", "secret", fetch=lambda resource, params: {"items": [thread(item) for item in raw]})
        envelope["comments"].append({"id": "forged", "authorChannelId": "viewer", "authorVerified": True, "textOriginal": "Wrong place"})

        model = model_creator_comments(envelope, "video", "owner")

        self.assertEqual(len(envelope["comments"]), 5)
        self.assertEqual(len(model["comments"]), 1)
        [item] = model["comments"]
        self.assertEqual([ref["id"] for ref in item["sourceRefs"]], ["a", "b"])
        self.assertIsNone(item["startSeconds"])
        self.assertEqual(item["source"], "author_comment")
        self.assertEqual(model["coverage"], envelope["coverage"])
        self.assertEqual(model_creator_comments(envelope, "other-video", "owner")["comments"], [])
        self.assertEqual(model_creator_comments(envelope, "video", "playlist-owner")["status"], "scope_mismatch")


class CreatorCommentExtractionTests(unittest.TestCase):
    def metadata(self):
        envelope = collect_creator_comments("video", "owner", "secret", fetch=lambda resource, params: {"items": [thread(comment("a"))]})
        return {"videoId": "video", "channelId": "owner", "creatorComments": envelope}

    def test_prompt_contains_verified_comments_refs_and_coverage_without_timing(self):
        metadata = self.metadata()
        prompt = make_prompt(metadata, {"events": [], "sources": {"ocr": {"status": "missing"}}}, 0, 0)
        payload = json.loads(prompt.split("\n## Input Data\n\n", 1)[1])

        [item] = payload["metadata"]["creatorComments"]["comments"]
        self.assertEqual(item["id"], "a")
        self.assertEqual(item["sourceRefs"][0]["authorChannelId"], "owner")
        self.assertTrue(payload["metadata"]["creatorComments"]["coverage"]["complete"])
        self.assertIsNone(payload["timeline"]["window"])
        self.assertTrue(payload["timeline"]["metadataOnly"])
        self.assertIsNone(item["startSeconds"])

    def test_metadata_only_evidence_runs_one_untimed_extraction(self):
        model_result = {"concept": "Trip", "geographicScope": "Kyoto", "locations": [], "issues": []}
        with patch("extract_locations_headless.run_structured", return_value=model_result) as run:
            results = extract(self.metadata(), {"events": [], "durationSeconds": 3600}, None, 30, 1200, 10)

        self.assertEqual(run.call_count, 1)
        self.assertIsNone(results[0]["window"]["startSeconds"])
        self.assertIsNone(results[0]["window"]["endSeconds"])
        self.assertTrue(has_metadata_evidence({"title": "교토 여행"}))
        self.assertTrue(has_metadata_evidence({"description": "花の食堂 소개"}))

    def test_empty_metadata_and_unverified_comments_do_not_trigger_extraction(self):
        metadata = self.metadata()
        metadata["channelId"] = "playlist-owner"
        with patch("extract_locations_headless.run_structured") as run:
            with self.assertRaises(ValueError):
                extract(metadata, {"events": []}, None, 30, 1200, 10)
        run.assert_not_called()
        self.assertFalse(has_metadata_evidence({"title": "   ", "description": "❤️"}))

    def test_sidecar_is_loaded_without_renaming_it_description_or_dialogue(self):
        with tempfile.TemporaryDirectory() as directory:
            ws = Path(directory)
            metadata = self.metadata()
            (ws / "metadata.json").write_text(json.dumps({"videoId": "video", "channelId": "owner"}))
            (ws / "creator_comments.json").write_text(json.dumps(metadata["creatorComments"]))
            loaded = load_metadata(ws)

        self.assertEqual(loaded["creatorComments"]["comments"][0]["id"], "a")
        self.assertNotIn("description", loaded)

    def test_evidence_schema_accepts_author_comments_with_unknown_scene_time(self):
        schema = json.loads((SCRIPT_DIR / "location_candidates.schema.json").read_text())
        evidence = schema["properties"]["locations"]["items"]["properties"]["evidence"]["items"]["properties"]
        self.assertIn("author_comment", evidence["source"]["enum"])
        self.assertIn("null", evidence["startSeconds"]["type"])


if __name__ == "__main__":
    unittest.main()
