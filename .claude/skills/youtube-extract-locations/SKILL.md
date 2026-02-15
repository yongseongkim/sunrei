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

- The concept determines the geographic scope. Locations outside this scope are references, not destinations.
- Example: A "Japanese architecture travel" video that mentions 압구정 현대아파트 (Seoul) as a comparison → exclude it. Only include locations within the video's target geography (Japan).

#### Concept Examples

**Good (specific):**
- "싱가포르 현지 맛집 투어 - 바쿠테, 프론미, 하이난 치킨 라이스" — region + theme + key dishes
- "기후현 야생요리 전문식당" — region + unique content type
- "랭스 럭셔리 레스토랑 Le Parc Les Crayères, 600종 샴페인" — city + venue name + key feature
- "삿포로 라멘/수프카레" — city + food type
- "도쿄 히로오 건축여행 — 오직 히로오에만 존재하는 가게들" — city neighborhood + content type + theme

**Bad (too broad):**
- "이탈리아 맛집 방문기" → city unknown, food type unknown. Refine to "피렌체 미슐랭 3스타 와인 셀러 레스토랑"
- "일본 료칸 방문기" → region unknown. Refine to "니세코 미쉐린 설경 료칸"
- "일본 맛집 방문기" → worst case. No city, no food type

**Rules:**
1. Be as specific as possible with geography (country → city → neighborhood)
2. Specify content type (food tour, ryokan, architecture trip, cafe tour, wine restaurant, etc.)
3. Reflect key keywords from the video title (specific dish names, chef names, Michelin ratings, price range, etc.)

### 4. Extract Google Maps Links from Description

Parse the video description for Google Maps links:

- `https://maps.google.com/...`
- `https://goo.gl/maps/...`
- `https://maps.app.goo.gl/...`

These are high-confidence locations explicitly shared by the creator.

### 5. Extract Location Mentions

Analyze all available sources to find locations, in priority order:

1. Description chapters with timestamps (highest quality — creator-curated)
2. Google Maps links in description (from Step 4)
3. Title/description analysis (main subject buildings/places when no chapters exist)
4. Transcript mentions (lowest priority — noisy)

Each location's `description` must be 2-3 sentences that include:
1. The video's concept/theme (what kind of content this is — e.g., "도쿄 시부야 지역의 숨은 맛집을 소개하는 영상")
2. What makes this location notable as presented in the video (e.g., specific dishes praised, unique features highlighted, why the creator recommended it)

Bad: "야키토리 맛집" (too short, no context)
Good: "시부야 맛집 투어를 소개하는 영상에서 방문한 야키토리 전문점. 비장탄으로 굽는 것이 특징이며, 특히 쓰쿠네와 레바가 인기 메뉴로 영상에서 극찬을 받았다."

For transcript-based extraction, look for:

- Place names (restaurants, cafes, shops, tourist spots)
- Addresses or neighborhoods mentioned
- Descriptions that identify a location (e.g., "this yakitori place near Shibuya station")
- Note the timestamp where each location is mentioned

Filter by the video concept identified in Step 3. For example:

- A food tour video → extract only food-related venues
- A general travel vlog → extract tourist spots, restaurants, viewpoints
- Ignore passing mentions that aren't actual recommendations

### 5.5. Clean & Filter Locations

Before geocoding, clean and filter the extracted locations:

- Concept-scope filter: Remove locations outside the video's geographic concept (e.g., Korean locations used for comparison in a Japan travel video)
- Deduplication: If the same `googleMapsId` appears multiple times within one video, keep only the first occurrence (earliest timestamp)
- Non-place filter: Remove entries that aren't meaningful destinations:
  - Real estate offices, generic street names ("Walking Street", "Shopping Street")
  - Overly generic names ("라멘집", "Pedestrian Paradise")
  - Concepts rather than places
- Videos without chapters: When a video has no description chapters or Google Maps links, analyze the title and description to identify the main architectural/location subjects. Search for those directly.

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

| #   | Name | Address | Lat/Lng | Source | Timestamp | Google Maps |
| --- | ---- | ------- | ------- | ------ | --------- | ----------- |

Source: "description_link", "transcript_mention", or "both"

- Group results by "videos with locations" and "videos without locations"
- Flag potential issues: non-concept locations, duplicates, generic entries
- Offer automated cleanup before manual review

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
          "description": "시부야 맛집 투어를 소개하는 영상에서 방문한 야키토리 전문점. 비장탄으로 굽는 것이 특징이며, 특히 쓰쿠네와 레바가 인기 메뉴로 영상에서 극찬을 받았다."
        }
      ]
    }
  ]
}
```

### 9. Confirm

Tell the user locations have been saved and ask if they want to proceed to Sunrei creation.
