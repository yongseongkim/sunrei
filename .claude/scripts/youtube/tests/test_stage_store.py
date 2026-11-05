import hashlib
import functools
import json
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from stage_store import StageStore


class StageStoreTests(unittest.TestCase):
    def test_actual_interpreter_restart_reuses_identical_producer(self):
        code = """
import json, sys, uuid
sys.path.insert(0, sys.argv[1])
from stage_store import StageStore
store = StageStore(sys.argv[2], 'video-123')
print(json.dumps(store.run('restart', {}, [], lambda: {'nonce': str(uuid.uuid4())})))
"""
        command = [sys.executable, "-c", code, str(SCRIPT_DIR), str(self.workspace)]
        first = subprocess.check_output(command, text=True)
        second = subprocess.check_output(command, text=True)
        self.assertEqual(json.loads(first), json.loads(second))
        self.assertEqual(len(self.store.snapshot()["manifest"]["history"]), 1)

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.workspace = Path(self.temporary.name)
        self.store = StageStore(self.workspace, "video-123")
        self.policy = self.workspace / "policy.md"
        self.policy.write_text("resolve actual premises", encoding="utf-8")
        self.calls = 0
        self.result = {"records": [{"candidateId": "first", "decision": "held"}],
                       "issues": [], "counts": {"held": 1}, "nextAction": "review"}

    def produce(self):
        self.calls += 1
        return self.result

    def run_stage(self, inputs=None, **kwargs):
        return self.store.run("identity", inputs or {"evidence": "one"},
                              [self.policy], self.produce, **kwargs)

    def snapshot(self):
        return self.store.snapshot()

    def test_unchanged_inputs_reuse_result_across_instances(self):
        first = self.run_stage()
        other = StageStore(self.workspace, "video-123")
        second = other.run("identity", {"evidence": "one"}, [self.policy], self.produce)

        self.assertEqual(first, self.result)
        self.assertEqual(first, second)
        self.assertEqual(other.run_id, self.store.run_id)
        self.assertEqual(str(uuid.UUID(self.store.run_id)), self.store.run_id)
        self.assertEqual(self.calls, 1)
        self.assertEqual(len(self.snapshot()["attempts"]), 1)

    def test_input_changes_make_new_attempt_and_preserve_history(self):
        self.run_stage({"scene": 1})
        first_attempt = self.snapshot()["manifest"]["stages"]["identity"]
        first_bytes = (self.store.root / first_attempt["path"]).read_bytes()
        self.run_stage({"scene": 2})
        snapshot = self.snapshot()

        self.assertEqual(self.calls, 2)
        self.assertEqual(len(snapshot["manifest"]["history"]), 2)
        self.assertNotEqual(first_attempt["path"], snapshot["manifest"]["stages"]["identity"]["path"])
        self.assertEqual((self.store.root / first_attempt["path"]).read_bytes(), first_bytes)
        self.assertEqual(snapshot["attempts"][0]["envelope"]["inputRefs"][0]["id"], "scene")
        self.assertNotIn("inputs", snapshot["attempts"][0]["envelope"])

    def test_policy_changes_invalidate_cache(self):
        self.run_stage()
        self.policy.write_text("verify a branch independently", encoding="utf-8")
        self.run_stage()

        self.assertEqual(self.calls, 2)
        refs = [item["envelope"]["policyRefs"] for item in self.snapshot()["attempts"]]
        self.assertNotEqual(refs[0], refs[1])

    def test_module_code_hash_changes_invalidate_cache(self):
        source = self.workspace / "producer.py"
        source.write_text("calls = []\ndef produce():\n    calls.append(1)\n    return {'records': []}\n",
                          encoding="utf-8")
        namespace = {}
        exec(compile(source.read_text(encoding="utf-8"), str(source), "exec"), namespace)
        producer = namespace["produce"]
        self.store.run("identity", {}, [], producer)
        source.write_text(source.read_text(encoding="utf-8") + "# revised module\n", encoding="utf-8")
        self.store.run("identity", {}, [], producer)
        self.assertEqual(len(namespace["calls"]), 2)

    def test_partial_producer_hashes_underlying_source(self):
        source = self.workspace / "producer.py"
        source.write_text("calls = []\ndef produce(value):\n    calls.append(1)\n    return {'value': value}\n",
                          encoding="utf-8")
        namespace = {}
        exec(compile(source.read_text(encoding="utf-8"), str(source), "exec"), namespace)
        producer = functools.partial(namespace["produce"], "declared-input")
        self.store.run("identity", {"value": "declared-input"}, [], producer)
        source.write_text(source.read_text(encoding="utf-8") + "# revised module\n", encoding="utf-8")
        self.store.run("identity", {"value": "declared-input"}, [], producer)
        self.assertEqual(len(namespace["calls"]), 2)

    def test_different_producer_code_in_same_module_is_not_reused(self):
        self.run_stage()

        def different_producer():
            return {"records": [], "different": True}

        result = self.store.run("identity", {"evidence": "one"}, [self.policy], different_producer)
        self.assertTrue(result["different"])
        self.assertEqual(len(self.snapshot()["attempts"]), 2)

    def test_force_preserves_previous_accepted_attempt(self):
        self.run_stage()
        first = self.snapshot()["manifest"]["stages"]["identity"]
        self.run_stage(force=True)

        self.assertEqual(self.calls, 2)
        self.assertEqual(len(self.snapshot()["attempts"]), 2)
        self.assertTrue((self.store.root / first["path"]).is_file())

    def test_corrupt_attempt_is_retained_and_recomputed(self):
        self.run_stage()
        accepted = self.snapshot()["manifest"]["stages"]["identity"]
        path = self.store.root / accepted["path"]
        path.write_text("{interrupted", encoding="utf-8")
        self.run_stage()

        self.assertEqual(self.calls, 2)
        self.assertEqual(path.read_text(encoding="utf-8"), "{interrupted")
        self.assertEqual(len(self.snapshot()["attempts"]), 2)
        self.assertTrue(any("error" in item for item in self.snapshot()["attempts"]))

    def test_parseable_attempt_corruption_is_not_reused(self):
        self.run_stage()
        accepted = self.snapshot()["manifest"]["stages"]["identity"]
        path = self.store.root / accepted["path"]
        envelope = json.loads(path.read_text(encoding="utf-8"))
        envelope["result"]["records"][0]["decision"] = "ready"
        path.write_text(json.dumps(envelope), encoding="utf-8")
        self.assertIn("error", self.snapshot()["attempts"][0])
        result = self.run_stage()

        self.assertEqual(self.calls, 2)
        self.assertEqual(result["records"][0]["decision"], "held")

    def test_corrupt_manifest_recovers_without_losing_attempts_or_run_id(self):
        self.run_stage()
        run_id = self.store.run_id
        self.store.manifest_path.write_text("broken", encoding="utf-8")
        other = StageStore(self.workspace, "video-123")
        other.run("identity", {"evidence": "one"}, [self.policy], self.produce)

        self.assertEqual(other.run_id, run_id)
        self.assertEqual(self.calls, 2)
        self.assertEqual(len(other.snapshot()["attempts"]), 2)
        self.assertEqual(len(list((other.root / "corrupt").glob("manifest-*.json"))), 1)

    def test_failed_attempt_is_recorded_and_retry_can_promote(self):
        should_fail = True

        def producer():
            if should_fail:
                raise RuntimeError("rate limited")
            return {"records": [{"ok": True}]}

        with self.assertRaisesRegex(RuntimeError, "rate limited"):
            self.store.run("matches", {"identity": "one"}, [self.policy], producer)
        failed = self.snapshot()
        self.assertNotIn("matches", failed["manifest"]["stages"])
        self.assertEqual(failed["attempts"][0]["envelope"]["status"], "failed")
        self.assertEqual(failed["attempts"][0]["envelope"]["error"]["message"], "rate limited")

        should_fail = False
        result = self.store.run("matches", {"identity": "one"}, [self.policy], producer)
        self.assertTrue(result["records"][0]["ok"])
        self.assertEqual(len(self.snapshot()["attempts"]), 2)
        self.assertEqual(self.snapshot()["manifest"]["stages"]["matches"]["status"], "complete")

    def test_failed_force_does_not_promote_or_destroy_previous_acceptance(self):
        should_fail = False

        def producer():
            if should_fail:
                raise RuntimeError("failed retry")
            return {"records": []}

        self.store.run("matches", {}, [], producer)
        accepted = self.snapshot()["manifest"]["stages"]["matches"]
        should_fail = True
        with self.assertRaises(RuntimeError):
            self.store.run("matches", {}, [], producer, force=True)
        self.assertEqual(self.snapshot()["manifest"]["stages"]["matches"], accepted)
        self.assertEqual(len(self.snapshot()["attempts"]), 2)

    def test_incomplete_results_are_returned_but_not_cached(self):
        for status in ("partial", "blocked", "failed"):
            with self.subTest(status=status):
                self.result = {"stageStatus": status, "records": [], "nextAction": "missing evidence"}
                first = self.run_stage({"stageStatus": status})
                self.assertEqual(first, self.result)
                self.assertNotIn("identity", self.snapshot()["manifest"]["stages"])
                self.run_stage({"stageStatus": status})
        self.assertEqual(self.calls, 6)

    def test_domain_status_is_preserved_as_data(self):
        self.result = {"status": "review_pending", "locations": [{"name": "Venue"}]}
        result = self.run_stage()
        cached = self.run_stage()
        self.assertEqual(result, self.result)
        self.assertEqual(cached, result)
        self.assertEqual(self.calls, 1)
        self.assertEqual(self.snapshot()["manifest"]["stages"]["identity"]["status"], "complete")

    def test_non_json_result_records_failure_without_promotion(self):
        self.result = {"bad": float("nan")}
        with self.assertRaises(ValueError):
            self.run_stage()
        self.assertEqual(self.snapshot()["attempts"][0]["envelope"]["status"], "failed")
        self.assertEqual(self.snapshot()["manifest"]["stages"], {})

    def test_nonfinite_inputs_fail_before_producer(self):
        for number in (float("nan"), float("inf"), -float("inf")):
            with self.subTest(number=number), self.assertRaises(ValueError):
                self.run_stage({"invalid": number})
        self.assertEqual(self.calls, 0)
        self.assertEqual(self.snapshot()["attempts"], [])

    def test_stable_ids_use_exact_immutable_anchors_and_record_overlap(self):
        first = self.store.candidate_id(["captions:original-42:12.3", "ocr:original-7:12.8"])
        other = StageStore(self.workspace, "video-123")
        self.assertEqual(other.candidate_id(["ocr:original-7:12.8", "captions:original-42:12.3",
                                             "ocr:original-7:12.8"]), first)
        split = other.candidate_id(["captions:original-42:12.3"])
        unrelated = other.candidate_id(["captions:original-55:60.0"])

        self.assertEqual(str(uuid.UUID(first)), first)
        self.assertNotEqual(split, first)
        self.assertNotEqual(unrelated, first)
        registry = {item["candidateId"]: item for item in other.snapshot()["candidateRegistry"]}
        self.assertEqual(registry[split]["relatedCandidateIds"], [first])
        self.assertEqual(registry[unrelated]["relatedCandidateIds"], [])
        self.assertEqual(len(registry), 3)

    def test_empty_candidate_anchors_are_rejected(self):
        for refs in ([], [""], [None], "name"):
            with self.subTest(refs=refs), self.assertRaises(ValueError):
                self.store.candidate_id(refs)

    def test_registry_corruption_fails_closed(self):
        candidate_id = self.store.candidate_id(["caption:original-1:3.0"])
        path = self.store.root / "candidate-registry" / f"{candidate_id}.json"
        record = json.loads(path.read_text(encoding="utf-8"))
        record["evidenceRefs"] = ["different-scene"]
        path.write_text(json.dumps(record), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "corrupt candidate registry"):
            self.store.candidate_id(["caption:original-1:3.0"])

    def test_cross_process_style_instances_refresh_manifest_before_writing(self):
        other = StageStore(self.workspace, "video-123")
        self.run_stage()
        other.run("review", {"identity": "one"}, [self.policy], self.produce)
        self.run_stage({"evidence": "two"})

        manifest = other.snapshot()["manifest"]
        self.assertEqual(set(manifest["stages"]), {"identity", "review"})
        self.assertEqual(len(manifest["history"]), 3)

    def test_producer_can_use_same_store_without_deadlock_or_lost_history(self):
        def outer():
            other = StageStore(self.workspace, "video-123")
            return other.run("nested", {}, [], self.produce)

        self.store.run("outer", {}, [], outer)
        manifest = self.snapshot()["manifest"]
        self.assertEqual(set(manifest["stages"]), {"outer", "nested"})
        self.assertEqual(len(manifest["history"]), 2)

    def test_result_hash_invalidates_dependent_stage_only_when_result_changes(self):
        review_calls = 0

        def review_producer():
            nonlocal review_calls
            review_calls += 1
            return {"records": [], "review": review_calls}

        self.run_stage()
        identity_hash = self.snapshot()["manifest"]["stages"]["identity"]["resultSha256"]
        self.store.run("review", {"identityResultSha256": identity_hash}, [], review_producer)
        self.run_stage(force=True)
        same_hash = self.snapshot()["manifest"]["stages"]["identity"]["resultSha256"]
        self.store.run("review", {"identityResultSha256": same_hash}, [], review_producer)
        self.assertEqual(review_calls, 1)

        self.result = {"records": [{"candidateId": "first", "decision": "ready"}]}
        self.run_stage({"evidence": "corrected source"})
        changed_hash = self.snapshot()["manifest"]["stages"]["identity"]["resultSha256"]
        self.store.run("review", {"identityResultSha256": changed_hash}, [], review_producer)
        self.assertNotEqual(identity_hash, changed_hash)
        self.assertEqual(review_calls, 2)

    def test_different_scope_is_rejected_without_overwriting_manifest(self):
        original = self.store.manifest_path.read_bytes()
        with self.assertRaisesRegex(ValueError, "different content"):
            StageStore(self.workspace, "different-video")
        self.assertEqual(self.store.manifest_path.read_bytes(), original)

    def test_existing_instance_rejects_manifest_scope_change(self):
        value = json.loads(self.store.manifest_path.read_text(encoding="utf-8"))
        value["contentId"] = "different-video"
        self.store.manifest_path.write_text(json.dumps(value), encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "scope"):
            self.run_stage()

    def test_manifest_hashes_match_immutable_attempt_and_result(self):
        result = self.run_stage()
        descriptor = self.snapshot()["manifest"]["stages"]["identity"]
        raw = (self.store.root / descriptor["path"]).read_bytes()
        self.assertEqual(descriptor["sha256"], hashlib.sha256(raw).hexdigest())
        canonical = (json.dumps(result, ensure_ascii=False, sort_keys=True,
                                separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")
        self.assertEqual(descriptor["resultSha256"], hashlib.sha256(canonical).hexdigest())


if __name__ == "__main__":
    unittest.main()
