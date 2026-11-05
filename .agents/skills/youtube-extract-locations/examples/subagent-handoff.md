# Subagent Task and Handoff Examples

These are workflow examples, not production candidate data or API payloads.
Read the [contract](../references/subagent-workflow.md) for field requirements.

## Narrow Task Prompts

Use declared artifact paths/hashes and the scoped IDs in place of placeholders.
Do not include API tokens, raw session history or irrelevant source material.

| Role | Example assignment |
| --- | --- |
| Evidence collector | Read this scope and these source files. Collect the video's full description and requested creator comments, verify author channel IDs, index timed text, and record missing coverage. Return only the evidence artifact, paths and counts. Do not search Places or decide a branch. |
| Candidate extractor | Use this evidence ledger and the shared extraction prompt to separate actual visits from comparisons. Return all candidates with observed clues, conflicts and evidence references. Do not browse, geocode or invent a name. |
| Identity resolver | Resolve only these candidate IDs. Use their source clues and dated/native-language evidence to identify exact premises. Return ready/held/excluded with supporting sources and one explicit lookup target for each ready candidate. Do not run speculative Places queries. |
| Map matcher | For these ready identity revisions, resolve the supplied links or run only their evidenced target queries. Preserve Google's names/IDs/addresses and compare against the visit. Return match decisions. A mismatch goes back for identity research; no silent branch substitution. |
| Independent reviewer | Audit these artifacts against the referenced raw evidence and policy. Account for every candidate and contradiction. Export no held/stale match; report which producer must revisit each failure. Do not approve or publish through the API. |

## Identity Handoff

A shortened example of a ready identity; other stage records use the same
envelope and their own required fields. IDs and hashes below are placeholders.

```json
{
  "schemaVersion": 1,
  "runId": "scope-run-id",
  "contentId": "VIDEO_ID",
  "stage": "identity",
  "status": "complete",
  "inputRefs": [{"path": "02-candidates.json", "sha256": "INPUT_DIGEST"}],
  "policyRefs": [{"path": "identity-resolution.md", "sha256": "POLICY_DIGEST"}],
  "records": [{
    "candidateId": "stable-candidate-id",
    "decision": "ready",
    "resolvedName": "確認した店名",
    "premises": {"country": "JP", "city": "Tokyo", "branch": "source-confirmed branch"},
    "evidenceRefs": ["creator-comment-01", "official-branch-page-01"],
    "lookupTarget": {"name": "確認した店名", "city": "Tokyo", "country": "JP"},
    "resolvedConflicts": [],
    "missingFact": null
  }],
  "issues": [],
  "counts": {"ready": 1, "held": 0, "excluded": 0},
  "nextAction": "map_match"
}
```

A held record names the missing fact and alternatives and has no allowed
lookup target. The coordinator still carries it into final review; it is not
silently dropped because the matcher received only ready candidates.

## Failed Match and Resume

The map matcher receives a ready venue identity, but Google's result is a
different tenant at the same address. It records the actual result and a
rejected match. The coordinator sends that candidate and mismatch evidence
back to the identity resolver. If a new native spelling or historical listing
resolves it, only that identity's match and review are rerun. Original source
collection and unrelated candidates remain reusable.

If no new evidence is available, the final result stays held with an explicit
next question. Successful API calls and repeated queries do not change it to
verified. A ready identity plus unknown scene time can still yield a verified
venue with a whole-video source link; it must not receive a fabricated time.
