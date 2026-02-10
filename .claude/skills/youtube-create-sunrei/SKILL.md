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
- User must have an access token for the admin API

## Steps

### 1. Load All Data

Read all JSON files from `.claude/workspace/youtube/{ID}/`:
- `video_info.json` — video/playlist metadata
- `transcripts.json` — cleaned transcripts (optional, for descriptions)
- `locations.json` — extracted and geocoded locations

### 2. Get Server Configuration

Ask the user for:
- **Server URL**: Default `http://localhost:3030`
- **Access token**: JWT token for admin API authentication

The user can provide these or set them as environment variables (`SUNREI_SERVER_URL`, `SUNREI_ACCESS_TOKEN`).

### 3. Compose Sunrei Details

Use AskUserQuestion to confirm/edit:
- **Title**: Suggest based on video/playlist title
- **Description**: Suggest based on video description and extracted content summary
- **Link**: YouTube video/playlist URL
- **Tags**: Ask user to provide tag IDs (or list available tags first)

To list available tags:
```bash
curl -s "{SERVER_URL}/admin/tags" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" | jq '.items'
```

### 4. Build SunreiSpots

For each location in `locations.json`, create a spot:

```json
{
  "title": "Location name",
  "description": "Description from video context",
  "youtubeLink": "https://youtube.com/watch?v=VIDEO_ID&t=TIMESTAMP",
  "place": {
    "name": "Location name",
    "address": "Full address",
    "latitude": 35.123,
    "longitude": 139.456,
    "googleMapsId": "ChIJ..."
  }
}
```

Present the full list of spots to the user for final review.

### 5. Create Sunrei via API

```bash
curl -s -X POST "{SERVER_URL}/admin/sunreis" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "...",
    "description": "...",
    "link": "https://youtube.com/...",
    "tagIds": ["..."],
    "spots": [
      {
        "title": "장소명",
        "description": "영상에서 소개된 내용",
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

On error:
- Display the error message
- Offer to retry with corrections
- Common errors: invalid token (re-authenticate), missing required fields

### 7. Cleanup (Optional)

Ask the user if they want to keep or clean up the workspace files:
```bash
rm -rf .claude/workspace/youtube/{ID}
```
