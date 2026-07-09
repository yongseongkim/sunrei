---
name: youtube-create-sunrei
description: This skill should be used when the user asks to "create a sunrei", "save to sunrei", or wants to finalize the YouTube-to-Sunrei workflow after location extraction.
---

# Create Sunrei from Extracted YouTube Data

Create a Sunrei entity with SunreiSpots via the server admin API using collected video data.

## Prerequisites

- `.claude/workspace/youtube/{ID}/video_info.json` must exist
- `.claude/workspace/youtube/{ID}/locations.json` must exist
- The sunrei-server must be running (for API calls in Steps 2–5)
- `SUNREI_ADMIN_TOKEN` must be set in `.claude/.env`. If missing or expired, tell the user to run: `uv run --with requests python .claude/scripts/auth/login.py`
- `aws-vault` and `aws` CLI must be installed (for S3 registry access in Steps 1.5 and 6)

## Steps

### 1. Load All Data

Read all JSON files from `.claude/workspace/youtube/{ID}/`:

- `video_info.json` — video/playlist metadata, including the `channel` object
  (`id`, `title`, `handle`, `url`, `description`, `thumbnailUrl`) fetched in
  `youtube-fetch-info` step 3.5; this drives Source creation below
- `transcripts.json` — cleaned transcripts; the primary source for the Sunrei `summary`
  and `description` in step 3 (falls back to video descriptions if absent)
- `locations.json` — extracted and geocoded locations

### 1.5. Ask for AWS Vault Profile & Check Channel Registry

After loading data, ask the user which `aws-vault` profile to use (via AskUserQuestion). Store the chosen profile for use in this step and Step 6.

Then check if this channel already has a registry in S3:

```bash
aws-vault exec {profile} -- aws s3 cp s3://sunrei-resources/youtube/{channelId}.json -
```

The output (if the file exists) is a per-channel registry with a `sunreis` array:

```json
{
  "channelName": "비밀이야 bimirya",
  "link": "https://www.youtube.com/channel/UC...",
  "sunreis": [
    {
      "sunreiId": "SR...",
      "createdAt": "2026-02-17T10:06:43Z",
      "spots": [
        { "spotId": "SS...", "videoId": "abc123", "videoTitle": "..." }
      ]
    }
  ]
}
```

- If the file exists: parse the JSON, display the count of existing sunreis and total spots, then ask the user whether to proceed with creating another Sunrei or abort.
- If the command fails (exit code 1, file not found): no existing registry, continue normally.

### 2. Get Server Configuration

Ask the user for:

- Server URL: Default `http://localhost:3030`, production `https://sunrei-api.yongseongkimm.com`

The user can provide this or set it as an environment variable (`SUNREI_SERVER_URL`).

Verify the server is running before proceeding:

```bash
curl -s http://localhost:3030/health
```

If the health check fails, ask the user to start the server first.

Read the admin token from `.claude/.env`:

```bash
TOKEN=$SUNREI_ADMIN_TOKEN
```

The token is auto-loaded by `_load_dot_env()` from `.claude/.env`. If `SUNREI_ADMIN_TOKEN` is not set, tell the user to run: `uv run --with requests python .claude/scripts/auth/login.py`

### 3. Compose Sunrei Details

Modeling rule: **one playlist/trip = one Sunrei**. The Source is the channel; the Sunrei is
the playlist (or, for a single video, that one video). All locations across every video in
the playlist become spots on this single Sunrei.

Set the following automatically — do NOT use AskUserQuestion for these:

- Title:
  - Playlist (`video_info.json.type == "playlist"`): use the playlist `title` directly
    (e.g. `비밀이야 in 이탈리아 🍝`).
  - Single video (`type == "video"`): use the video `title` (truncate to 128 chars).
