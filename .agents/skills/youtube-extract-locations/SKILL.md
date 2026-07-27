---
name: youtube-extract-locations
description: Extract and verify places mentioned in YouTube videos. Use when the user asks to find locations in a video or continues the YouTube-to-Sunrei workflow after transcript extraction.
---

# Extract Locations from YouTube Videos

Identify relevant places from video metadata and transcripts, then geocode and
verify them with the Google Maps Places API.

## Prerequisites

- Require `.claude/workspace/youtube/{ID}/video_info.json` and
  `.claude/workspace/youtube/{ID}/transcripts.json`.
- If either file is missing, ask the user to complete the preceding workflow
  step.

## Steps

### 1. Load Data

Read both JSON files from `.claude/workspace/youtube/{ID}/`.

### 2. Load Google Maps API Key

Read `google.youtubeApiKey` from
`sunrei-server/src/main/resources/application-local.conf`. The Places API and
YouTube Data API use the same key.

```bash
grep -E '^[[:space:]]*youtubeApiKey' sunrei-server/src/main/resources/application-local.conf \
  | sed -E 's/.*=[[:space:]]*"?([^"]+)"?.*/\1/'
```

Use POSIX `[[:space:]]`; BSD and macOS versions of `grep` and `sed` do not
support `\s`.

If the key is missing, ask the user to provide it. The Places API must be
enabled for the key in Google Cloud; commit `b9e59bb` documents the related
Geocoding API requirement.

### 3. Analyze Video Concept

Derive a concise concept for each video from its title and description. Include:

- The most specific geographic scope available
- The content type, such as a food tour, travel vlog, or architecture guide
- The types of destinations to extract
- Distinctive details from the title, such as dishes, chefs, ratings, or price
  range

Use the concept to separate destinations from passing references. For example,
exclude 압구정 현대아파트 when a Japanese architecture video mentions it only
as a comparison.

Specific concepts:

- "싱가포르 현지 맛집 투어 - 바쿠테, 프론미, 하이난 치킨 라이스"
  identifies the region, theme, and dishes.
- "기후현 야생요리 전문식당" identifies the region and content type.
- "랭스 럭셔리 레스토랑 Le Parc Les Crayères, 600종 샴페인" identifies
  the city, venue, and distinguishing feature.

Concepts that need refinement:

- "이탈리아 맛집 방문기" omits the city and type of food. Refine it to
  "피렌체 미슐랭 3스타 와인 셀러 레스토랑".
- "일본 료칸 방문기" omits the region. Refine it to
  "니세코 미쉐린 설경 료칸".

### 4. Extract Google Maps Links from Description

Parse the video description for Google Maps links:

- `https://maps.google.com/...`
- `https://goo.gl/maps/...`
- `https://maps.app.goo.gl/...`

Treat these as high-confidence locations because the creator shared them
directly.

### 5. Extract Location Mentions

Use different evidence to identify a place and to describe it.

Identify places in this order:

1. Timestamped chapters in the description
2. Google Maps links
3. Places central to the title or description
4. Transcript mentions

Use the transcript as the primary source for descriptions. Chapters often
contain only a timestamp and place name; the narration contains the atmosphere,
food, preparation, and creator's reaction.

Write a three-to-six-sentence `description` for each place. It may be longer
when the video covers several dishes. This value becomes the spot's `context`
and is the only editorial text shown on the public map card. Include:

1. The type of place, atmosphere, distinguishing features, geographic context,
   and connection to the video's theme
2. Signature items, preparation and serving details, taste or texture, the
   creator's assessment, and timestamps when available

Insufficient: "야키토리 맛집" (no context)

Insufficient: "쓰쿠네가 극찬받았다" (reaction only)

Useful: "시부야 뒷골목 야키토리 투어에서 방문한 카운터 10석 규모의 노포 야키토리 전문점. 대표 메뉴는 비장탄에
구운 쓰쿠네와 레바로, 쓰쿠네는 겉을 바삭하게 구운 뒤 날달걀 노른자에 찍어 먹으며 유튜버가 '육즙이 팡
터진다'고 표현했고, 레바는 비린내 없이 부드럽다고 강조했다 (12:30)."

Extract:

- Place name and category
- Address, neighborhood, or other identifying context
- Menu items, preparation, taste, and assessment
- Relevant timestamps

Filter by the video concept identified in Step 3. For example:

- For a food tour, include only food-related venues.
- For a general travel vlog, include destinations such as attractions,
  restaurants, and viewpoints.
- Ignore places mentioned only in passing.

### 6. Clean and Filter Locations

Before geocoding, clean and filter the extracted locations:

- Remove places outside the video's geographic concept.
- If a `googleMapsId` appears more than once in a video, keep the earliest
  occurrence.
- Remove entries that are not meaningful destinations:
  - Real estate offices, generic street names ("Walking Street", "Shopping Street")
  - Overly generic names ("라멘집", "Pedestrian Paradise")
  - Concepts rather than places
- Require the actual business name. Structured description blocks can place
  hours, phone numbers, or address fragments in the name field. Recover the
  name from the title or captions. If it cannot be identified, flag it instead
  of inventing one or sending the bad value to geocoding.
- When a video has no chapters or map links, identify the main places from its
  title and description and search for them directly.

### 7. Geocode Locations

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

Include geographic context in the query, such as "시부야 야키토리 가게"
instead of "야키토리 가게".

Guard against two common errors:

- Never geocode an address alone. Google may return a nearby hotel or office
  with plausible coordinates but the wrong `googleMapsId`. Search for the
  business name and area together.
- Compare `displayName` with the extracted name, allowing for translation and
  romanization. If they do not match, refine the query or flag the result. Do
  not accept the first result silently.

Use the helper for a single lookup or to fill missing coordinates in
`locations.json`:

```bash
# Single lookup (warns on displayName mismatch)
uv run python .claude/scripts/youtube/geocode.py --query "<business name>" --area "<area>"

# Fill in items missing coordinates in locations.json, flagging odd names/mismatches as geocodeWarning
uv run python .claude/scripts/youtube/geocode.py <ID>
```

### 8. Process Large Playlists

For playlists with dozens of videos, split steps 3–7 into batches of three or
four videos:

- Larger concurrent batches can hit the API rate limit and fail with HTTP 429.
  Retry a failed batch in smaller groups.
- Match results by video ID and place name, never by list order or server
  `spotId`. After merging, confirm that every description names or clearly
  describes its place.

### 9. Review the Results

Display all extracted locations in a table:

| #   | Name | Address | Lat/Lng | Source | Timestamp | Google Maps |
| --- | ---- | ------- | ------- | ------ | --------- | ----------- |

Set `Source` to `description_link`, `transcript_mention`, or `both`.

- Group videos by whether they contain locations.
- Flag out-of-scope places, duplicates, generic entries, and geocoding warnings.
- Offer automated cleanup before manual review.

Ask the user to:

- Approve all locations
- Add, remove, or edit locations
- Extract again with revised concept guidance

### 10. Save the Results

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
          "description": "시부야 뒷골목 야키토리 투어에서 방문한 카운터 10석 규모의 노포. 대표 메뉴는 비장탄에 구운 쓰쿠네와 레바로, 쓰쿠네는 겉을 바삭하게 구운 뒤 노른자에 찍어 먹고(육즙이 팡 터진다고 표현), 레바는 비린내 없이 부드럽다고 강조했다 (12:30)."
        }
      ]
    }
  ]
}
```

After saving the file, report its path and ask whether to continue with Sunrei
creation.
