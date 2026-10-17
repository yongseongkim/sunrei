---
name: youtube-fetch-info
description: Fetch metadata for a YouTube video, playlist, and channel. Use when the user provides a YouTube URL, asks for video or playlist details, or starts the YouTube-to-Sunrei workflow.
---

# Fetch YouTube Metadata

Collect the metadata for a video or playlist and its owning channel, and save
it as `video_info.json` in the workspace the other skills read.

## Run

```bash
uv run python .claude/scripts/youtube/fetch_info.py "<URL>" [--videos all|1,3,5|first:N] [--video]
```

- A video URL contains `watch?v=`, `youtu.be/`, or `/shorts/`; a playlist URL
  contains `list=`. When a URL has both, the script takes the playlist. Ask
  the user which they meant and pass `--video` for the single video.
- `--videos` selects the playlist entries written to `selectedVideos`, by
  1-based indices or `first:N`. Downstream scripts process only that array.
  Use `all` for a real ingest, and `first:1` or explicit indices only for
  disposable tests.
- The script reads the API key from `YOUTUBE_API_KEY` or from
  `google.youtubeApiKey` in
  `sunrei-server/src/main/resources/application-local.conf`. When neither is
  set, ask the user for the key.

The result is written to `.claude/workspace/youtube/{ID}/video_info.json`,
where `{ID}` is the video or playlist ID. Call the YouTube Data API by hand
only when the script cannot handle the request; the calls are in
`references/manual-youtube-api.md`.

## The Channel Is the Source

The owning channel becomes the Sunrei Source, so `video_info.json` always
carries a `channel` object: `id`, `title`, `handle` (null when the channel
has none), `url`, `description`, and `thumbnailUrl`. The canonical URL is
`https://www.youtube.com/{handle}` when a handle exists, otherwise
`https://www.youtube.com/channel/{channelId}`. The description becomes the
Source synopsis and the thumbnail its poster image.

## Output Shape

Fields the later skills depend on:

| Field | Video | Playlist |
| --- | --- | --- |
| `type` | `video` | `playlist` |
| `id`, `title`, `description`, `url`, `channelName`, `channel{...}` | yes | yes |
| `channelId`, `publishedAt`, `duration`, `thumbnailUrl` | yes | no |
| `selectedVideos[]` with `videoId`, `title`, `channelName`, `position`, `url` | no | yes |

`url` becomes the Sunrei link and is the duplicate key for
`POST /admin/sunreis`. Full JSON examples are in
`references/manual-youtube-api.md`.

## Present the Result

Show the title, the channel name and handle, and the description truncated
when long. For a video add the published date and duration; for a playlist
add the video count and an indexed list of the selected titles, and confirm
the selection with the user.

## Registered Playlists

Playlists registered for periodic collection keep their videos and processing
state in the Sunrei DB through the admin API, not in workspace files. Do not
rebuild a curated `video_info.json` for them; see
`youtube-to-sunrei/references/playlist-renewal.md`.

## Finish

Report the path of `video_info.json`, the channel, and the number of selected
videos. Do not start transcript extraction; `youtube-to-sunrei` decides the
next step.