- Summary: a **one-line** summary of the trip/playlist as a whole, derived from
  `transcripts.json` (the actual narrated content — `cleanedText`/`fullText` of the videos),
  not just the video descriptions. Capture the through-line of the trip (region + theme),
  e.g. `피렌체·로마·베네치아를 돌며 미슐랭 레스토랑과 현지 맛집을 찾아가는 이탈리아 미식 여행`.
- Description: a longer (2–4 sentence) summary of what the trip covers, synthesized from
  `transcripts.json` first and the per-video `description` fields in `video_info.json`
  second. If `transcripts.json` is absent, fall back to descriptions only.
- Link:
  - Playlist: use `video_info.json.url` (the playlist URL). Fall back to
    `https://www.youtube.com/playlist?list={id}` if `url` is absent (older workspaces).
  - Single video: use the video `url`.
  - Note: this is the Sunrei's link and the 409-conflict key — it is the playlist/video URL,
    NOT the channel URL. The channel URL belongs to the Source (`externalUrl`) below.
- Published: `false` — ingested Sunreis always land as drafts (the admin publishes them later)

#### Resolve / create the Source

A Sunrei must belong to a Source. Resolve or create the YouTube source for this channel,
using the `channel` object from `video_info.json`.

```bash
# Look for an existing YouTube source for this channel
curl -s -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/sources?q=${channel.title}" | jq '.data[] | select(.type=="YOUTUBE")'
```

- Among the YOUTUBE results, reuse the `id` of the one whose `externalUrl` equals
  `channel.url` (most reliable). If none match by URL but one matches the channel title,
  reuse that. Use the matched `id` as `sourceId`.
- Otherwise create one from the channel metadata:

```bash
curl -s -X POST "{SERVER_URL}/admin/sources" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "type": "YOUTUBE",
    "name": "<channel.title>",
    "synopsis": "<channel.description, truncated to ~500 chars>",
    "externalUrl": "<channel.url>",
    "posterImage": { "images": [ { "url": "<channel.thumbnailUrl>" } ] }
  }'
```

Use the returned `id` as `sourceId`. If `video_info.json` has no `channel` object (older
workspace), fall back to `name = channelName` and
`externalUrl = https://www.youtube.com/channel/{channelId}`, omitting `synopsis`/`posterImage`.

#### Tags (spot-level)

Tags live on spots now. Fetch the bilingual tag list:

```bash
curl -s -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/tags" | jq '.data'
```

The response includes `data` (array of `{id, labelEn, labelKo}` tags), `totalSize`, `totalElements`, `nextToken`, and `spotCountByTagId`.

- If tags exist (`data` is non-empty), use AskUserQuestion to let the user select tags; the selected tag IDs are attached to each spot's `tagIds`.
- If no tags exist, skip tag selection (each spot gets an empty `tagIds`).

### 4. Build SunreiSpots

`locations.json` nests `locations[]` under each video (`videos[].title`, `videos[].locations[]`).
For each location, create a spot. The spot title is the **parent video's title**
(`videos[].title` in `locations.json`), not the location name. If the video title exceeds 128
characters, truncate it. The location name lives only in the Place object. Every spot from
every video in the playlist attaches to the single Sunrei composed in step 3.

```json
{
  "title": "시부야의 맛있는 야키토리 맛집 투어",
  "context": "영상에서 방문한 야키토리 전문점. 비장탄으로 굽는 것이 특징이며, 특히 쓰쿠네와 레바가 인기 메뉴로 극찬을 받았다.",
  "description": "",
  "images": [],
  "youtubeLink": "https://youtube.com/watch?v=VIDEO_ID&t=123",
  "tagIds": ["..."],
  "place": {
    "name": "토리키조쿠 시부야점",
    "address": "도쿄도 시부야구...",
    "latitude": 35.123,
    "longitude": 139.456,
    "googleMapsId": "ChIJ..."
  }
}
```

- `title` = video title, truncated to 128 chars if needed (each video is a "scene/episode" within the playlist)
- `context` = **map directly from `locations[].description`** in `locations.json` — that field
  is the 2–3 sentence per-place summary (video concept + what makes this place notable) and
  is exactly the spot context. Do NOT leave it empty and do NOT re-derive it.
