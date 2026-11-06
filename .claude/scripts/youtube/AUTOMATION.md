# YouTube Renewal

The renewal command checks registered playlists for new videos, extracts location
candidates, and stores everything in the Sunrei DB through the admin YouTube
API (`/admin/youtube/*`). No separate S3 JSON registry is maintained.
Candidates become Sunrei spots only when an admin
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
   - fetch creator comments, verifying the video's owner channel ID rather
     than the playlist owner or display name; record pagination/coverage;
   - review the primary transcript and store `TRANSCRIPT_REVIEWED` and
     `TRANSCRIPT_REVIEW`;
   - merge the sources into one timestamp-ordered timeline and store it as
     `TIMELINE`;
   - extract location candidates with the shared rules in
     `prompts/extract_locations.md`, including verified creator comments;
   - resolve each candidate's name, area and distinguishing premises from
     cited original evidence before querying Places; uncertain identities
     stay held without a query;
   - compare the raw Places response against the ready identity, then store
     the extraction run, comments, phase artifacts and candidate proposals;
   - set the video to `REVIEW_PENDING`, or `COMPLETED` when no candidate was
     found.
5. A failure sets the video to `FAILED` with the stage and error, and a later
   run retries it.

Codex (Python SDK) runs the agents first; when it fails, for example on a usage
limit, Claude Code (`claude -p`) runs the same prompt and schema.
`STRUCTURED_AGENTS` changes the order.

Intermediate files are cached under `$SUNREI_YOUTUBE_AUTOMATION_ROOT/runs/{videoId}`.
`stage-store/manifest.json` points to immutable attempts, with input, policy,
code and output hashes. Reuse requires valid hashes; changes invalidate the
affected window/candidate and downstream judgments. Conventional output files
are rebuilt from accepted attempts. Transcript chunks validate their own
prompt/schema/source hashes and retain old decisions as history.

Candidates receive UUIDs from original scene/source anchors, never their name,
array position or Google ID. Ambiguous shared anchors receive new held IDs
with registry lineage, so reordering cannot transfer another venue's decision.
Artifacts remain locally after success; the exported snapshot and creator
comments are also in the DB run's `rawOutput`. Remove local caches only after
verifying those remote records; they are not a playlist registry.

Renewal reconciles text and successful-run writes through fresh video-detail
GETs before POST and after uncertain responses. An acknowledged export receipt
lets a retry finish the status update without reimporting candidates or
overwriting intervening admin decisions. Run one collector at a time: this
client check is not a server-side concurrent-writer uniqueness constraint.
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

A candidate whose name the extractor marked unknown ("상호 미상") gets no
suggestion, because a search by what the video shows and its area returns
whatever place is nearby.
A ready identity requires exact source-backed name, area and premises fields.
The matcher keeps the raw provider response and identity revision. A differing
provider name or unresolved branch/address is held without an attached place.
These text-only agents cannot browse or resolve historical moves; research
held cases on the web before approving. Stage 05 independent/final review
remains manual/admin-owned; automated stages 01–04 never approve a spot.
See "Reviewing Candidates" in
`.agents/skills/youtube-to-sunrei/references/playlist-renewal.md`.

Comments default to at most 20 thread pages and 20 pages per reply thread;
partial/failed coverage is explicit and retried rather than cached complete.
The API does not expose pin status. Metadata-only candidates may be collected
when timed evidence is unavailable, with scene time unknown. If all timed
sources fail and metadata yields no candidates, the video stays failed for
retry rather than being declared complete. Members-only skips take priority.
Actual timed evidence at 0 produces `timestampSeconds: 0`. Metadata/comment
quotes keep null times in artifacts; the unchanged admin evidence DTO uses
0 as its legacy placeholder, while `timestampSeconds` remains null.

## Playlist covers

Playlist metadata includes the playlist resource's own `thumbnailUrl`.
Workspace creation, registration and committed renewal send one large cover to
`POST /admin/images/upload-url`. The server downloads it, generates size
variants, and stores them in S3; the returned URLs and actual dimensions are
saved as one group in `Sunrei.images`. Small list rows can use the 200px variant
while larger versions remain available for detail views.

Empty covers and a single cover group whose URLs match the current YouTube
playlist cover are migrated. Already stored S3 covers and other custom covers
are kept. A playlist link must match before its cover is used. Upload failure
keeps the old cover; a cover edited during upload is reported as `kept_changed`.
This never changes spots or publication. Individual video covers and channel
avatars keep their current behavior.

To fill covers on existing registered playlists without collecting videos or
extracting places, preview eligibility and then copy the images:

```bash
uv run python .claude/scripts/youtube/playlist_covers.py [--playlist PLAYLIST_ID]
uv run python .claude/scripts/youtube/playlist_covers.py [--playlist PLAYLIST_ID] --commit
```

The command uses `SUNREI_API_URL` (production by default). It leaves an existing
custom Sunrei cover, an unlinked playlist, or a mismatched Sunrei link unchanged.
Dry-run makes no image upload or content write. After an uncertain upload or
write, inspect the live Sunrei before retrying.
