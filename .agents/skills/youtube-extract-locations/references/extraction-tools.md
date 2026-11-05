# Extraction Tools by Phase

Scripts below live under `.claude/scripts/youtube/`. Cached output does not
bypass a phase's exit condition. See `AUTOMATION.md` for automatic renewal.

## Evidence and Text Candidates — Phases 2–3

Prepare one run per video with metadata, available timed sources and the
verified `creator_comments.json` envelope described in
[source evidence](source-evidence.md#current-tool-boundary), then:

```bash
uv run python .claude/scripts/youtube/evidence_timeline.py "{RUN_DIR}"
uv run --with openai-codex==0.160.0 python .claude/scripts/youtube/extract_locations_headless.py "{RUN_DIR}"
```

The extractor consumes metadata, verified creator comments and text windows,
writes `location_candidates.json` with pending decisions, and does not browse,
see frames, geocode or write spots. It supports metadata-only proposals with
unknown scene times; that does not establish full visit context or coverage.

Window attempts are persisted separately, so a retry reuses valid completed
windows. Reuse checks inputs, prompts, schema, provider code and configuration,
not just file existence. `--restart` forces new attempts while retaining old
proposals/history. Legacy output is archived before replacement.

For structured descriptions, use only `fetch` and `parse` first, as described
in [description parsing](description-first.md). Timed evidence is still needed
for visit context and source-link times.

## Identity and Map Proposals — Phases 4–5

```bash
uv run --with openai-codex==0.160.0 python .claude/scripts/youtube/location_workflow.py "{RUN_DIR}"
```

Use `--no-geocode` to resolve source-backed identities without Places requests.
The runner writes accepted envelopes `01-evidence.json`, `02-candidates.json`,
`03-identities.json` and `04-matches.json`, plus `location_workflow.json`.
`stage-store/manifest.json` and immutable attempts hold input/policy/output
hashes, run/candidate IDs, failures and lineage. Each candidate's identity and
match are cached independently; a revised identity invalidates its match.
These are local workflow objects, not API DTOs or DB status values.

Only ready identities with cited original name, area and distinguishing
premises enter Places. The matcher preserves the raw response and compares
name, region and premises. A provider-added branch/name cannot rescue missing
source evidence. Held/excluded identities remain review candidates without a
lookup or attached place. The agents cannot browse, resolve moves or use
uncited model knowledge: research those cases separately under the full
[handoff contract](subagent-workflow.md). Stage 05 independent/final review
remains coordinator/admin work; accepted matches are proposals, never approvals.

The Google key comes from `YOUTUBE_API_KEY` or `google.youtubeApiKey` in
`application-local.conf`, never model input or logs. For researched cases that
passed the full identity gate, use a targeted named lookup:

```bash
uv run python .claude/scripts/youtube/geocode.py --query "<evidenced venue name>" --area "<city country>"
```

The legacy `geocode.py <ID>`, `geocode_food_vendors.py` and description
helper's `geocode`/`all` modes do not enforce this gate. Use them only when every
entry they would query already passed it. Numeric-prefix guards in those
helpers can reject real names; retain the digits and use verified targeted
lookup rather than an address alone. Pace requests and retry failed calls.

## Changed Videos and Cleanup

Recollect evidence when a video is edited. A local cache cannot detect a
remote edit while the same video ID and source settings remain unchanged.
Explicitly force/recollect those sources; preserve earlier review decisions as
history. Reuse a pin only after confirming the same premises still appears.

Renewal stores comments and workflow snapshots in the extraction run's DB
`rawOutput`, with source texts referenced by ID. It retains local artifacts for
resume/debugging. Verify remote evidence before cleanup. A stored-export receipt
prevents duplicate import after an interrupted final status update; intentionally
re-extracting an already exported video requires coordinator review of that
receipt rather than silently replacing admin decisions.

## Review Boundaries of Stock Tools

- The strict model schema has comments and nullable times, but source URLs,
  identity fields and candidate IDs live in workflow sidecars. The admin evidence
  DTO still uses 0 for missing time; scene `timestampSeconds` stays null.
- Window merging requires matching name/area and overlapping scene evidence;
  distinct regions and distant visits survive. Dense same-name visits can still
  need manual split/merge. Shared ambiguous anchors stay held with new IDs and
  lineage rather than inheriting another candidate's decision.
- Timeline ready means nonempty segments, not full-video coverage. Duration can
  stop at the final evidence event, and first-existing track selection may need
  manual fallback for an empty/error reviewed file. Compare source coverage with
  video duration; missing evidence is not proof that no destination exists.
- Automatic lookup examines the first Places result conservatively. Differing
  scripts/names, aliases, historical premises and uncertain address comparisons
  require research. A held result is not an excluded destination.
- Renewal imports review candidates only. It does not create `05-review.json`,
  approve places, create spots or publish a Sunrei. The manual coordinator still
  owns user decisions and final independent review.