- `description` = optional longer description; leave empty (`""`) for ingest
- `images` = empty array `[]`
- `youtubeLink` = `locations[].videoUrlWithTimestamp` (the video URL with the mention's `&t=`)
- `tagIds` = the spot-level tags selected in step 3 (same set on every spot unless the user overrides per spot)
- `place.name` = the actual location name (`locations[].name`)

If multiple locations are extracted from one video, each gets its own SunreiSpot with the same video title.

Present the full list of spots to the user as a table for review. Wait for user confirmation before proceeding.

### 5. Create Sunrei via API

Only send the POST request after the user confirms the spots from step 4.

```bash
curl -s -X POST "{SERVER_URL}/admin/sunreis" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "sourceId": "SRC...",
    "published": false,
    "title": "플레이리스트 제목 (예: 비밀이야 in 이탈리아 🍝)",
    "summary": "트랜스크립트 기반 한 줄 여행 요약",
    "description": "트랜스크립트 + 설명 기반 2~4문장 요약",
    "link": "https://www.youtube.com/playlist?list=...",
    "images": [],
    "spots": [
      {
        "title": "영상 제목 (128자 이내)",
        "context": "영상에서 이 장소를 어떻게 다뤘는지",
        "description": "",
        "images": [],
        "youtubeLink": "https://youtube.com/watch?v=...&t=123",
        "tagIds": ["..."],
        "place": {
          "name": "장소명",
          "address": "주소",
          "latitude": 35.123,
          "longitude": 139.456,
          "googleMapsId": "ChIJ..."
        }
      }
    ]
  }'
```

Note: there is no top-level `tagIds` on the Sunrei — tags are per-spot (`spots[].tagIds` / `spots[].tagLabels`).

### 6. Handle Response

On success (201):

- Display the created Sunrei ID
- Display summary: title, number of spots created
- Provide link to view in admin panel
- Update the channel registry in S3 directly using the `aws-vault` profile chosen in Step 1.5.

  1. Try to download the existing registry:
     ```bash
     aws-vault exec {profile} -- aws s3 cp s3://sunrei-resources/youtube/{channelId}.json /tmp/registry.json
     ```
  2. If the file exists: parse the JSON and append the new sunrei entry to the `sunreis` array
  3. If the file doesn't exist (exit code 1): create a fresh registry JSON with `channelName`, `link` from `video_info.json`, and a single-element `sunreis` array
  4. Upload the updated registry:
     ```bash
     aws-vault exec {profile} -- aws s3 cp /tmp/registry.json s3://sunrei-resources/youtube/{channelId}.json --content-type application/json
     ```

  New sunrei entry format:
  ```json
  {
    "sunreiId": "SR...",
    "createdAt": "2026-02-18T12:00:00Z",
    "spots": [
      { "spotId": "SS...", "videoId": "90FahyHS8dA", "videoTitle": "영상 제목" }
    ]
  }
  ```

  Field sources:
  - `sunreiId`: from the API response (`id` of the created sunrei)
  - `createdAt`: current ISO 8601 timestamp
  - `spots[].spotId`: from the API response (each spot's `id`)
  - `spots[].videoId`: extract from the `youtubeLink` of each spot in the request payload (the `v` query parameter)
  - `spots[].videoTitle`: from the corresponding video in `video_info.json` (`selectedVideos[].title`)

On conflict (409):

- A Sunrei with the same link already exists
- Display the `existingId` from the response
- Ask the user whether to skip creation or update the existing Sunrei

On error:

- Display the error message
- Offer to retry with corrections
- Common errors: missing required fields, invalid tag IDs

### 7. Cleanup (Optional)

Ask the user if they want to keep or clean up the workspace files:

```bash
rm -rf .claude/workspace/youtube/{ID}
```
