---
name: youtube-create-sunrei
description: This skill should be used when the user asks to "create a sunrei", "save to sunrei", or wants to finalize the YouTube-to-Sunrei workflow after location extraction.
---

# Create Sunrei from Extracted YouTube Data

Create a Sunrei entity with SunreiSpots via the server admin API using collected video data.

## Prerequisites

- `.claude/workspace/youtube/{ID}/video_info.json` must exist
- `.claude/workspace/youtube/{ID}/locations.json` must exist
- The sunrei-server must be running
- Admin authentication token must exist at `~/.config/sunrei/admin_token`. If missing or expired, tell the user to run: `uv run --with requests python .claude/scripts/auth/login.py`

## Steps

### 1. Load All Data

Read all JSON files from `.claude/workspace/youtube/{ID}/`:

- `video_info.json` — video/playlist metadata
- `transcripts.json` — cleaned transcripts (optional, for descriptions)
- `locations.json` — extracted and geocoded locations

### 2. Get Server Configuration

Ask the user for:

- Server URL: Default `http://localhost:3030`, production `https://sunrei-api.yongseongkimm.com`

The user can provide this or set it as an environment variable (`SUNREI_SERVER_URL`).

Verify the server is running before proceeding:

```bash
curl -s http://localhost:3030/health
```

If the health check fails, ask the user to start the server first.

Read the admin token for authenticated requests:

```bash
TOKEN=$(cat ~/.config/sunrei/admin_token)
```

If the token file doesn't exist, tell the user to run the login script first:
`uv run --with requests python .claude/scripts/auth/login.py`

### 3. Compose Sunrei Details

Set the following automatically from `video_info.json` — do NOT use AskUserQuestion for these:

- Title: Use `channelName` from `video_info.json` directly
- Description: Summarize what the channel covers based on the video descriptions in `video_info.json` (the `description` field of each video in `selectedVideos`)
- Link: Construct the channel URL as `https://www.youtube.com/channel/{channelId}` using `channelId` from `video_info.json`

Then, fetch available tags:

```bash
curl -s -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/tags" | jq '.data'
```

The response includes `data` (array of tags), `totalSize`, `totalElements`, `nextToken`, and `sunreiCountByTagId`.

- If tags exist (`data` is non-empty), use AskUserQuestion to let the user select tags from the list
- If no tags exist (`data` is empty), skip tag selection and use an empty `tagIds` array

### 4. Build SunreiSpots

For each location in `locations.json`, create a spot. The spot title is the video title (from `video_info.json`), not the location name. If the video title exceeds 128 characters, truncate it. The location name lives only in the Place object.

```json
{
  "title": "시부야의 맛있는 야키토리 맛집 투어",
  "description": "시부야 맛집 투어를 소개하는 영상에서 방문한 야키토리 전문점. 비장탄으로 굽는 것이 특징이며, 특히 쓰쿠네와 레바가 인기 메뉴로 영상에서 극찬을 받았다.",
  "images": [],
  "youtubeLink": "https://youtube.com/watch?v=VIDEO_ID&t=123",
  "place": {
    "name": "토리키조쿠 시부야점",
    "address": "도쿄도 시부야구...",
    "latitude": 35.123,
    "longitude": 139.456,
    "googleMapsId": "ChIJ..."
  }
}
```

- `title` = video title, truncated to 128 chars if needed (each video is a "scene/episode" within the channel)
- `description` = location-specific context from the video
- `images` = empty array `[]`
- `place.name` = the actual location name

If multiple locations are extracted from one video, each gets its own SunreiSpot with the same video title.

Present the full list of spots to the user as a table for review. Wait for user confirmation before proceeding.

### 5. Create Sunrei via API

Only send the POST request after the user confirms the spots from step 4.

```bash
curl -s -X POST "{SERVER_URL}/admin/sunreis" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "title": "채널명",
    "description": "채널/영상 기반 설명",
    "link": "https://youtube.com/...",
    "images": [],
    "tagIds": ["..."],
    "spots": [
      {
        "title": "영상 제목 (128자 이내)",
        "description": "영상에서 소개된 장소 관련 내용",
        "images": [],
        "youtubeLink": "https://youtube.com/watch?v=...&t=123",
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

### 6. Handle Response

On success (201):

- Display the created Sunrei ID
- Display summary: title, number of spots created
- Provide link to view in admin panel

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
