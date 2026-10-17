# YouTube Data API by Hand

`fetch_info.py` covers the normal cases. Use these calls only when it cannot,
for example to inspect a response field it does not keep.

## API Key

Read `google.youtubeApiKey` from the server config when `YOUTUBE_API_KEY` is
not set:

```bash
grep -E '^[[:space:]]*youtubeApiKey' sunrei-server/src/main/resources/application-local.conf \
  | sed -E 's/.*=[[:space:]]*"?([^"]+)"?.*/\1/'
```

Use POSIX `[[:space:]]`; the BSD `grep` and `sed` on macOS do not support `\s`.
The same key serves the Places API in `youtube-extract-locations`.

## Parse the URL

- A video URL contains `watch?v=`, `youtu.be/`, or `/shorts/`.
- A playlist URL contains `list=`.
- When both are present, ask whether to process the video or the playlist.

## Video

```bash
curl -s "https://www.googleapis.com/youtube/v3/videos?id={VIDEO_ID}&part=snippet,contentDetails&key={API_KEY}"
```

## Playlist

```bash
curl -s "https://www.googleapis.com/youtube/v3/playlists?id={PLAYLIST_ID}&part=snippet,contentDetails&key={API_KEY}"
curl -s "https://www.googleapis.com/youtube/v3/playlistItems?playlistId={PLAYLIST_ID}&part=snippet&maxResults=50&key={API_KEY}"
```

Follow `nextPageToken` with `pageToken` until it is absent. Each item's
`snippet.resourceId.videoId`, `snippet.title`, `snippet.position`, and
`snippet.videoOwnerChannelTitle` become one `selectedVideos` entry.

## Channel

```bash
curl -s "https://www.googleapis.com/youtube/v3/channels?id={CHANNEL_ID}&part=snippet&key={API_KEY}"
```

From `items[0].snippet`: `title`; `description`, the Source synopsis;
`customUrl`, the handle such as `@bimirya` (legacy values such as `c/Name` are
kept as they are); and `thumbnails.high.url`, the Source poster image, falling
back to `medium` and then `default`. The canonical channel URL is
`https://www.youtube.com/{customUrl}` when `customUrl` exists, otherwise
`https://www.youtube.com/channel/{channelId}`.

## Save

```bash
mkdir -p .claude/workspace/youtube/{ID}
```

Video, `.claude/workspace/youtube/{VIDEO_ID}/video_info.json`:

```json
{
  "type": "video",
  "id": "VIDEO_ID",
  "title": "...",
  "description": "...",
  "channelName": "...",
  "channelId": "UC...",
  "publishedAt": "...",
  "duration": "PT12M34S",
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

Playlist, `.claude/workspace/youtube/{PLAYLIST_ID}/video_info.json`:

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

Set `channel.handle` to `customUrl`, or null when the channel has no handle,
and `channel.url` to the canonical URL above.
