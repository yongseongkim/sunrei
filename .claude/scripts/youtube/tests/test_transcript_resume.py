"""Offline resume tests: no agent, provider or network process is launched."""

import contextlib
import copy
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import review_transcripts as reviewer


class TranscriptResumeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.ws = Path(temporary.name)
        self.schema = self.ws / "review.schema.json"
        self.schema.write_bytes(reviewer.SCHEMA_FILE.read_bytes())
        self.policy_code = self.ws / "policy.py"
        self.policy_code.write_text("# Original policy implementation\n", encoding="utf-8")
        context = contextlib.ExitStack()
        self.addCleanup(context.close)
        context.enter_context(patch.object(reviewer, "SCHEMA_FILE", self.schema))
        context.enter_context(patch.object(
            reviewer, "REVIEW_CODE_FILES", (*reviewer.REVIEW_CODE_FILES, self.policy_code),
        ))
        context.enter_context(patch.dict(os.environ, {"STRUCTURED_AGENTS": "codex,claude"}))
        self.source = {"videos": [{
            "videoId": "video-1",
            "title": "A visit",
            "language": "ko",
            "source": "whisper",
            "segments": [
                {"text": f"원문 {index}", "start": index * 100, "duration": 2}
                for index in range(3)
            ],
        }]}
        self.put("transcripts.json", self.source)
        self.put("descriptions.json", {"video-1": {"description": "Visit evidence"}})

    def put(self, name, value):
        (self.ws / name).write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    def get(self, name="transcript_review.json"):
        return json.loads((self.ws / name).read_text(encoding="utf-8"))

    def proposal(self, prompt, model, timeout):
        payload = json.loads(prompt.split("Input:\n", 1)[1])
        target = next(segment for segment in payload["segments"] if segment["target"])
        return {"agent": "mock", "flags": [], "corrections": [{
            "segmentIndex": target["segmentIndex"],
            "originalText": target["text"],
            "correctedText": target["text"] + " 교정",
            "reason": "Corroborated transcription correction",
            "confidence": "high",
            "canonicalEntity": "",
        }]}

    def run_review(self, *extra, agent=None):
        argv = [
            "review_transcripts.py", str(self.ws), "--all", "--chunk-size", "1", "--context", "0",
            *extra,
        ]
        with patch.object(sys, "argv", argv), contextlib.redirect_stdout(io.StringIO()):
            with patch.object(reviewer, "run_agent", side_effect=agent or self.proposal) as mocked:
                reviewer.main()
        return mocked

    def decide(self, index, decision):
        review = self.get()
        review["videos"]["video-1"]["corrections"][index]["decision"] = decision
        self.put("transcript_review.json", review)

    def assert_pending_and_unapplied(self):
        corrections = self.get()["videos"]["video-1"]["corrections"]
        self.assertTrue(corrections)
        self.assertTrue(all(item["decision"] == "pending" for item in corrections))
        self.assertTrue(all(item["applied"] is False for item in corrections))
        self.assertEqual(self.get("transcripts.reviewed.json"), self.source)

    def test_unchanged_partial_review_only_retries_the_failed_chunk(self):
        self.source["videos"][0]["segments"] = self.source["videos"][0]["segments"][:2]
        self.put("transcripts.json", self.source)
        attempted = []

        def failing_agent(prompt, model, timeout):
            payload = json.loads(prompt.split("Input:\n", 1)[1])
            start = payload["targetRange"]["startInclusive"]
            attempted.append(start)
            if start == 1:
                raise RuntimeError("offline transient provider failure")
            return self.proposal(prompt, model, timeout)

        with self.assertRaisesRegex(RuntimeError, "transient"):
            self.run_review(agent=failing_agent)
        first = self.get()["videos"]["video-1"]
        self.assertEqual(attempted, [0, 1])
        self.assertEqual([c["startInclusive"] for c in first["processedChunks"]], [0])
        self.assertEqual(first["chunkHistory"][-1]["reason"], "agent_failed")
        self.decide(0, "accept")

        resumed = self.run_review()

        self.assertEqual(resumed.call_count, 1)
        payload = json.loads(resumed.call_args.args[0].split("Input:\n", 1)[1])
        self.assertEqual(payload["targetRange"]["startInclusive"], 1)
        current = self.get()["videos"]["video-1"]
        self.assertEqual(len(current["processedChunks"]), 2)
        self.assertEqual(current["processedChunks"][0], first["processedChunks"][0])
        self.assertEqual([c["decision"] for c in current["corrections"]], ["accept", "pending"])
        self.assertEqual(self.get("transcripts.reviewed.json")["videos"][0]["segments"][0]["text"], "원문 0 교정")

    def test_explicit_decisions_survive_rebuild_of_the_same_source(self):
        self.run_review()
        self.decide(1, "accept")
        self.decide(2, "reject")

        cached = self.run_review("--max-new-chunks", "0")

        cached.assert_not_called()
        entry = self.get()["videos"]["video-1"]
        self.assertEqual([c["decision"] for c in entry["corrections"]], ["pending", "accept", "reject"])
        self.assertNotIn("chunkHistory", entry)
        self.assertEqual(
            [s["text"] for s in self.get("transcripts.reviewed.json")["videos"][0]["segments"]],
            ["원문 0", "원문 1 교정", "원문 2"],
        )

    def test_prompt_change_invalidates_cached_chunks_before_a_zero_call_rebuild(self):
        self.run_review()
        self.decide(0, "accept")
        previous = self.get()["videos"]["video-1"]
        make_prompt = reviewer.make_prompt

        def changed_prompt(*args, **kwargs):
            return make_prompt(*args, **kwargs).replace(
                "Preserve the spoken meaning", "Preserve the evidenced spoken meaning",
            )

        with patch.object(reviewer, "make_prompt", side_effect=changed_prompt):
            self.run_review("--max-new-chunks", "0").assert_not_called()
            entry = self.get()["videos"]["video-1"]
            self.assertEqual(entry["processedChunks"], [])
            self.assertEqual(entry["corrections"], [])
            archived = entry["chunkHistory"][-1]
            self.assertEqual(archived["corrections"][0]["decision"], "accept")
            self.assertEqual(archived["processedChunks"], previous["processedChunks"])
            self.assertEqual(self.get("transcripts.reviewed.json"), self.source)
            self.assertEqual(self.run_review().call_count, 3)
        self.assert_pending_and_unapplied()

    def test_schema_change_requires_review_even_when_the_prompt_is_identical(self):
        self.run_review()
        previous = copy.deepcopy(self.get()["videos"]["video-1"]["processedChunks"])
        schema = json.loads(self.schema.read_text())
        schema["title"] = "Updated review output contract"
        self.schema.write_text(json.dumps(schema), encoding="utf-8")

        self.assertEqual(self.run_review().call_count, 3)

        current = self.get()["videos"]["video-1"]["processedChunks"]
        for old, new in zip(previous, current):
            self.assertEqual(old["promptSha256"], new["promptSha256"])
            self.assertNotEqual(old["policySha256"], new["policySha256"])
        self.assert_pending_and_unapplied()

    def test_code_policy_change_requires_review_even_when_the_prompt_is_identical(self):
        self.run_review()
        previous = self.get()["videos"]["video-1"]["processedChunks"][0]
        self.policy_code.write_text("# Updated validation policy\n", encoding="utf-8")

        self.assertEqual(self.run_review().call_count, 3)

        current = self.get()["videos"]["video-1"]["processedChunks"][0]
        self.assertEqual(previous["promptSha256"], current["promptSha256"])
        self.assertNotEqual(previous["policySha256"], current["policySha256"])
        self.assert_pending_and_unapplied()

    def test_model_and_provider_order_are_part_of_the_cache_identity(self):
        self.run_review("--model", "first-model")
        self.assertEqual(self.run_review("--model", "second-model").call_count, 3)
        self.run_review("--model", "second-model").assert_not_called()
        with patch.dict(os.environ, {"STRUCTURED_AGENTS": "claude,codex"}):
            self.assertEqual(self.run_review("--model", "second-model").call_count, 3)
        self.assert_pending_and_unapplied()

    def test_description_hints_and_auxiliary_context_invalidate_affected_chunks(self):
        self.run_review()
        self.put("descriptions.json", {"video-1": {"description": "Corrected description"}})
        self.assertEqual(self.run_review().call_count, 3)
        self.put("transcript_review_hints.json", {"videos": {"video-1": ["Verified name"]}})
        self.assertEqual(self.run_review().call_count, 3)
        self.put("audio_transcript.json", {
            "videoId": "video-1",
            "segments": [{"text": "Corroboration for the middle chunk", "start": 100, "duration": 2}],
        })

        changed = self.run_review()

        self.assertEqual(changed.call_count, 1)
        payload = json.loads(changed.call_args.args[0].split("Input:\n", 1)[1])
        self.assertEqual(payload["targetRange"]["startInclusive"], 1)
        entry = self.get()["videos"]["video-1"]
        self.assertEqual(len(entry["corrections"]), 3)
        self.assert_pending_and_unapplied()

    def test_source_change_keeps_prior_review_and_decisions_in_a_new_revision(self):
        self.run_review()
        self.decide(0, "accept")
        old = self.get()
        self.source["videos"][0]["segments"][0]["text"] = "변경된 원문"
        self.put("transcripts.json", self.source)

        self.run_review("--max-new-chunks", "0").assert_not_called()

        current = self.get()
        self.assertEqual(current["revision"], old["revision"] + 1)
        self.assertEqual(current["videos"]["video-1"]["corrections"], [])
        self.assertEqual(current["history"][-1]["reason"], "source_changed")
        archived = current["history"][-1]["review"]
        self.assertEqual(archived["videos"], old["videos"])
        self.assertEqual(archived["source"], old["source"])
        self.assertNotEqual(current["source"]["sha256"], archived["source"]["sha256"])
        self.assertEqual(self.get("transcripts.reviewed.json"), self.source)
        self.assertEqual(self.run_review().call_count, 3)
        self.assert_pending_and_unapplied()
        self.assertEqual(self.get("transcripts.json"), self.source)

    def test_restart_archives_the_previous_revision_instead_of_discarding_decisions(self):
        self.run_review()
        self.decide(0, "reject")
        old = self.get()

        self.run_review("--restart", "--max-new-chunks", "0").assert_not_called()

        current = self.get()
        self.assertEqual(current["history"][-1]["reason"], "restart")
        self.assertEqual(current["history"][-1]["review"]["videos"], old["videos"])
        self.assertEqual(current["revision"], old["revision"] + 1)
        self.assertEqual(current["videos"]["video-1"]["corrections"], [])

    def test_legacy_range_only_cache_is_retained_as_history_but_not_reused(self):
        self.run_review()
        self.decide(0, "accept")
        legacy = self.get()
        for chunk in legacy["videos"]["video-1"]["processedChunks"]:
            for field in ("cacheKey", "policySha256", "inputContextSha256", "policy"):
                chunk.pop(field)
        self.put("transcript_review.json", legacy)

        self.assertEqual(self.run_review().call_count, 3)

        archived = self.get()["videos"]["video-1"]["chunkHistory"][-1]
        self.assertEqual(archived["corrections"][0]["decision"], "accept")
        self.assert_pending_and_unapplied()

    def test_chunk_partition_change_does_not_leave_old_overlapping_proposals_active(self):
        self.run_review()
        self.decide(0, "accept")

        self.run_review("--chunk-size", "2", "--max-new-chunks", "0")

        entry = self.get()["videos"]["video-1"]
        # The unchanged final [2:3] chunk remains valid; [0:1] and [1:2]
        # cannot be used for the new [0:2] target range.
        self.assertEqual([c["startInclusive"] for c in entry["processedChunks"]], [2])
        self.assertEqual([c["segmentIndex"] for c in entry["corrections"]], [2])
        self.assertEqual(entry["chunkHistory"][-1]["corrections"][0]["decision"], "accept")
        self.assertEqual(self.get("transcripts.reviewed.json"), self.source)

    def test_default_keeps_pending_but_explicit_apply_confidence_remains_supported(self):
        self.run_review()
        self.assert_pending_and_unapplied()

        self.run_review("--max-new-chunks", "0", "--apply-confidence", "high").assert_not_called()

        entry = self.get()["videos"]["video-1"]
        self.assertTrue(all(c["decision"] == "pending" and c["applied"] for c in entry["corrections"]))
        self.assertTrue(all(
            segment["text"].endswith(" 교정")
            for segment in self.get("transcripts.reviewed.json")["videos"][0]["segments"]
        ))


if __name__ == "__main__":
    unittest.main()
