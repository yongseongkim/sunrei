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
   Checkpoint: the user accepts or rejects proposed transcript corrections
   before those corrections enter saved text. Pending proposals can accompany
   extraction or an explicitly requested admin review import.
3. Extract locations with `youtube-extract-locations`: establish scope,
   collect source evidence including needed creator comments, build contextual
   candidates, resolve identity before new map queries, verify the exact
   Google place, then reconcile the final set. Its references hold commands,
   detailed checks, export formats, and examples. The coordinator delegates
   narrow subagents and validates their stage artifacts under its handoff
   contract before advancing. Early collector geocodes are
   unverified proposals; write only verified matches to `locations.json`.
   Checkpoint: the user approves the location list, unless they explicitly
   requested an admin review import under the Approval Boundaries below.
4. Create the Sunrei with `youtube-create-sunrei`. It composes the Sunrei,
   builds one SunreiSpot per approved location, creates a draft through the
   admin API, then verifies the saved database records.
   For a playlist, it copies the playlist's own cover through the image upload
   API and saves the returned S3 size variants. Registration and renewal use
   the same path; see `references/playlist-renewal.md` for existing covers.
   Check the spot table against the approved locations and tag choices. Reuse
   that approval when the payload agrees; ask only for new choices or changes.

## Approval Boundaries

- Carry forward explicit approvals, exclusions, and holds already given for
  this scope. Ask for a decision only when it remains unresolved or the scope
  changes.
- Normally the user approves the location list before a Sunrei write. An
  explicit request to upload for review in admin authorizes importing into
  unpublished drafts without asking for the same approval again. Keep
  unresolved venue/branch conflicts held, preserve transcript decisions, and
  identify the result as a review draft. A candidate transferred with
  `APPROVED` is not evidence that a person verified its quality.
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
playlists, and any source migration left undone. State
publication status separately. Distinguish evidence collection, location
extraction, venue verification, draft upload, and publication; report unresolved
identity, address, transcript, and scene-time issues without calling them all
wrong places. Describe a completed batch by its scope; finishing extraction or
upload does not imply every venue is verified or the whole channel processed.

When the user asks to clean up, first confirm that collection evidence is
stored and readable through the DB API, including creator comments when used.
Remove completed-run caches, logs, disposable helpers, and redundant snapshots.
Retain a compact current review record for unresolved decisions and applied
place corrections that are not represented by the original candidates. Do not
keep a second registry or treat an old import script as the current state.

## References

- `references/playlist-renewal.md`: registering a playlist, running the
  collector once or on a schedule, and what happens to the results.
- `references/audit-existing.md`: the audit checklist for an older Sunrei and
  how to repair its contexts and places.
