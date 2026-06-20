---
name: youtube-fetch-info
description: This skill should be used when the user asks to "fetch YouTube info", "get YouTube video details", "get YouTube playlist info", or provides a YouTube URL to start processing.
---

# Fetch YouTube Video or Playlist Info

Fetch metadata for a YouTube video or playlist using the YouTube Data API v3.

## Steps

### 1. Load API Key

Read the YouTube API key from `sunrei-worker/.env`:

```bash
grep youtube_api_key sunrei-worker/.env | cut -d'=' -f2
```

Store the key for use in subsequent curl calls. If not found, ask the user to provide it.

### 2. Parse URL

Determine if the URL is a video or playlist:

- Video URL contains `watch?v=` or `youtu.be/` → extract video ID
- Playlist URL contains `list=` → extract playlist ID
- If URL contains both, ask user whether to process the single video or the full playlist

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

### 3.5. Fetch Channel Info

A YouTube Source in Sunrei _is_ the channel, so always fetch the owning channel's
metadata too. Take `snippet.channelId` from the video (or playlist) response above and
call the channels endpoint:

```bash
curl -s "https://www.googleapis.com/youtube/v3/channels?id={CHANNEL_ID}&part=snippet&key={API_KEY}"
```

From `items[0].snippet`, extract:

- `title` → channel title
- `description` → channel description (used as the Source synopsis)
- `customUrl` → the channel handle/custom URL (e.g. `@bimirya`), if present
- `thumbnails.high.url` (fall back to `medium`/`default`) → channel avatar, used as the
  Source poster image

Build the canonical channel URL:

- If `customUrl` exists → `https://www.youtube.com/{customUrl}` (the value already
  includes the leading `@` for handles; legacy values like `c/Name` are used verbatim)
- Otherwise → `https://www.youtube.com/channel/{channelId}`

### 4. Display Results

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

Also show the resolved channel: title, handle/URL, and a one-line description.

### 5. User Selection (Playlists)

For playlists, use AskUserQuestion to ask which videos to process:

- Option: "All videos"
- Option: "Select specific videos" (then ask for comma-separated indices)
- Option: "First N videos" (then ask for N)

### 6. Save Data

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

`channel.handle` is the `customUrl` value (may be absent for channels without a handle);
`channel.url` is the canonical channel URL resolved in step 3.5.

### 7. Confirm

Tell the user the info has been saved and ask if they want to proceed to transcript extraction.
