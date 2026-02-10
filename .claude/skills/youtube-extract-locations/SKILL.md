---
name: youtube-extract-locations
description: This skill should be used when the user asks to "extract locations", "find places mentioned in video", or wants to continue the YouTube-to-Sunrei workflow after transcript extraction.
---

# Extract Locations from YouTube Video

Analyze video metadata and transcript to extract location information, then geocode using Google Maps Places API.

## Prerequisites

- `.claude/workspace/youtube/{ID}/video_info.json` must exist
- `.claude/workspace/youtube/{ID}/transcripts.json` must exist
- If missing, ask the user to run the prior skills first

## Steps

### 1. Load Data

Read both JSON files from `.claude/workspace/youtube/{ID}/`.

### 2. Load Google Maps API Key

```bash
grep google_maps_api_key sunrei-worker/.env | cut -d'=' -f2
```

If not found, ask the user to provide it.

### 3. Analyze Video Concept

For each video, determine the content concept from title + description:
- What type of content is it? (food tour, travel vlog, attraction guide, etc.)
- What geographic area does it cover? (city, neighborhood, country)
- What kind of locations should be extracted? (restaurants, tourist spots, shops, etc.)

This concept guides which transcript mentions are relevant locations vs just passing references.

### 4. Extract Google Maps Links from Description

Parse the video description for Google Maps links:
- `https://maps.google.com/...`
- `https://goo.gl/maps/...`
- `https://maps.app.goo.gl/...`

These are high-confidence locations explicitly shared by the creator.

### 5. Extract Location Mentions from Transcript

Analyze the cleaned transcript to find location references:
- Place names (restaurants, cafes, shops, tourist spots)
- Addresses or neighborhoods mentioned
- Descriptions that identify a location (e.g., "this yakitori place near Shibuya station")
- Note the timestamp where each location is mentioned

Filter by the video concept identified in Step 3. For example:
- A food tour video → extract only food-related venues
- A general travel vlog → extract tourist spots, restaurants, viewpoints
- Ignore passing mentions that aren't actual recommendations

### 6. Geocode Locations via Google Maps Places API

For each extracted location that doesn't already have coordinates (from Google Maps links), use the Places API:

```bash
curl -s -X POST "https://places.googleapis.com/v1/places:searchText" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: {GOOGLE_MAPS_API_KEY}" \
  -H "X-Goog-FieldMask: places.displayName,places.formattedAddress,places.location,places.id,places.googleMapsUri" \
  -d '{
    "textQuery": "{LOCATION_NAME} {AREA_CONTEXT}",
    "languageCode": "ko"
  }'
```

Use area context from the video concept to improve search accuracy (e.g., "시부야 야키토리 가게" instead of just "야키토리 가게").

### 7. Present Results to User

Display all extracted locations in a table:

| # | Name | Address | Lat/Lng | Source | Timestamp | Google Maps |
|---|------|---------|---------|--------|-----------|-------------|

Source: "description_link", "transcript_mention", or "both"

Use AskUserQuestion:
- "Approve all locations"
- "Edit locations" (user can add/remove/modify)
- "Re-extract" (with different concept guidance)

### 8. Save Results

Save to `.claude/workspace/youtube/{ID}/locations.json`:

```json
{
  "videos": [
    {
      "videoId": "...",
      "title": "...",
      "concept": "Food tour in Shibuya, Tokyo",
      "locations": [
        {
          "name": "야키토리 가게 이름",
          "address": "東京都渋谷区...",
          "latitude": 35.6595,
          "longitude": 139.7004,
          "googleMapsId": "ChIJ...",
          "googleMapsUri": "https://maps.google.com/...",
          "source": "transcript_mention",
          "timestamp": 125.5,
          "videoUrlWithTimestamp": "https://www.youtube.com/watch?v=VIDEO_ID&t=125",
          "description": "영상에서 소개된 시부야의 야키토리 맛집"
        }
      ]
    }
  ]
}
```

### 9. Confirm

Tell the user locations have been saved and ask if they want to proceed to Sunrei creation.
