---
name: youtube-to-sunrei
description: Run the complete YouTube-to-Sunrei workflow. Use when the user asks to convert a YouTube video or playlist into a Sunrei, process a YouTube URL end to end, continue a partially completed ingest, or register and renew tracked playlists.
---

# Convert YouTube Content to a Sunrei

Run the four YouTube skills in sequence, pausing for approval at each checkpoint.

Accept either a video URL or a playlist URL.

## Choose the Extraction Strategy

Choose the Step 3 location path from the content type:

- Description-first: Use this for channels that put a Google Maps link or a
  structured `* 가게 정보` block per place in every description, such as food
  vlogs. Run `extract_from_descriptions.py` and give those exact links priority
  when identifying places.
- Transcript-driven: travel/architecture vlogs that name places only in the
  narration. Collect multimodal text evidence first, then match places from the
  aligned timeline.
- Web-research: TV-show clip compilations whose titles name a dish but not a
  venue, such as 스트리트푸드파이터. Research the real vendors and geocode with
  `geocode_food_vendors.py`.

Inspect a few descriptions before choosing. Per-place map links or `가게 정보`
blocks mean description-first; unstructured descriptions require transcripts or
web research.

Collect captions, audio transcription, and on-screen text for every new video,
including description-first and web-research channels. Keep description links
as the primary place identity when they conflict with weaker ASR or OCR, while
retaining every source for correction and audit.

Whatever the path, the same rules from `prompts/extract_locations.md` apply:

- Select only the places worth visiting that the video introduces, the ones
  that fit the theme of its title and description. A place it mentions as a
  comparison or model, such as the New York building a Ginza building
  imitates, goes into the description of the introduced place, not onto the
  map. Leave out places the video recommends against, and stops that do not
  fit the theme, such as landmarks and shops passed on a food tour.
- A Google Maps link in the description is the best identity. A description
  address is weaker: when it contradicts the video, infer the region from the
  title, speech, and on-screen text, and search there.
- Use title and description, captions, Whisper, and OCR together, and always
  run OCR. Creators often name the place only in burned-in subtitles, and OCR
  holds the names, addresses, and prices in scenes without speech.

## Re-Derive After Edits

If videos were re-edited after a prior ingest, recollect all text evidence
before reusing `locations.json`. Rebuild the timeline and location candidates
against the current video while reusing verified geocodes for places that still
appear. Keep the prior locations as `locations.legacy.json` until review is
complete.

## Workflow

### 1. Fetch Metadata

Run `youtube-fetch-info` with the provided URL.

- Fetch the video or playlist metadata and the owning channel.
- For a playlist, ask which videos to process.
- Save the result, including the `channel` object, to
  `.claude/workspace/youtube/{ID}/video_info.json`.

Ask for confirmation before collecting text evidence.

### 2. Collect and Review Text Evidence

Run `youtube-extract-transcript`.

- Attempt YouTube captions, local Whisper transcription, and video OCR for each
  selected video.
- Preserve each raw result and align the sources in
  `evidence_timeline.json`.
- Run the isolated Codex reviewer and keep corrections in
  `transcript_review.json` with `pending` decisions.
- Let the user approve, reject, revise, or skip the proposed corrections.

Location candidates may be extracted from the pending evidence timeline, but do
not create or update a Sunrei until the required transcript and location
decisions are explicit.

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

## Playlist Renewal

Registered playlists, their videos, collected texts, and extraction runs live in
the Sunrei DB behind `/admin/youtube/*`. A renewal run compares each playlist
with YouTube, records new videos as `PENDING`, and runs steps 2 and 3 for
`PENDING` and `FAILED` videos without checkpoints. Instead of step 4, the
candidates wait for admin review.

### Register a Playlist

Register a playlist once with the Sunrei that approved places go to:

```bash
uv run python .claude/scripts/youtube/youtube_playlists.py add PLAYLIST_ID --sunrei SUNREI_ID [--baseline all|none] [--disabled]
```

- `--baseline all` (default) records the current videos as `SKIPPED`, so only
  videos added later are processed.
- `--baseline none` records the current videos as `PENDING`, so the next run
  processes the whole playlist.
- `--disabled` keeps the playlist out of periodic runs.

`sync_enabled` only selects the playlists a run without `--playlist` processes.
It does not start anything by itself.
Change it, or the Sunrei, with `update`, and list the registered playlists with
`list`:

```bash
uv run python .claude/scripts/youtube/youtube_playlists.py update PLAYLIST_ID [--sunrei SUNREI_ID] [--enable | --disable]
uv run python .claude/scripts/youtube/youtube_playlists.py list
```

### Run Once for One Playlist

Run a single playlist on demand, for example from a local Mac without a schedule.
An explicit `--playlist` also runs a playlist whose sync is disabled, so do not
toggle `sync_enabled` for a one-off run:

```bash
# Show the new and pending videos without changing anything.
uv run python .claude/scripts/youtube/renew_playlists.py --playlist PLAYLIST_ID

# Sync the playlist and process its pending videos.
uv run python .claude/scripts/youtube/renew_playlists.py --commit --playlist PLAYLIST_ID [--max-videos N]
```

Run the committed command again later to process videos added since.

### Run Periodically

Without `--playlist`, a run renews every playlist with `sync_enabled`:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py --commit [--max-videos N]
```

The command does not need a Claude Code session.
Schedule it with launchd or cron on a machine YouTube does not block, because
YouTube blocks captions and media downloads from datacenter IPs.
Run only one schedule at a time so the same video is not processed twice.

### Review and Results

Each processed video ends as `REVIEW_PENDING`, or `COMPLETED` when no candidate
was found.
A failed video becomes `FAILED` with its stage and error, and the next run retries
it.
Members-only videos fail every source and would fail again on each run. Set them
to `SKIPPED` with `CollectionApi().update_video(video_id, status="SKIPPED")`
instead of leaving them `FAILED`.
Candidates wait as `PENDING` until an admin approves them, and approval adds the
spot to the playlist's Sunrei. The collector never changes a Sunrei by itself.
The agents receive the metadata plus one relevant timeline window at a time; they
do not receive the video or raw media.

Operational details and credentials are documented in
`.claude/scripts/youtube/AUTOMATION.md`.

## Audit an Existing Sunrei

Older ingests can leave weak data on the public map. Before reusing or
extending a Sunrei, read it through `GET /admin/sunreis/{id}` and check for the
items below. Skip spots from members-only videos: their captions, audio, and
frames cannot be fetched, and they are not worth recovering by other means.

- Contexts that are placeholders, a bare dish name, extraction notes, or
  copied transcript text
- Spots with an empty title or a placeholder `sourceLink`
- Place names that are address fragments, list labels, or a city, street, or
  station standing in for a building
- Several spots of one video on one Place, where the card shows only the first
  context
- Spot addresses that differ from the store-information block in the video
  description

To repair contexts, collect captions again at the 60-90 second pace, run OCR on
every video in the language of its burned-in subtitles, and write each spot
from its own video's captions, OCR, and description chapters together.
Music-only scenes, places named only in on-screen subtitles, and wrong caption
uploads all hide places from the speech track. Re-point a wrong place by
geocoding the venue name from the description, and follow the spot rules in
`youtube-create-sunrei` step 5.
Preview large changes on a local server before writing to production.
