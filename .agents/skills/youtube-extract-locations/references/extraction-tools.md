# Extraction Tools by Phase

Tools support the phases; their cached outputs do not bypass a phase's exit
condition. Scripts below live under `.claude/scripts/youtube/`.

## Evidence and Text Candidates — Phases 2–3

Prepare one run per video from `youtube-fetch-info` and
`youtube-extract-transcript`, then:

```bash
uv run python .claude/scripts/youtube/evidence_timeline.py "{RUN_DIR}"
uv run --with openai-codex==0.160.0 python .claude/scripts/youtube/extract_locations_headless.py "{RUN_DIR}"
```

The headless extractor consumes metadata plus text windows, writes
`location_candidates.json` with pending decisions, and does not browse,
geocode, or write spots. It does not see frames. Its treatment of creator
comments is limited as described in [source evidence](source-evidence.md#current-tool-boundary).
Review omitted sources alongside its output; do not count them as consumed.
Use `--restart` only when intentionally replacing a cached proposal, keeping
previous decisions and raw inputs available for comparison.

For structured descriptions, use only `fetch` and `parse` first, as described
in [description parsing](description-first.md). All extraction paths still
need the timed evidence for visit context and source-link times.

## Named Lookup — After the Phase 4 Gate

The Google key is loaded by the existing helpers from `YOUTUBE_API_KEY` or
`google.youtubeApiKey` in the server's `application-local.conf`. Keep it out
of model input and logs. Follow [geocoding and review](geocoding-and-review.md)
for query/result checks and targeted Places calls.

```bash
uv run python .claude/scripts/youtube/geocode.py --query "<evidenced venue name>" --area "<city country>"
```

`geocode.py <ID>` fills missing pins in a workspace. Use it only when every
entry it would query passed the gate. It can skip entries with existing
coordinates, so run final verification independently of its skipped count.
Numeric-prefix guards can reject real names; use a direct named lookup after
source verification rather than deleting digits or using an address alone.

`geocode_food_vendors.py <ID> <vendors.json>` and the description helper's
`geocode`/`all` modes also query Places. They are not identity research tools.
For mixed ready/held candidates, prefer individual ready-candidate queries.
Pace lookups and retry only the failed requests after API throttling.

## Existing Collector Suggestions

`renew_playlists.py` currently generates preliminary geocode suggestions
automatically. They do not show that the pre-lookup identity gate was passed.
When resuming such runs, reconstruct the identity decision from the original
evidence before accepting any suggested place. No warning, an API status,
or a completed extraction run substitutes for that review.

For a new manual extraction that must defer map lookup, use the separated
text-candidate and named-lookup tools above. These instructions do not add
phase enforcement or comment support to the automated collector.

## Changed Videos

When content was re-edited, recollect the current evidence and rebuild its
candidates. Keep earlier decisions as history. Reuse a geocode only after
confirming that the same venue/premises still appears; cached coordinates
must not decide identity for a new scene.

## Review Boundaries of Stock Tools

The subagent artifacts supply guarantees the current scripts do not:

- The strict candidate schema has no stable IDs, source URLs, comment kind,
  explicit premises fields or nullable quote times. Use review sidecars.
- The headless extractor merges candidates by normalized name alone and drops
  empty names. That can collapse distinct branches/visits or omit an unnamed
  destination. Compare the source ledger and retain separate sidecar records
  where the name is not sufficient identity; never accept the merge blindly.
- An existing `location_candidates.json` is reused by file existence, without
  checking its recorded source/prompt hashes. The coordinator must check inputs
  and policy before reuse. Preserve old proposals before using `--restart`.
- Extraction windows run sequentially and the final output is written after
  all finish. There is no persisted per-window checkpoint; do not promise
  retrying only a failed window without a separately checkpointing runner.
- Timeline `ready` means nonempty segments, not full-video coverage. Its
  duration can stop at the final evidence event, and source selection uses
  existing files rather than guaranteeing a useful fallback. Compare source
  coverage with video duration and inspect empty/error tracks explicitly.

Stable IDs, manifest transitions and input-hash invalidation are coordinator
responsibilities under the [handoff contract](subagent-workflow.md), not new
features automatically provided by these instructions.
