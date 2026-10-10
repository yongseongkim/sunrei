# YouTube Renewal Automation

The renewal job checks registered playlists for new videos, extracts location
candidates, and stores everything in the Sunrei DB through the admin YouTube
API (`/admin/youtube/*`). Candidates become Sunrei spots only when an admin
approves them, so the job never changes a Sunrei itself.

Because all state lives behind the API, the job runs on any machine that
reaches it. `SUNREI_API_URL` selects the server; it defaults to production
(`https://sunrei-api.yongseongkimm.com`), and the CronJob uses the in-cluster
service.

## Workflow

1. List the playlists with `syncEnabled` from the API.
2. Fetch each playlist and its video details from the YouTube Data API.
3. Send the current video list to `PUT /admin/youtube/playlists/{id}/videos`.
   The server records new videos as `PENDING`, marks missing ones as removed,
   and returns the videos waiting for processing (`PENDING`, then `FAILED`).
4. For each pending video, up to `--max-videos` per run:
   - set it to `PROCESSING` and attempt captions, Whisper, and video OCR;
   - store each usable source as a `CAPTIONS`, `WHISPER`, or `OCR` text and
     record each failed source as an attempt;
   - review the primary transcript and store `TRANSCRIPT_REVIEWED` and
     `TRANSCRIPT_REVIEW`;
   - merge the sources into one timestamp-ordered timeline and store it as
     `TIMELINE`;
   - extract location candidates with the shared rules in
     `prompts/extract_locations.md`, geocode each candidate as a suggestion,
     and store the extraction run with its raw output and candidates;
   - set the video to `REVIEW_PENDING`, or `COMPLETED` when no candidate was
     found.
5. A failure sets the video to `FAILED` with the stage and error, and a later
   run retries it.

Codex (Python SDK) runs the agents first; when it fails, for example on a usage
limit, Claude Code (`claude -p`) runs the same prompt and schema.
`STRUCTURED_AGENTS` changes the order.

Intermediate files are cached under `$SUNREI_YOUTUBE_AUTOMATION_ROOT/runs/{videoId}`
so a retry skips finished steps, and they are deleted once the video is stored.
A video left `PROCESSING` by an interrupted run is reset to `FAILED` after
`--stale-hours` (default 24).

## Playlists

Register a playlist with the Sunrei that approved places go to. By default its
current videos are recorded as `SKIPPED`, so only videos added later are
processed; `--baseline none` queues every current video.

```bash
uv run python .claude/scripts/youtube/youtube_playlists.py list
uv run python .claude/scripts/youtube/youtube_playlists.py add PLAYLIST_ID --sunrei SUNREI_ID
uv run python .claude/scripts/youtube/youtube_playlists.py update PLAYLIST_ID --disable
```

`migrate_legacy_state.py` moves the earlier file-based state (the playlist list
and S3 baselines) into the DB once. It is a dry run unless `--commit` is given.

## Commands

Show new and pending videos without changing anything:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py
```

Process at most one pending video, optionally from a specific playlist:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py \
  --commit --max-videos 1 [--playlist PLAYLIST_ID]
```

An explicit `--playlist` also runs a playlist whose sync is disabled.

## Credentials

- `YOUTUBE_API_KEY`: a server key for the YouTube Data API and Places API. The
  Maps key in `google-maps-api-key` is referrer-restricted and cannot be used.
  Locally, the key is read from `application-local.conf`.
- Admin API: a short-lived admin JWT minted from `AUTH_JWT_SECRET`, or locally
  from `deploy/secrets/secrets.enc.yaml` with SOPS. The token is re-minted
  before it expires during a long run.
- Codex and Claude run in an empty temporary directory without tools and
  without SOPS, Google, GitHub, YouTube, Anthropic API, or Admin API
  credentials. The admin token is never passed to an agent.

## Scheduling

The production Helm chart runs the worker as a k3s CronJob every day at 04:30
Asia/Seoul. The chart stores the UTC equivalent, `30 19 * * *`, and uses
`concurrencyPolicy: Forbid` so a slow Whisper/OCR run cannot overlap the next
one.

The worker uses a retained PVC for:

- cached run files of videos still in progress
- the Codex `auth.json` cache refreshed by the CLI
- uv dependency and Whisper model caches

Prepare the SOPS-encrypted login seed before enabling the first job. Sign in
to Codex in a dedicated `CODEX_HOME`, so the job does not share a refresh token
with another Codex consumer on the host. `claude setup-token` prints a one-year
subscription token; it is optional and only used as the fallback.

```bash
export CODEX_HOME="$(mktemp -d)"
codex login -c 'cli_auth_credentials_store="file"' --device-auth
read -rs CLAUDE_CODE_OAUTH_TOKEN && export CLAUDE_CODE_OAUTH_TOKEN  # paste the setup-token output
.claude/scripts/youtube/prepare_codex_auth_secret.sh "$CODEX_HOME/auth.json"
sops -d deploy/secrets/youtube-renewal-auth.enc.yaml | kubectl create -f -
```

`ANTHROPIC_API_KEY` is removed from the Claude environment, so the fallback
never switches to pay-per-token billing. The Claude subscription limit is
shared with interactive Claude Code use.

After the worker image has been released and ArgoCD has synced the chart, start
one job manually and inspect it before waiting for the schedule:

```bash
kubectl -n sunrei create job --from=cronjob/sunrei-youtube-renewal \
  sunrei-youtube-renewal-manual
kubectl -n sunrei logs -f job/sunrei-youtube-renewal-manual
```

YouTube blocks captions and media downloads from datacenter IPs, so the
evidence stage can fail on the cluster. The local launchd definition runs the
same job from a residential connection every day at 04:30 local time:

```text
.claude/launchd/com.yongseongkim.sunrei-youtube-renewal.plist
```

Both runners share the DB state, and `PROCESSING` marks a video in progress,
but run only one of them on a schedule to avoid processing the same video
twice.

## Approval Boundary

Extracted candidates start as `PENDING`. An admin approves or rejects each one
with `PATCH /admin/youtube/extracted-places/{id}`; approval adds a spot to the
playlist's Sunrei, using the reviewer's place or the geocoded suggestion. The
video becomes `COMPLETED` once no candidate is pending. Rejected candidates
remain for reference.
