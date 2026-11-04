---
name: youtube-extract-locations
description: Extract and verify places introduced in YouTube videos, using creator metadata, comments, and timed evidence before matching Google places. Use for location extraction or review after evidence collection; youtube-to-sunrei owns saving and publication.
---

# Extract and Verify YouTube Locations

Identify the destination from the content before asking Google to locate it. A
plausible search result must never supply a missing business name or branch.
Keep evidence, identity decisions, map matches, and user approval separate.

## Execution Model

The coordinator owns scope, delegation, artifact validation and resumption.
Delegate Phases 2–6 as narrow subagent tasks with the [role and handoff
contract](references/subagent-workflow.md). Pass declared inputs, allowed
actions, expected output and exit criteria, not the full chat. Validate each
artifact before advancing. The final reviewer is independent of the identity
resolver and map matcher. If delegation is unavailable, retain the same role
boundaries and artifacts sequentially; report that limitation.

## Phase 1 — Establish Scope

Read the selected video IDs, full per-video metadata, playlist memberships, and
existing user decisions. State what destinations this content introduces. Use
each video's scenes to establish its region; a playlist title is context, not a
country boundary. Preserve shared-video memberships and existing holds.

**Output:** `manifest.json` with scope, run/content IDs, ID registry and user
decisions. Missing metadata goes back to `youtube-fetch-info`; missing timed evidence goes to
`youtube-extract-transcript` within the authorized workflow.

## Phase 2 — Collect and Index Evidence

Assign the evidence collector. Read the title, full description, chapters,
creator venue blocks and map links, then align them with captions, Whisper, and
OCR. Inspect creator comments when requested or needed to identify the
destination. Record source availability and coverage; do not silently treat a
missing source as checked.

Use [source evidence](references/source-evidence.md) for author verification,
provenance, and the facts each source can establish. Use [description
parsing](references/description-first.md) only for parser details.

**Output:** `01-evidence.json`. A source ledger links observations and verbatim
excerpts to their video/comment URLs and, where supported, scene times.
Unavailable evidence is recorded. Metadata time zero is not a scene anchor.

## Phase 3 — Build Contextual Candidates

Assign the text-only candidate extractor. Read the [shared extraction
rules](../../../.claude/scripts/youtube/prompts/extract_locations.md) for
destination selection and public context. Group evidence by the visit it belongs
to; infer the video's theme and purpose without inventing venue facts.
Distinguish a visit from a comparison, product-only review, or passing mention.

For each candidate, separate observed name/aliases, region, branch/address, menu
or activity, and the creator's assessment from hypotheses and conflicts. Keep
unnamed destinations explicitly unnamed. Use the [extraction
tools](references/extraction-tools.md) without running a combined
extract-and-geocode path on unresolved candidates.

**Output:** `02-candidates.json`. Every candidate has a stable ID, visit
evidence and a proposed identity to test. No Google result has been used to
invent its name, branch, or context.

## Phase 4 — Resolve Identity Before Map Search

Assign the identity resolver. Apply the [identity
gate](references/identity-resolution.md) to every candidate. Require an
evidenced venue name and enough region/premises information to distinguish the
intended destination. A creator's direct map link may be resolved as source
evidence; it is not permission to ignore a conflict.

For missing or conflicting identities, research the source's own clues and
original-language aliases first. Use local OCR and text normally; consult
[visual and historical review](references/visual-and-historical-review.md) only
for a specific unresolved scene, branch, move, or closure.

**Output:** `03-identities.json`. Each candidate is ready for map lookup, held
with a specific missing fact, or excluded with a reason. Only ready candidates
enter Places Text Search. Generic categories, guessed aliases, and arbitrary
chain branches do not pass. These are review decisions, not new API status
values.

## Phase 5 — Locate and Verify the Exact Place

Assign the map matcher only candidates that passed Phase 4. Use [geocoding and
review](references/geocoding-and-review.md) to resolve a provided pin or query
the evidenced name with its region. Compare Google's unaltered result name,
ID/CID, address, coordinates, and premises with the candidate. Neither a nearby
pin nor an identical address proves identity.

Reject conflicting results and return to Phase 4. Keep the filmed location
separate from a current branch or successor. A missing listing follows the
verified fallback rules; it never licenses selecting another business.

**Output:** `04-matches.json`. Accepted matches have recorded venue/branch
evidence and a verified Google ID/pin. Unresolved matches remain held, without
an accepted place.

## Phase 6 — Reconcile and Hand Off

Assign an independent final reviewer. Recheck the complete final set, including
later batches and retries. Merge same-video duplicates without losing visit
context or valid scene times; preserve other videos and playlist memberships.
Keep separately introduced buildings distinct. Verify source links from timed
evidence, retaining a real zero-second scene or a whole-video link when the time
is unknown.

Follow [review and output](references/review-output.md) for the review table,
record shapes, public text, and `locations.json` export. Report extraction,
identity verification, map verification, holds, and scene-time coverage
separately. Export only verified matches within the user's approved or explicit
admin-review import scope. `youtube-to-sunrei` owns authorization;
`youtube-create-sunrei` owns writing spots and publication.

**Output:** `05-review.json` plus a verified export proposal. A reviewable
result and unresolved list exist. No Sunrei has been created or changed by this
skill. Extraction completion is not venue approval.

## Examples

Read [worked cases](examples/place-resolution.md) when applying an unfamiliar
identity, branch, timestamp, or map-match decision. Cases illustrate the phases;
their venue-specific outcomes are not universal mapping rules.
