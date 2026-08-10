---
name: youtube-fetch-info
description: Fetch metadata for a YouTube video, playlist, and channel. Use when the user provides a YouTube URL, asks for video or playlist details, or starts the YouTube-to-Sunrei workflow.
---

# Fetch YouTube Metadata

Use the YouTube Data API v3 to collect metadata for a video or playlist and its
owning channel.

## Default Method

Use the shared script unless the workflow requires interactive video selection.
It paginates playlists and writes `video_info.json` in the format shown below.

```bash
uv run python .claude/scripts/youtube/fetch_info.py "<URL>" [--videos all|1,3,5|first:N]
```

`--videos` controls which playlist entries are written to `selectedVideos`.
Downstream transcript and create scripts process only that array. Use
`--videos all` for a real ingest; use `first:1` or explicit indices only for
disposable tests.

Follow the remaining steps directly only when the script cannot handle the
request.

## Steps

### 1. Load API Key

Read `google.youtubeApiKey` from
`sunrei-server/src/main/resources/application-local.conf`:

```bash
grep -E '^[[:space:]]*youtubeApiKey' sunrei-server/src/main/resources/application-local.conf \
  | sed -E 's/.*=[[:space:]]*"?([^"]+)"?.*/\1/'
```

Use POSIX `[[:space:]]`; BSD and macOS versions of `grep` and `sed` do not
support `\s`.

The same key is used later by the Places API in `youtube-extract-locations`.
Keep it available for subsequent requests. If the key is missing, ask the user
to provide it.

### 2. Parse URL

Classify the URL and extract its ID:

- A video URL contains `watch?v=` or `youtu.be/`.
- A playlist URL contains `list=`.
- If the URL contains both, ask whether to process the video or the full
  playlist.

### 3. Fetch Metadata

For a single video:

```bash
curl -s "https://www.googleapis.com/youtube/v3/videos?id={VIDEO_ID}&part=snippet,contentDetails&key={API_KEY}"
```

For a playlist:

First fetch playlist metadata:

```bash
curl -s "https://www.googleapis.com/youtube/v3/playlists?id={PLAYLIST_ID}&part=snippet,contentDetails&key={API_KEY}"
```

Then fetch all playlist items (paginate with `pageToken` if `nextPageToken` exists):

```bash
curl -s "https://www.googleapis.com/youtube/v3/playlistItems?playlistId={PLAYLIST_ID}&part=snippet,contentDetails&maxResults=50&key={API_KEY}"
```

### 4. Fetch Channel Metadata

The YouTube channel becomes the Source in Sunrei. Read `snippet.channelId` from
the video or playlist response and call the channels endpoint:

```bash
curl -s "https://www.googleapis.com/youtube/v3/channels?id={CHANNEL_ID}&part=snippet&key={API_KEY}"
```

Read these fields from `items[0].snippet`:

- `title`: channel title
- `description`: channel description, used as the Source synopsis
- `customUrl`: channel handle or custom URL, such as `@bimirya`
- `thumbnails.high.url`: channel avatar, used as the Source poster image; fall
  back to `medium` or `default`

Build the canonical channel URL:

- If `customUrl` exists, use `https://www.youtube.com/{customUrl}`. Handles
  already include `@`; preserve legacy values such as `c/Name`.
- Otherwise, use `https://www.youtube.com/channel/{channelId}`.

### 5. Display the Result

Present the fetched info clearly:

For a video:

- Title
- Channel name
- Published date
- Duration
- Description (truncated if very long)
- Thumbnail URL

For a playlist:

- Playlist title and description
- Total video count
- List all videos with index number, title, channel, and video ID

Also show the channel title, handle or URL, and a one-line description.

### 6. Select Playlist Videos

For a playlist, ask which videos to process:

- All videos
- Specific videos, identified by comma-separated indices
- The first N videos

### 7. Save the Data

Create the workspace directory and save:

```bash
mkdir -p .claude/workspace/youtube/{ID}
```

Save to `.claude/workspace/youtube/{ID}/video_info.json` with this structure:

Single video:

```json
{
  "type": "video",
  "id": "VIDEO_ID",
  "title": "...",
  "description": "...",
  "channelName": "...",
  "channelId": "...",
  "publishedAt": "...",
  "duration": "...",
  "thumbnailUrl": "...",
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "channel": {
    "id": "UC...",
    "title": "...",
    "handle": "@...",
    "url": "https://www.youtube.com/@...",
    "description": "...",
    "thumbnailUrl": "https://yt3.googleusercontent.com/..."
  }
}
```

Playlist:

```json
{
  "type": "playlist",
  "id": "PLAYLIST_ID",
  "title": "...",
  "description": "...",
  "url": "https://www.youtube.com/playlist?list=PLAYLIST_ID",
  "channelName": "...",
  "channel": {
    "id": "UC...",
    "title": "...",
    "handle": "@...",
    "url": "https://www.youtube.com/@...",
    "description": "...",
    "thumbnailUrl": "https://yt3.googleusercontent.com/..."
  },
  "selectedVideos": [
    {
      "videoId": "...",
      "title": "...",
      "channelName": "...",
      "position": 0,
      "url": "https://www.youtube.com/watch?v=VIDEO_ID"
    }
  ]
}
```

Set `channel.handle` to `customUrl`; omit it when the channel has no handle. Set
`channel.url` to the canonical URL resolved in step 4.

After saving the file, report its path and ask whether to continue with transcript
extraction.

## Automated Playlist Checks

Do not overwrite a curated `video_info.json` during a scheduled check. Keep the
playlist IDs and enabled flags in `.claude/config/youtube-renewal.json`, and let
`renew_playlists.py` compare the live playlist with its local state. Dynamic
metadata and run state belong under
`.claude/workspace/youtube/automation/`; they are uploaded as artifacts when
requested and are not committed to Git.
