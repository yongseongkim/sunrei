# YouTube Renewal Automation

The renewal job checks selected playlists for new videos and prepares a
multimodal, reviewable ingest. It reads production Sunrei spots as a duplicate
check, but never changes the Admin API, a Sunrei, or its spots.

## Workflow

1. Read `.claude/config/youtube-renewal.json`.
2. Fetch every enabled playlist from the YouTube Data API.
3. Read the configured production Sunrei and collect video IDs from its spot
   links. If this lookup fails, stop processing that playlist.
4. Compare remote video IDs with the production IDs, the latest S3 playlist
   baseline, existing playlist workspace, and local automation state.
5. For each new video, attempt all three evidence sources:
   - YouTube captions
   - Whisper transcription of the audio
   - OCR of text visible in the video
6. Normalize the reviewed transcript, Whisper output, and OCR into one
   timestamp-ordered `evidence_timeline.json`.
7. Give Codex the video metadata and the relevant timeline window, then extract
   location candidates and supporting details.
8. Save the run as `review_pending`.
9. With `--upload`, gzip JSON artifacts and upload them under an immutable S3
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

Back up existing workspace JSON and create a fresh baseline for every
configured playlist:

```bash
uv run --with boto3 python \
  .claude/scripts/youtube/sync_workspace_s3.py --commit
```

Run this command before removing historical workspace data from Git. Without
`--commit`, it validates the JSON, checks for credential patterns, fetches the
current YouTube and production baselines, and prints the upload plan without
changing S3.

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

The immutable run keeps both source and derived artifacts:

| Role | Files |
| --- | --- |
| Source | `metadata.json`, `captions.json`, `audio_transcript.json`, `onscreen_text.json` |
| Normalized source | `transcripts.json`, `evidence_timeline.json` |
| Review and derived | `transcript_review.json`, `transcripts.reviewed.json`, `location_candidates.json` |

`metadata.json` contains the channel, title, description, playlist, and video
URL. `evidence_timeline.json` records every selected transcript, Whisper, and
OCR segment with its source and start/end time. The raw modality files remain
available so a bad timeline or Codex result can be reproduced and debugged.
Every manifest entry includes its artifact role and SHA-256.

Playlist baselines and historical workspace snapshots use separate immutable
paths:

```text
playlists/{playlistId}/snapshots/{snapshotId}/
playlists/{playlistId}/workspace-snapshots/{snapshotId}/
workspaces/{workspaceId}/snapshots/{snapshotId}/
```

A playlist baseline stores the latest channel, playlist, video title,
description, duration, thumbnail, and the known-video state used for renewal.
A workspace snapshot preserves the existing JSON hierarchy, including source,
review, derived, and intermediate files needed for debugging. Raw media,
automation runtime state, logs, and non-JSON files are excluded.

Each snapshot has a manifest with raw and compressed SHA-256 values. The sync
command reads every uploaded object back and verifies both hashes before it
updates the corresponding `latest.json` or `workspace-latest.json` pointer. If
the artifact store is public, it also verifies the pointer without AWS
credentials.

The S3 uploader decrypts the existing `aws-access-key-id` and
`aws-secret-access-key` values from `deploy/secrets/secrets.enc.yaml`. Codex
runs in an empty, read-only temporary directory without AWS, SOPS, Google,
GitHub, YouTube, or Admin API credentials.

The renewal process itself uses a short-lived Admin JWT to read each production
Sunrei before discovery. The token is not passed to Codex, and the automation
does not issue Admin API write requests.

## Scheduling

The production Helm chart runs the worker as a k3s CronJob every day at 04:30
Asia/Seoul. The chart stores the UTC equivalent, `30 19 * * *`, and uses
`concurrencyPolicy: Forbid` so a slow Whisper/OCR run cannot overlap the next
one.

The worker uses a retained PVC for:

- `state.json` and resumable run artifacts
- the Codex `auth.json` cache refreshed by the CLI
- uv dependency and Whisper model caches

When a configured playlist has no local state, the worker restores its latest
S3 playlist baseline before discovery. This also covers a new PVC or a playlist
enabled after the PVC was created, without treating the existing catalog as
new videos.

Prepare the SOPS-encrypted login seed before enabling the first job:

```bash
codex login -c 'cli_auth_credentials_store="file"' --device-auth
.claude/scripts/youtube/prepare_codex_auth_secret.sh
sops -d deploy/secrets/youtube-renewal-auth.enc.yaml | kubectl create -f -
```

After the worker image has been released and ArgoCD has synced the chart, start
one job manually and inspect it before waiting for the schedule:

```bash
kubectl -n sunrei create job --from=cronjob/sunrei-youtube-renewal \
  sunrei-youtube-renewal-manual
kubectl -n sunrei logs -f job/sunrei-youtube-renewal-manual
```

The local launchd definition remains available for development and runs every
day at 04:30 local time:

```text
.claude/launchd/com.yongseongkim.sunrei-youtube-renewal.plist
```

Do not run launchd and the k3s CronJob at the same time. Although both are
resumable, their local state stores are independent and they can process the
same pending video twice.

## Approval Boundary

`transcript_review.json` corrections and `location_candidates.json` locations
start with `decision: pending`. S3 upload preserves that state for review; it
does not approve the data. Geocoding, updating `locations.json`, and calling the
Admin API remain separate approved actions.

After accepting transcript corrections, rebuild `transcripts.reviewed.json`
with `review_transcripts.py --max-new-chunks 0`, rebuild the timeline with
`evidence_timeline.py --force`, then rerun location extraction with
`extract_locations_headless.py --restart`.
