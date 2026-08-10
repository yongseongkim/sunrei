# YouTube Renewal Automation

The renewal job checks selected playlists for new videos and prepares a
multimodal, reviewable ingest. It reads production Sunrei spots as a duplicate
check, but never changes the Admin API, a Sunrei, or its spots.

## Workflow

1. Read `.claude/config/youtube-renewal.json`.
2. Fetch every enabled playlist from the YouTube Data API.
3. Read the configured production Sunrei and collect video IDs from its spot
   links. If this lookup fails, stop processing that playlist.
4. Compare remote video IDs with the production IDs, existing playlist
   workspace, and local automation state.
5. For each new video, attempt all three evidence sources:
   - YouTube captions
   - Whisper transcription of the audio
   - OCR of text visible in the video
6. Run transcript review and location candidate extraction with `codex exec`.
7. Save the run as `review_pending`.
8. With `--upload`, gzip JSON artifacts and upload them under an immutable S3
   run path. Raw audio and video are deleted by the evidence scripts and are
   never artifacts.

The job retries failed videos on a later run. A video becomes known only after
all local review artifacts are ready. Videos removed from a playlist are
reported but never deleted from S3 or Sunrei automatically.

## Playlist Policy

Playlist inclusion belongs in `.claude/config/youtube-renewal.json`, so the
policy is reviewed in Git. Dynamic state and downloaded results belong under
`.claude/workspace/youtube/automation/`, which is ignored by Git.

Each existing playlist entry includes its production `sunreiId`. The current
policy enables the selected active food and travel playlists, disables the
completed Street Food Fighter seasons, and leaves the Korea and Singapore
playlists outside daily renewal. An explicit `--playlist` argument can run a
disabled entry for testing or backfill.

## Commands

Inspect new videos without changing local state:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py
```

Mark the current remote playlist contents as the initial baseline without
processing old videos:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py --bootstrap --commit
```

Process at most one new video locally:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py \
  --commit --max-videos 1
```

Process and upload pending artifacts:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py \
  --commit --upload
```

Do not use `--bootstrap` after normal operation starts. It intentionally treats
every current remote video as already known.

## Artifact Layout

Each uploaded run uses this immutable prefix:

```text
s3://sunrei-resources/youtube/artifacts/v1/
  playlists/{playlistId}/videos/{videoId}/runs/{runId}/
```

JSON files are stored as `.json.gz` with raw and compressed SHA-256 values in
`manifest.json`. The per-video `latest.json` pointer changes only after every
run object and its manifest upload successfully.

The S3 uploader decrypts the existing `aws-access-key-id` and
`aws-secret-access-key` values from `deploy/secrets/secrets.enc.yaml`. Codex
runs in an empty, read-only temporary directory without AWS, SOPS, Google,
GitHub, YouTube, or Admin API credentials.

The renewal process itself uses a short-lived Admin JWT to read each production
Sunrei before discovery. The token is not passed to Codex, and the automation
does not issue Admin API write requests.

## Scheduling

The launchd definition runs every day at 04:30 local time:

```text
.claude/launchd/com.yongseongkim.sunrei-youtube-renewal.plist
```

Test a committed run manually before loading the agent. After validation, link
the plist into `~/Library/LaunchAgents` and load it with `launchctl bootstrap`.
The Mac must be on, and the saved Codex CLI login must remain valid.

## Approval Boundary

`transcript_review.json` corrections and `location_candidates.json` locations
start with `decision: pending`. S3 upload preserves that state for review; it
does not approve the data. Geocoding, updating `locations.json`, and calling the
Admin API remain separate approved actions.

After accepting transcript corrections, rebuild `transcripts.reviewed.json`
with `review_transcripts.py --max-new-chunks 0`, then rerun location extraction
with `extract_locations_headless.py --restart`. The location extractor prefers
the reviewed transcript over raw captions.
