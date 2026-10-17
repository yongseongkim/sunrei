# YouTube Renewal

The renewal command checks registered playlists for new videos, extracts location
candidates, and stores everything in the Sunrei DB through the admin YouTube
API (`/admin/youtube/*`). Candidates become Sunrei spots only when an admin
approves them, so the command never changes a Sunrei itself.

Because all state lives behind the API, the command runs on any machine that
reaches it. `SUNREI_API_URL` selects the server; it defaults to production
(`https://sunrei-api.yongseongkimm.com`).

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
   - when no source is usable and the audio and video downloads were refused
     as members-only, set the video to `SKIPPED` and stop; a caption block
     alone does not stop the video, because Whisper and OCR continue;
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

## Video States

| From | To | When |
| --- | --- | --- |
| new in the playlist | `PENDING` | the sync finds a video that is not stored yet |
| current at registration | `SKIPPED` | `youtube_playlists.py add` with the default `--baseline all` |
| `PENDING`, `FAILED` | `PROCESSING` | a committed run picks the video up |
| `PROCESSING` | `REVIEW_PENDING` | candidates were stored and wait for review |
| `PROCESSING` | `COMPLETED` | the extraction found no candidate |
| `PROCESSING` | `SKIPPED` | no source was usable and the downloads were refused as members-only |
| `PROCESSING` | `FAILED` | any other error; the stage and error are recorded and the next run retries |
| `PROCESSING`, stale | `FAILED` | untouched for longer than `--stale-hours` |
| `REVIEW_PENDING` | `COMPLETED` | no candidate is pending any more |

`SKIPPED` videos are never retried. A members-only video that an earlier run
left `FAILED` is detected on its retry and becomes `SKIPPED`. Until a candidate
is approved, nothing in this table changes a Sunrei.

## Playlists

Register a playlist with the Sunrei that approved places go to. By default its
current videos are recorded as `SKIPPED`, so only videos added later are
processed; `--baseline none` queues every current video.
`--disabled` keeps it out of periodic runs. `syncEnabled` only selects the
playlists a run without `--playlist` processes.

```bash
uv run python .claude/scripts/youtube/youtube_playlists.py list
uv run python .claude/scripts/youtube/youtube_playlists.py add PLAYLIST_ID --sunrei SUNREI_ID
uv run python .claude/scripts/youtube/youtube_playlists.py update PLAYLIST_ID --disable
```

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

- `YOUTUBE_API_KEY`: a server key for the YouTube Data API and Places API,
  read from `application-local.conf` when unset. The Maps key in
  `google-maps-api-key` is referrer-restricted and cannot be used.
- Admin API: a short-lived admin JWT minted from `AUTH_JWT_SECRET`, or locally
  from `deploy/secrets/secrets.enc.yaml` with SOPS. The token is re-minted
  before it expires during a long run.
- Codex and Claude run in an empty temporary directory without tools and
  without SOPS, Google, GitHub, YouTube, Anthropic API, or Admin API
  credentials. The admin token is never passed to an agent.
- `ANTHROPIC_API_KEY` is removed from the Claude environment, so the fallback
  uses the Claude subscription and never bills per token.

## Scheduling

Schedule the committed command with launchd or cron on a machine YouTube does
not block; it does not need a Claude Code session. YouTube blocks captions and media downloads
from datacenter IPs, so the cluster cannot run it.

`PROCESSING` marks a video in progress, but run only one schedule at a time to
avoid processing the same video twice.

## Approval Boundary

Extracted candidates start as `PENDING`. An admin approves or rejects each one
with `PATCH /admin/youtube/extracted-places/{id}`; approval adds a spot to the
playlist's Sunrei, using the reviewer's place or the geocoded suggestion. The
video becomes `COMPLETED` once no candidate is pending. Rejected candidates
remain for reference.
