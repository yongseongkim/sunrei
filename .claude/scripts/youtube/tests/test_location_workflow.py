"""Offline integration checks for evidence -> identity -> map proposal -> DTO."""

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import location_workflow as workflow
import renew_playlists


def fixture_location(name="花の食堂", *, seconds=0, area="Kyoto Japan", premises="1 Sakura Lane", source="ocr"):
    quote = f"{name} | {area} | {premises}"
    location = {
        "name": name,
        "aliases": [],
        "category": "restaurant",
        "area": area,
        "description": "영상에서 식사한 곳이다.",
        "reason": "이름과 방문 장면이 함께 나온다.",
        "confidence": "high",
        "needsVerification": False,
        "evidence": [{"source": source, "quote": quote, "startSeconds": seconds}],
    }
    event = {"source": source, "startSeconds": seconds, "endSeconds": seconds + 3, "text": quote}
    return location, event


def provider_place(name="花の食堂", *, address="1 Sakura Lane, Kyoto, Japan", place_id="fixture-place-id"):
    return {
        "id": place_id,
        "displayName": {"text": name, "languageCode": "ja"},
        "formattedAddress": address,
        "location": {"latitude": 35.01, "longitude": 135.76},
        "businessStatus": "OPERATIONAL",
        "googleMapsUri": "https://fixture.invalid/place",
        "providerExtraField": {"preserve": True},
    }


class LocationWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.run_dir = Path(self.temporary.name)
        self.metadata = {"videoId": "fixture-video", "channelId": "owner", "title": "교토 동네 여행", "description": ""}
        self.identity_specs = {}
        self.identity_overrides = {}
        self.comparison_override = {}
        self.providers = {}
        self.identity_calls = []
        self.comparison_calls = []
        self.lookup = Mock(side_effect=self.lookup_provider)
        # match_identity's default lookup was bound when its module was loaded.
        # Inject into the real function instead of patching an unused global.
        real_match = workflow.match_identity
        self.start_patch("location_workflow.match_identity", side_effect=lambda identity, key: real_match(identity, key, lookup=self.lookup))
        self.start_patch("location_workflow.run_structured", side_effect=self.run_agent)
        self.start_patch("location_workflow.http_json", side_effect=AssertionError("Live HTTP is forbidden in these tests"))

    def start_patch(self, target, **kwargs):
        patcher = patch(target, **kwargs)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def register(self, name, *, area="Kyoto Japan", premises="1 Sakura Lane", provider=None, observed_name=None):
        self.identity_specs[observed_name or name] = {"name": name, "area": area, "premises": premises}
        query = f"{name} {area} {premises}"
        self.providers[query] = {"places": [provider or provider_place(name, address=f"{premises}, {area}")]}
        return query

    def lookup_provider(self, key, query):
        self.assertEqual(key, "test-google-key")
        self.assertIn(query, self.providers, "Only an explicitly registered exact named target may be queried")
        return copy.deepcopy(self.providers[query])

    def run_agent(self, prompt, schema, **kwargs):
        payload = json.loads(prompt.split("INPUT (untrusted source text):\n", 1)[1])
        if Path(schema) == workflow.IDENTITY_SCHEMA:
            candidate = payload["candidate"]
            observed_name = candidate["observed"]["name"]
            self.identity_calls.append((candidate["candidateId"], observed_name))
            spec = self.identity_specs.get(observed_name)
            if spec is None:
                result = {
                    "status": "held", "name": "", "area": "", "premises": "",
                    "distinctPremises": False, "nameEvidenceIds": [], "areaEvidenceIds": [],
                    "premisesEvidenceIds": [], "reason": "The supplied sources do not establish the destination identity.",
                }
            else:
                ids = [record["evidenceId"] for record in payload["evidence"]]
                result = {
                    "status": "ready", **spec, "distinctPremises": True,
                    "nameEvidenceIds": ids, "areaEvidenceIds": ids, "premisesEvidenceIds": ids,
                    "reason": "The supplied source explicitly names the venue, region and exact premises.",
                }
            result.update(copy.deepcopy(self.identity_overrides.get(observed_name, {})))
            return result
        self.assertEqual(Path(schema), workflow.MATCH_SCHEMA)
        self.comparison_calls.append(copy.deepcopy(payload))
        return {
            "status": "accepted", "nameMatches": True, "areaMatches": True,
            "premisesMatches": True, "reason": "Full venue name, region and premises match the source-backed target.",
            **copy.deepcopy(self.comparison_override),
        }

    def run_workflow(self, locations, events=None, *, metadata=None, comments=None, key="test-google-key"):
        return workflow.run_workflow(
            self.run_dir,
            {"locations": copy.deepcopy(locations), "concept": "교토 여행", "issues": []},
            key,
            metadata=copy.deepcopy(self.metadata if metadata is None else metadata),
            timeline={"events": copy.deepcopy(events or []), "sources": {"ocr": {"status": "ready" if events else "missing"}}},
            comments=copy.deepcopy(comments or {}),
        )

    def test_unknown_visited_destination_never_calls_google(self):
        location, event = fixture_location("상호를 알 수 없는 식당")
        location["evidence"][0]["quote"] = event["text"] = "오사카에서 작은 카운터 식당을 방문했다."

        result = self.run_workflow([location], [event])

        self.lookup.assert_not_called()
        self.assertEqual(result["identities"][0]["status"], "held")
        self.assertEqual(result["matches"][0]["status"], "held")
        self.assertIsNone(renew_playlists.place_inputs({}, "test-google-key", result)[0]["place"])
        self.assertEqual(self.comparison_calls, [])

    def test_agent_ready_claim_with_unsupported_identity_cannot_authorize_lookup(self):
        location, event = fixture_location()
        self.register(location["name"])
        self.identity_overrides[location["name"]] = {"name": "Invented Venue", "premises": "999 Imagined Street"}

        result = self.run_workflow([location], [event])

        self.lookup.assert_not_called()
        identity = result["identities"][0]
        self.assertEqual(identity["status"], "held")
        self.assertTrue(any("name lacks" in issue for issue in identity["issues"]))
        self.assertTrue(any("premises lacks" in issue for issue in identity["issues"]))

    def test_unverifiable_branch_and_foreign_evidence_ids_block_lookup(self):
        location, event = fixture_location()
        self.register(location["name"])
        for override in ({"distinctPremises": False}, {"nameEvidenceIds": ["not-a-source-id"]}):
            with self.subTest(override=override):
                self.identity_overrides[location["name"]] = override
                location["reason"] = json.dumps(override)
                result = self.run_workflow([location], [event])
                self.assertEqual(result["identities"][0]["status"], "held")
        self.lookup.assert_not_called()

    def test_exact_source_identity_queries_once_then_compares_before_dto(self):
        location, event = fixture_location()
        raw = {"places": [provider_place()], "responseMetadata": {"provider": "original"}}
        query = self.register(location["name"])
        self.providers[query] = raw

        result = self.run_workflow([location], [event])
        [dto] = renew_playlists.place_inputs({}, "test-google-key", result)

        self.lookup.assert_called_once_with("test-google-key", "花の食堂 Kyoto Japan 1 Sakura Lane")
        self.assertEqual(len(self.identity_calls), 1)
        self.assertEqual(len(self.comparison_calls), 1)
        comparison_input = self.comparison_calls[0]
        self.assertEqual(comparison_input["identity"]["status"], "ready")
        self.assertEqual(comparison_input["providerResult"], raw["places"][0])
        self.assertEqual(result["matches"][0]["status"], "accepted")
        self.assertEqual(result["matches"][0]["providerResponse"], raw)
        self.assertEqual(dto["place"]["googleMapsId"], "fixture-place-id")
        self.assertEqual(dto["place"]["name"], raw["places"][0]["displayName"]["text"])
        artifact = json.loads((self.run_dir / "04-matches.json").read_text())
        self.assertEqual(artifact["records"][0]["providerResponse"], raw)
        self.assertEqual(result["reviewStatus"], "admin_review_pending")
        self.assertNotIn("approved", dto)
        self.assertNotIn("publishedAt", dto)

    def test_all_comparison_fields_must_be_true_even_if_agent_says_accepted(self):
        location, event = fixture_location()
        self.register(location["name"])
        for field in ("nameMatches", "areaMatches", "premisesMatches"):
            with self.subTest(field=field):
                self.comparison_override = {field: False, "reason": "The full comparison fails."}
                location["reason"] = field  # Explicit changed candidate input invalidates this candidate's cached match.
                result = self.run_workflow([location], [event])
                [dto] = renew_playlists.place_inputs({}, "test-google-key", result)
                self.assertEqual(result["matches"][0]["status"], "held")
                self.assertIsNone(dto["place"])
                self.assertTrue(dto["needsVerification"])
        self.assertEqual(self.lookup.call_count, 3)

    def test_dto_adapter_discards_nonnull_place_for_held_or_rejected_match(self):
        location, event = fixture_location()
        self.register(location["name"])
        accepted = self.run_workflow([location], [event])
        self.assertIsNotNone(accepted["matches"][0]["place"])
        for status in ("held", "rejected"):
            with self.subTest(status=status):
                changed = copy.deepcopy(accepted)
                changed["matches"][0]["status"] = status
                [dto] = renew_playlists.place_inputs({}, "test-google-key", changed)
                self.assertIsNone(dto["place"])
                self.assertTrue(dto["needsVerification"])
        self.lookup.assert_called_once()

    def test_dto_adapter_rejects_stale_match_identity_revision(self):
        location, event = fixture_location()
        self.register(location["name"])
        changed = self.run_workflow([location], [event])
        changed["matches"][0]["identityRevision"] = "stale-identity-revision"

        [dto] = renew_playlists.place_inputs({}, "test-google-key", changed)

        self.assertIsNone(dto["place"])
        self.assertTrue(dto["needsVerification"])
        self.lookup.assert_called_once()

    def test_dto_adapter_rejects_identity_for_stale_candidate_revision(self):
        location, event = fixture_location()
        self.register(location["name"])
        changed = self.run_workflow([location], [event])
        changed["identities"][0]["candidateRevision"] = "previous-candidate-revision"
        # A match tied to this identity still cannot authorize a different
        # candidate revision, even when its own identity digest is consistent.
        changed["matches"][0]["identityRevision"] = workflow.digest(changed["identities"][0])

        [dto] = renew_playlists.place_inputs({}, "test-google-key", changed)

        self.assertIsNone(dto["place"])
        self.assertTrue(dto["needsVerification"])

    def test_dto_adapter_requires_current_ready_identity_for_accepted_match(self):
        location, event = fixture_location()
        self.register(location["name"])
        accepted = self.run_workflow([location], [event])
        for mutation in ("missing", "held"):
            with self.subTest(mutation=mutation):
                changed = copy.deepcopy(accepted)
                if mutation == "missing":
                    changed["identities"] = []
                else:
                    changed["identities"][0]["status"] = "held"
                    changed["matches"][0]["identityRevision"] = workflow.digest(changed["identities"][0])
                [dto] = renew_playlists.place_inputs({}, "test-google-key", changed)
                self.assertIsNone(dto["place"])
                self.assertTrue(dto["needsVerification"])

    def test_provider_wrong_full_name_is_held_before_map_reviewer(self):
        location, event = fixture_location()
        raw_place = provider_place("別の食堂")
        query = self.register(location["name"], provider=raw_place)

        result = self.run_workflow([location], [event])

        self.lookup.assert_called_once_with("test-google-key", query)
        self.assertEqual(result["matches"][0]["status"], "held")
        self.assertIn("provider name differs", result["matches"][0]["reason"])
        self.assertEqual(result["matches"][0]["providerResponse"]["places"][0], raw_place)
        self.assertEqual(self.comparison_calls, [])

    def test_same_brand_at_wrong_branch_is_held_after_premises_comparison(self):
        location, event = fixture_location("MORI", area="Tokyo Japan", premises="Harajuku 1-2-3")
        raw_place = provider_place("MORI", address="Ginza 4-1-1, Tokyo, Japan")
        self.register("MORI", area="Tokyo Japan", premises="Harajuku 1-2-3", provider=raw_place)
        self.comparison_override = {"premisesMatches": False, "reason": "Source identifies Harajuku; provider address identifies Ginza."}

        result = self.run_workflow([location], [event])

        self.assertEqual(result["matches"][0]["status"], "held")
        self.assertEqual(self.comparison_calls[0]["providerResult"]["formattedAddress"], raw_place["formattedAddress"])
        self.assertIsNone(renew_playlists.place_inputs({}, "test-google-key", result)[0]["place"])

    def test_same_name_in_wrong_country_is_held_after_full_region_comparison(self):
        location, event = fixture_location("Nara Tea Room", area="Singapore", premises="2 Orchard Road")
        raw_place = provider_place("Nara Tea Room", address="2 Orchard Road, London, United Kingdom")
        self.register("Nara Tea Room", area="Singapore", premises="2 Orchard Road", provider=raw_place)
        self.comparison_override = {"areaMatches": False, "premisesMatches": False, "reason": "The source is Singapore; this provider result is in the United Kingdom."}

        result = self.run_workflow([location], [event])

        self.assertEqual(result["matches"][0]["status"], "held")
        self.assertIn("United Kingdom", result["matches"][0]["reason"])
        self.assertIsNone(renew_playlists.place_inputs({}, "test-google-key", result)[0]["place"])

    def test_missing_google_id_invalid_coordinates_and_empty_results_never_become_dtos(self):
        location, event = fixture_location()
        query = self.register(location["name"])
        missing_id = provider_place()
        missing_id.pop("id")
        invalid_coordinates = provider_place()
        invalid_coordinates["location"]["latitude"] = 91
        for index, raw in enumerate(({"places": [missing_id]}, {"places": [invalid_coordinates]}, {"places": []})):
            with self.subTest(raw=raw):
                self.providers[query] = raw
                location["reason"] = f"provider test {index}"
                result = self.run_workflow([location], [event])
                self.assertEqual(result["matches"][0]["status"], "held")
                self.assertEqual(result["matches"][0]["providerResponse"], raw)
                self.assertIsNone(renew_playlists.place_inputs({}, "test-google-key", result)[0]["place"])
        self.assertEqual(self.comparison_calls, [])

    def test_ready_identity_without_api_key_does_not_query_or_create_place(self):
        location, event = fixture_location()
        self.register(location["name"])

        result = self.run_workflow([location], [event], key=None)

        self.assertEqual(result["identities"][0]["status"], "ready")
        self.assertEqual(result["matches"][0]["status"], "held")
        self.lookup.assert_not_called()
        self.assertIsNone(renew_playlists.place_inputs({}, None, result)[0]["place"])

    def test_real_zero_second_scene_survives_to_dto(self):
        location, event = fixture_location(seconds=0)
        self.register(location["name"])

        result = self.run_workflow([location], [event])
        [dto] = renew_playlists.place_inputs({}, "test-google-key", result)
        ledger = json.loads((self.run_dir / "01-evidence.json").read_text())["records"]

        self.assertEqual(dto["timestampSeconds"], 0)
        timed = [record for record in ledger if record["source"] == "ocr"]
        self.assertEqual(timed[0]["timeKind"], "timed")
        self.assertEqual(timed[0]["startSeconds"], 0)

    def test_metadata_and_creator_comment_zero_are_not_scene_timestamps(self):
        self.register("花の食堂")
        for source in ("description", "author_comment"):
            with self.subTest(source=source):
                location, _ = fixture_location(source=source)
                metadata = {**self.metadata, "description": location["evidence"][0]["quote"] if source == "description" else ""}
                comments = {"videoId": "fixture-video", "channelId": "owner", "coverage": {"complete": True}, "comments": [{
                    "id": "creator-note", "authorChannelId": "owner", "textOriginal": location["evidence"][0]["quote"],
                    "permalink": "https://fixture.invalid/comment", "publishedAt": "2026-01-01T00:00:00Z",
                }]} if source == "author_comment" else {}
                result = self.run_workflow([location], metadata=metadata, comments=comments)
                [dto] = renew_playlists.place_inputs({}, "test-google-key", result)
                ledger = json.loads((self.run_dir / "01-evidence.json").read_text())["records"]
                self.assertEqual(result["matches"][0]["status"], "accepted")
                self.assertIsNone(dto["timestampSeconds"])
                actual_sources = [record for record in ledger if record["source"] == source]
                self.assertTrue(actual_sources)
                self.assertTrue(all(record["timeKind"] == "metadata" and record["startSeconds"] is None for record in actual_sources))

    def test_fabricated_quote_is_held_even_if_identity_model_claims_ready(self):
        location, event = fixture_location()
        self.register(location["name"])
        location["evidence"][0]["quote"] = "花の食堂 | Kyoto Japan | 999 Invented Lane"

        result = self.run_workflow([location], [event])

        self.lookup.assert_not_called()
        self.assertEqual(result["identities"][0]["status"], "held")
        self.assertTrue(any("unresolved evidence" in issue for issue in result["candidates"][0]["issues"]))

    def test_unchanged_retry_reuses_identity_and_match_without_agent_or_google(self):
        location, event = fixture_location()
        self.register(location["name"])
        first = self.run_workflow([location], [event])

        second = self.run_workflow([location], [event])

        self.lookup.assert_called_once()
        self.assertEqual(len(self.identity_calls), 1)
        self.assertEqual(len(self.comparison_calls), 1)
        self.assertEqual(second["runId"], first["runId"])
        self.assertEqual(second["candidates"][0]["candidateId"], first["candidates"][0]["candidateId"])
        self.assertEqual(second["artifacts"]["manifest"]["stages"], first["artifacts"]["manifest"]["stages"])

    def test_name_correction_invalidates_its_identity_and_match_but_other_candidate_is_reused(self):
        first_location, first_event = fixture_location("HANE ramen", seconds=0)
        other_location, other_event = fixture_location("薄荷書房", seconds=20, premises="2 Book Lane")
        self.register("HANE ramen")
        self.register("薄荷書房", premises="2 Book Lane")
        first = self.run_workflow([first_location, other_location], [first_event, other_event])
        first_by_name = {record["observed"]["name"]: record for record in first["candidates"]}
        changed_id = first_by_name["HANE ramen"]["candidateId"]
        untouched_id = first_by_name["薄荷書房"]["candidateId"]
        first_stages = first["artifacts"]["manifest"]["stages"]

        corrected_location, corrected_event = fixture_location("羽ラーメン", seconds=0)
        self.register("羽ラーメン")
        second = self.run_workflow([other_location, corrected_location], [corrected_event, other_event])
        second_by_name = {record["observed"]["name"]: record for record in second["candidates"]}
        second_stages = second["artifacts"]["manifest"]["stages"]

        self.assertEqual(second_by_name["羽ラーメン"]["candidateId"], changed_id)
        self.assertEqual(second_by_name["薄荷書房"]["candidateId"], untouched_id)
        self.assertNotEqual(second_by_name["羽ラーメン"]["revision"], first_by_name["HANE ramen"]["revision"])
        self.assertEqual(second_by_name["薄荷書房"]["revision"], first_by_name["薄荷書房"]["revision"])
        for stage in ("identity-", "match-"):
            self.assertNotEqual(second_stages[stage + changed_id]["attemptId"], first_stages[stage + changed_id]["attemptId"])
            self.assertEqual(second_stages[stage + untouched_id]["attemptId"], first_stages[stage + untouched_id]["attemptId"])
        self.assertEqual(len(self.identity_calls), 3)
        self.assertEqual(len(self.comparison_calls), 3)
        self.assertEqual(self.lookup.call_count, 3)
        changed_match = next(record for record in second["matches"] if record["candidateId"] == changed_id)
        changed_identity = next(record for record in second["identities"] if record["candidateId"] == changed_id)
        self.assertEqual(changed_match["identityRevision"], workflow.digest(changed_identity))
        self.assertEqual(changed_match["place"]["name"], "羽ラーメン")

    def test_transport_failure_retries_match_without_rerunning_identity(self):
        location, event = fixture_location()
        query = self.register(location["name"])
        self.lookup.side_effect = [RuntimeError("temporary lookup failure"), copy.deepcopy(self.providers[query])]

        with self.assertRaisesRegex(RuntimeError, "temporary lookup failure"):
            self.run_workflow([location], [event])
        result = self.run_workflow([location], [event])

        self.assertEqual(len(self.identity_calls), 1)
        self.assertEqual(self.lookup.call_count, 2)
        self.assertEqual(result["matches"][0]["status"], "accepted")
        candidate_id = result["candidates"][0]["candidateId"]
        history = result["artifacts"]["manifest"]["history"]
        match_attempts = [attempt for attempt in history if attempt["stage"] == "match-" + candidate_id]
        self.assertEqual([attempt["status"] for attempt in match_attempts], ["failed", "complete"])

    def test_reordered_same_scene_candidates_never_inherit_each_others_ids(self):
        first, event = fixture_location("花の食堂")
        second, _ = fixture_location("薄荷書房", premises="2 Book Lane")
        event["text"] += " ; " + second["evidence"][0]["quote"]
        self.register("花の食堂")
        self.register("薄荷書房", premises="2 Book Lane")
        initial = self.run_workflow([first, second], [event])

        reordered = self.run_workflow([second, first], [event])

        initial_ids = {record["candidateId"] for record in initial["candidates"]}
        reordered_ids = {record["candidateId"] for record in reordered["candidates"]}
        self.assertEqual(len(initial_ids), 2)
        self.assertEqual(len(reordered_ids), 2)
        self.assertTrue(initial_ids.isdisjoint(reordered_ids), "Ambiguous shared anchors must not remap IDs by array position or mutable name")
        self.assertTrue(all(any("shared scene anchor" in issue for issue in record["issues"]) for record in reordered["candidates"]))
        self.assertTrue(all(record["status"] == "held" for record in reordered["identities"]))
        self.lookup.assert_not_called()

    def test_legacy_adapter_never_uses_extraction_confidence_as_lookup_authorization(self):
        location, _ = fixture_location()

        [dto] = renew_playlists.place_inputs({"locations": [location]}, "test-google-key")

        self.lookup.assert_not_called()
        self.assertIsNone(dto["place"])
        self.assertTrue(dto["needsVerification"])
        self.assertIn("identity gate not run", dto["geocodeWarning"])


if __name__ == "__main__":
    unittest.main()
