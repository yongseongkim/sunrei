# Subagent Roles and Handoff Contract

This is the coordinator's workflow, not an orchestrator already implemented
by the collection scripts. Existing outputs remain raw inputs to these review
artifacts. Use the same roles when reviewing Instagram, substituting post and
caption evidence; do not apply YouTube's comment API to Instagram.

## Ownership and Actions

The coordinator creates the scope/manifest, assigns IDs, validates each output,
selects the next stage, and owns all authorized remote writes. Workers write
only their assigned attempt artifacts; they do not approve candidates, mutate
Sunreis/Places, publish, edit other stages, or pass credentials in outputs.

| Role | Declared inputs | Concrete work | Handoff and stop condition |
| --- | --- | --- | --- |
| Evidence collector | Scoped content IDs, raw-source access, existing collected evidence | Fetch/read full metadata; verify creator comments; collect/align available timed sources; record coverage and verbatim excerpts | `01-evidence.json`; sources collected or explicitly unavailable/limited; no Places search or guessed identity |
| Candidate extractor | Scope and evidence ledger with referenced raw text | Reconstruct visits; distinguish destinations/comparisons; group name, region, premises and context clues; preserve unnamed/conflicting cases | `02-candidates.json`; each proposed visit has evidence; no browsing, map lookup or invented proper nouns |
| Identity resolver | Candidate records, evidence and user mapping choices | Resolve each exact venue/premises with source clues, native aliases and dated web evidence; inspect selected images only for a specific missing fact | `03-identities.json`; every candidate is ready, held or excluded; no speculative Places Text Search |
| Map matcher | Only ready identities, allowed query targets/creator links and their evidence | Resolve a supplied pin or query the exact evidenced target; preserve provider results; compare venue, branch, region and premises | `04-matches.json`; accepted/rejected/held with rationale; do not invent a new alias or branch to rescue a result |
| Independent reviewer | Scope, all upstream artifacts, raw evidence references and current policy | Audit visit identity, counterevidence, Google comparison, timing, duplicates and export completeness | `05-review.json`; verified/held/excluded for every candidate; no unresolved or stale match exported; no remote writes |

Pass each worker a narrow task with its role, input references, candidate IDs,
allowed actions, expected artifact, and exit condition. Use the
[prompt and handoff examples](../examples/subagent-handoff.md). Give the final
reviewer the underlying evidence and alternatives, not only another worker's
conclusions. The coordinator checks results before starting dependent work.
Independent videos may run concurrently in separate directories; dependent
stages for the same candidate may not. Shared schemas/configuration are read-only.

## Artifacts and IDs

Use a review directory per content ID, for example under
`.claude/workspace/youtube/{scope}/review/{videoId}/`. The coordinator's
`manifest.json` records scope, user decisions, the stable ID registry and the
accepted attempt for each stage. Supply `runId`, `contentId` and the current
ID registry in every task; workers must not invent missing scope identifiers.
A missing mandatory identifier/input returns a partial handoff requesting
coordinator repair, without downstream lookup. Write each stage result under its own attempt
directory and update the manifest after validation; do not overwrite previous
accepted attempts or copy full raw inputs into every handoff.

Every result has `schemaVersion`, `runId`, `contentId`, `stage`, `status`,
`inputRefs` (path/ID and SHA-256), `policyRefs` (instruction/prompt hashes),
`records`, `issues`, `counts`, and `nextAction`. Local stage status is
`complete`, `partial` or `failed`; these are not DB status values. `complete`
means all scoped records received a decision, not that all places passed.
A complete stage can legitimately return held or excluded candidates.

| Result | Required record content |
| --- | --- |
| Evidence | `evidenceId`, source kind/ref, original quote, `timeKind` (`timed`, `metadata`, `unknown`), nullable scene time, authorship check when relevant, coverage |
| Candidates | `candidateId`, visit `evidenceIds`, observed name/aliases/region/premises, separate hypotheses/conflicts, destination reason and supported context draft |
| Identities | `candidateId`, ready/held/excluded, resolved name and distinguishing premises, evidence/research refs with dates, resolved contradictions, missing fact or exact allowed lookup target |
| Matches | `candidateId`, identity input hash/revision, actual query/direct link, unaltered Google result, accepted/rejected/held, comparison evidence and proxy/historical choice if any |
| Review | `candidateId`, verified/held/excluded, cited identity and match revisions, scene-time decision, merge/duplicate disposition, public context, export reference or reason for no export |

Assign a stable candidate ID once, using an existing DB candidate ID when
available or a coordinator-issued ID. Never derive it from a mutable name,
array position or Google ID; never renumber/reuse it. Spellings and geocodes
can change without changing the candidate ID. Explicit merges/splits retain
lineage through `mergedInto` or `supersededBy` instead of dropping records.
The candidate extractor obtains new-visit IDs from the coordinator's allocation;
the coordinator persists that registry before downstream work. Research evidence
can add new cited records without altering raw observations.

The stock candidate schema is unchanged: sidecar IDs, decision fields, URLs,
branches and nullable times must not be injected into its strict output or
sent blindly to an API DTO. Refer to raw records by path and pointer.

## Validate Before Advancing

- Check parseable output, matching scope, declared input/policy hashes, stable
  IDs, and resolvable evidence references. Return a defective artifact to its
  producer; do not repair its missing facts with guesses downstream.
- Account for every upstream candidate through a record or explicit lineage.
  Forward only ready identities to the matcher; verify that an accepted result
  references the same identity revision and has comparison evidence.
- Recheck metadata versus actual scene time, provider result versus proposed
  display name, conflicting branch/address evidence, and export scope.
- An independent review failure returns the affected candidate to the earliest
  invalid stage. Do not turn every upstream completion into final approval.

## Retry, Resume and Debug

Reuse an artifact only while its declared inputs and policy remain applicable.
Evidence changes invalidate affected candidate/identity/match/review decisions;
a changed identity invalidates its matches and review, not transcription.
A changed pin invalidates review. Other candidates remain reusable when their
inputs did not change. Record per-candidate input revisions/digests as well as
file hashes; a shared file change alone must not hide which records changed. Retain user decisions as history; approval does not
automatically transfer to a different visitor destination.

On failure, record the stage, candidate IDs, consumed input versions, attempted
query/source, error and next action. Resume from the earliest invalid result,
not the start of the playlist. Retry a held candidate only with new evidence
or a concrete unanswered lookup; repeated guesses do not close a hold.
Unclear remote-write outcomes are handled by the coordinator's existing fresh
GET/verification rules, not by rerunning an import.

Current helpers do not implement this contract's cache validation, stable IDs,
or per-stage orchestration. Their specific cache/merge/coverage limitations
are in [extraction tools](extraction-tools.md#review-boundaries-of-stock-tools).
