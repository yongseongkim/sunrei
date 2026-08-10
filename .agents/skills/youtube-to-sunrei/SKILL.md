---
name: youtube-to-sunrei
description: Run the complete YouTube-to-Sunrei workflow. Use when the user asks to convert a YouTube video or playlist into a Sunrei, process a YouTube URL end to end, or continue a partially completed ingest.
---

# Convert YouTube Content to a Sunrei

Run the four YouTube skills in sequence, pausing for approval at each checkpoint.

Accept either a video URL or a playlist URL.

## Choose the Extraction Strategy

Choose the Step 3 location path from the content type:

- Description-first: Use this for channels that put a Google Maps link or a
  structured `* 가게 정보` block per place in every description, such as food
  vlogs. Run `extract_from_descriptions.py` and skip transcripts.
- Transcript-driven: travel/architecture vlogs that name places only in the
  narration. Extract transcripts first (Step 2), then match places from them.
- Web-research: TV-show clip compilations whose titles name a dish but not a
  venue, such as 스트리트푸드파이터. Research the real vendors and geocode with
  `geocode_food_vendors.py`.

Inspect a few descriptions before choosing. Per-place map links or `가게 정보`
blocks mean description-first; unstructured descriptions require transcripts or
web research.

This optimization applies to an interactive one-time ingest. Daily renewal
still collects captions, audio transcription, and on-screen text for every new
video, including description-first channels. The extra evidence is retained for
name correction and audit even when description links remain the primary place
source.

## Re-Derive After Edits

If videos were re-edited after a prior ingest, re-extract transcripts before
reusing `locations.json`. Re-derive locations from the current transcript while
reusing verified geocodes. Back up the old file as `locations.legacy.json` and
follow the re-derivation section of `youtube-extract-transcript`.

## Workflow

### 1. Fetch Metadata

Run `youtube-fetch-info` with the provided URL.

- Fetch the video or playlist metadata and the owning channel.
- For a playlist, ask which videos to process.
- Save the result, including the `channel` object, to
  `.claude/workspace/youtube/{ID}/video_info.json`.

Ask for confirmation before extracting transcripts.

### 2. Extract Transcripts

Run `youtube-extract-transcript`.

- Extract, audit, and clean the transcript for each selected video.
- Let the user approve, revise, or skip each transcript.
- Save approved transcripts to
  `.claude/workspace/youtube/{ID}/transcripts.json`.

Do not extract locations until all retained transcripts are approved.

### 3. Extract Locations

Run `youtube-extract-locations`.

- Determine each video's geographic scope and theme.
- Collect locations with the chosen path: description-first, transcript-driven,
  or web research. Follow `youtube-extract-locations` for the detailed steps.
- Geocode and verify each place.
- Let the user add, edit, or remove locations.
- Save the approved list to `.claude/workspace/youtube/{ID}/locations.json`.

Do not create the Sunrei until the user approves the location list.

### 4. Create the Sunrei

Run `youtube-create-sunrei`.

- Treat one playlist or trip as one Sunrei and the channel as its Source.
- Derive the Sunrei summary and description from the transcripts.
- Convert every approved location into a SunreiSpot.
- Create a draft through the admin API and report the new Sunrei ID.

Let `youtube-create-sunrei` handle authentication, duplicate checks, spot
review, and S3 registry updates.

## Resume or Recover

Inspect `.claude/workspace/youtube/{ID}/` before starting:

1. Identify completed steps from the existing JSON files.
2. Summarize the saved progress.
3. Ask whether to resume or start over.

If a step fails, report the error and retry that step only. Preserve intermediate
files so the user can stop at any checkpoint and continue later.

## Daily Renewal

Playlist policy is stored in `.claude/config/youtube-renewal.json`. To inspect
enabled playlists without changing state, run:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py
```

A committed run discovers new videos, collects captions, Whisper output, and
video OCR, then builds a timestamped evidence timeline and runs the structured
Codex reviewers:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py --commit [--upload]
```

Before discovery, the job reads video IDs from the configured production
Sunrei's spot links. If that lookup fails, it skips the playlist instead of
risking duplicate work. The job is resumable and stops at `review_pending`. It
does not geocode, publish, change Sunrei spots, or update the channel registry.
Use `youtube-create-sunrei` only after transcript corrections and location
candidates have explicit decisions.

S3 runs retain `metadata.json`, each raw text source, and the normalized
`evidence_timeline.json` alongside the derived review files. Codex receives the
metadata plus one relevant timeline window at a time; it does not receive the
video or raw media.

Operational details, S3 paths, and launchd setup are documented in
`.claude/scripts/youtube/AUTOMATION.md`.
