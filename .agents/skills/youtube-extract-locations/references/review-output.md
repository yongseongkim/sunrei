# Review Records and Export

Use in Phase 6. Keep raw evidence and earlier proposals unchanged. The review
record explains what was accepted, held or excluded and why; it is not a new
server schema.

## Review Table

Show every candidate, including those without a map match:

| Candidate | Visit evidence and source link | Identity and branch decision | Address / Google match | Scene time | Remaining decision |
| --- | --- | --- | --- | --- | --- |

Record the original name, confirmed aliases, observed/inferred clues, relevant
source URLs/quotes/dates, creator-comment coverage, competing identities,
identity-gate result, Google's unaltered result, and match decision. Use
candidate ID and video ID/scene to join these fields. For a later correction,
keep old/new place IDs and the actual spot ID; an approved candidate may
retain its historical place proposal after the real spot is repaired.

Keep identity, map match, and scene-time outcomes separate. A metadata-only
quote with time zero does not establish the scene's start; timed speech/OCR
at actual zero does. Preserve the earliest verified scene on a same-video
merge; use a whole-video URL when time is unknown.

Merge only repeated candidates for the same venue within the same video,
combining their supported context. Do not merge separately introduced
buildings into a complex pin or drop another video's visit or playlist
membership. The same Place can belong to several Sunreis. Instagram's
post-repeat approval rules are handled by its own workflow.

## Public Context

Follow the public-context rules in the
[shared extraction prompt](../../../../.claude/scripts/youtube/prompts/extract_locations.md#5-write-the-public-context).
Describe what this visit introduces, shows and says about the place. Infer
structure and connections from evidence, but never invent a branch, date,
price, menu detail, recommendation or activity. Prefer shorter supported text
to padding a fixed sentence count. Keep unresolved conflicts and search notes
in the review record, not polished public claims. Preserve raw transcript
proposals until their decisions are explicit.

## Candidate and Export Shapes

Tool candidates follow
[location_candidates.schema.json](../../../../.claude/scripts/youtube/location_candidates.schema.json).
Fields such as `reason`, `needsVerification` and `issues` carry uncertainty;
a confidence score does not approve a venue. Comment evidence unsupported by
the stock schema stays in the source ledger rather than receiving a false
source label.

Export verified candidates under `videos[].locations[]` in
`.claude/workspace/youtube/{ID}/locations.json`, retaining video ID, title,
concept and playlist memberships in the review record. Each exported location
has the verified name/address/coordinates/`googleMapsId`, source provenance,
supported timestamp when known, `videoUrlWithTimestamp`, and public
`description`. A worked shape is in
[the examples](../examples/place-resolution.md#verified-export-shape).
Only this verified copy becomes input to `youtube-create-sunrei`; held
candidates remain visible in review with no accepted pin.

## Report and Handoff

Report the selected/processed videos, extracted destinations, identities
resolved, Google matches verified, held/excluded candidates, and unknown scene
times. Give the specific missing fact for each hold. These counts can differ.

Hand the result to `youtube-to-sunrei` for approval or an explicitly requested
admin review import. This extraction skill does not create spots, approve
candidates, publish Sunreis, or silently accept transcript corrections.
When reprocessing edited videos, compare against the current evidence and
preserve earlier decisions as history; do not let an old geocode decide the
new visit's identity.
