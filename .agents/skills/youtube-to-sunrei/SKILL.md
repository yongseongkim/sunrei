---
name: youtube-to-sunrei
description: Run the complete YouTube-to-Sunrei workflow. Use when the user asks to convert a YouTube video or playlist into a Sunrei, process a YouTube URL end to end, continue a partially completed ingest, or register and renew tracked playlists.
---

# Convert YouTube Content to a Sunrei

Coordinate the four YouTube skills for one video or playlist URL. This skill
owns the order of the steps and the approval checkpoints. Each sub-skill owns
its own commands and rules, and ends by reporting its result rather than
starting the next step.

## Choose a Mode

- New video or playlist: run the workflow below from step 1.
- Resume a workspace: `.claude/workspace/youtube/{ID}/` already exists. See
  "Resume or Recover".
- Renew a registered playlist: the collector processes new videos without
  checkpoints and leaves candidates for admin review. See
  `references/playlist-renewal.md`.
- Audit an existing Sunrei: check and repair weak spots from an older ingest
  before extending it. See `references/audit-existing.md`.

## Workflow

Keep the selected playlist or video metadata and final `locations.json` in
`.claude/workspace/youtube/{ID}/`. Evidence collection and timeline extraction
use one run directory per selected video; the transcript skill explains the
metadata and description files each run needs. Assemble approved per-video
locations into the workspace's final `locations.json`.

1. Fetch metadata with `youtube-fetch-info`. It saves `video_info.json`,
   including the `channel` object that becomes the Source, and for a playlist
   settles which videos to process.
   Reuse the user's selected scope; resolve an ambiguous selection before
   collecting evidence.
2. Collect evidence with `youtube-extract-transcript`, once per selected
   video. It collects captions, Whisper, and OCR for every video, runs the
   isolated transcript reviewer, and builds `evidence_timeline.json`.
   Checkpoint: the user accepts or rejects the review proposals. Candidates
   may be extracted from a timeline with pending proposals, but nothing is
   saved to a Sunrei until the decisions are explicit.
3. Extract locations with `youtube-extract-locations`. It chooses the
   extraction path from the videos' structure and evidence, applies the shared
   rules in `.claude/scripts/youtube/prompts/extract_locations.md`, geocodes,
   and writes the reviewed list to `locations.json`.
   Checkpoint: the user approves the location list.
4. Create the Sunrei with `youtube-create-sunrei`. It composes the Sunrei,
   builds one SunreiSpot per approved location, creates a draft through the
   admin API, and updates the channel registry.
   Check the spot table against the approved locations and tag choices. Reuse
   that approval when the payload agrees; ask only for new choices or changes.

## Approval Boundaries

- Carry forward explicit approvals, exclusions, and holds already given for
  this scope. Ask for a decision only when it remains unresolved or the scope
  changes.
- No Sunrei is created or updated before the location list is approved.
- Resolve transcript proposals under the transcript skill's review rules;
  a pending proposal is not an accepted correction.
- Created Sunreis are drafts. Publish only when the user asks.
- A members-only video ends the pipeline for that video. Do not look for its
  places another way.

## Resume or Recover

Before starting, inspect the workspace:

1. Identify the completed steps from the files present: `video_info.json`,
   the evidence files and `evidence_timeline.json`, `location_candidates.json`
   or `locations.json`.
2. Summarize the saved progress and resume when the user asked to continue.
   Ask only when choosing a workspace or replacing saved decisions is unclear.
3. When a step fails, report the error and retry that step only. Intermediate
   files stay, so the user can stop at any checkpoint and continue later.

If videos were re-edited after an earlier ingest, redo steps 2 and 3 against
the current video; `youtube-extract-locations` explains how to keep verified
geocodes.

## Finish

Report the selected videos and the counts of evidence collected, locations
reviewed, and spots saved. List unresolved locations, unprocessed videos or
playlists, registry failures, and any source migration left undone. State
publication status separately. Describe a completed batch by its scope;
finishing it does not mean the whole channel has been processed.

## References

- `references/playlist-renewal.md`: registering a playlist, running the
  collector once or on a schedule, and what happens to the results.
- `references/audit-existing.md`: the audit checklist for an older Sunrei and
  how to repair its contexts and places.
