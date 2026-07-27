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

The Places / Geocoding API uses the same Google API key as the YouTube Data API. Read it
from the server's HOCON config at `sunrei-server/src/main/resources/application-local.conf`
(key `google.youtubeApiKey`):

```bash
grep -E '^[[:space:]]*youtubeApiKey' sunrei-server/src/main/resources/application-local.conf \
  | sed -E 's/.*=[[:space:]]*"?([^"]+)"?.*/\1/'
```

(Use POSIX `[[:space:]]`, not `\s` — `\s` is unsupported by BSD/macOS grep and sed.)

If not found, ask the user to provide it. (The Places API must be enabled for this key in
the Google Cloud console — see `b9e59bb` re: the Geocoding API requirement.)

### 3. Analyze Video Concept

For each video, determine the content concept from title + description:

- What type of content is it? (food tour, travel vlog, attraction guide, etc.)
- What geographic area does it cover? (city, neighborhood, country)
- What kind of locations should be extracted? (restaurants, tourist spots, shops, etc.)

This concept guides which transcript mentions are relevant locations vs just passing references.

- The concept determines the geographic scope. Locations outside this scope are references, not destinations.
- Example: A "Japanese architecture travel" video that mentions 압구정 현대아파트 (Seoul) as a comparison → exclude it. Only include locations within the video's target geography (Japan).

#### Concept Examples

Good (specific):
- "싱가포르 현지 맛집 투어 - 바쿠테, 프론미, 하이난 치킨 라이스" — region + theme + key dishes
- "기후현 야생요리 전문식당" — region + unique content type
- "랭스 럭셔리 레스토랑 Le Parc Les Crayères, 600종 샴페인" — city + venue name + key feature
- "삿포로 라멘/수프카레" — city + food type
- "도쿄 히로오 건축여행 — 오직 히로오에만 존재하는 가게들" — city neighborhood + content type + theme

Bad (too broad):
- "이탈리아 맛집 방문기" → city unknown, food type unknown. Refine to "피렌체 미슐랭 3스타 와인 셀러 레스토랑"
- "일본 료칸 방문기" → region unknown. Refine to "니세코 미쉐린 설경 료칸"
- "일본 맛집 방문기" → worst case. No city, no food type

Rules:
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

Distinguish sources that "find" a place from sources that "describe" it.

Finding sources (which places exist) — priority order:
1. Description chapters with timestamps (curated by the creator — best)
2. Google Maps links in the description (Step 4)
3. Title/description analysis (main buildings/places when there are no chapters)
4. Transcript mentions

Describing sources (what the place/food was like) — the transcript is the top priority. Chapters are usually
just "00:00 shop name", so the actual descriptions — taste, cooking, serving, the YouTuber's comments — live in
the narration. Even though the transcript ranks lowest for "finding", don't skip past it until you have pulled
out the descriptions.

Each place's `description` covers both of the axes below (3-6 sentences; it can be longer if the video covers a
lot of food). This value later becomes the spot's `context`, and it is the only editorial text the public map
card displays:

1. Restaurant — what kind of place it is (atmosphere, characteristics, location context) and the video's
   concept/theme, in one or two sentences.
2. Food — what the signature menu items are, how they are cooked/served, and how the video described that food
   (taste, texture, assessment). When possible, include the timestamp of that scene.

Bad: "야키토리 맛집" (too short, no context)
Bad: "쓰쿠네가 극찬받았다" (only an impression, no food description)
Good: "시부야 뒷골목 야키토리 투어에서 방문한 카운터 10석 규모의 노포 야키토리 전문점. 대표 메뉴는 비장탄에
구운 쓰쿠네와 레바로, 쓰쿠네는 겉을 바삭하게 구운 뒤 날달걀 노른자에 찍어 먹으며 유튜버가 '육즙이 팡
터진다'고 표현했고, 레바는 비린내 없이 부드럽다고 강조했다 (12:30)."

What to check when pulling from the transcript:

- Place name (restaurant/cafe/shop/attraction)
- Any address or neighborhood mentioned
- Descriptions that pin down the place ("that yakitori place near Shibuya station")
- Specific comments about the food/menu (which item, taste/cooking/assessment) and their timestamps

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
- Place-name validation: `name` must be the actual business name. Parsing a structured block in the
  description (name / address / hours listed line by line) easily lets a wrong line end up in `name` —
  hours ("매일 11:00 - 21:00"), phone numbers, address fragments, and the like. Discard such names and find
  the real one from the video title or captions. If the name can't be determined, don't make one up — flag it
  to the user. Don't pass these values to the geocoding step: an address fragment used as a name throws off the
  pin location too (see Step 6).
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

Two failure modes to watch for:

- Don't geocode from an address alone. A `textQuery` that contains only an address makes Google return
  whatever business it judges closest to that address — usually a nearby hotel or office building — so a
  plausible-looking coordinate gets the wrong `googleMapsId`. Always search the business name plus area context.
- Verify the result before accepting it. The returned `displayName` should match the extracted name, allowing
  for language or romanization differences. If it doesn't line up, refine the query and retry or flag it for
  review — don't silently take the first result.

A helper encodes both guards in code. It supports a single lookup and a bulk backfill of `locations.json`:

```bash
# Single lookup (warns on displayName mismatch)
uv run python .claude/scripts/youtube/geocode.py --query "<business name>" --area "<area>"

# Fill in items missing coordinates in locations.json, flagging odd names/mismatches as geocodeWarning
uv run python .claude/scripts/youtube/geocode.py <ID>
```

### 6.5. Large playlists: split extraction across subagents

For playlists with dozens of videos, run the per-video extraction (Steps 3-6) split across subagents. Two rules learned the hard way:

- Don't launch them all at once — run small batches of 3-4. Launching a large batch (e.g. 13) at once hits the
  API rate limit and the whole batch fails with 429. Rerun a failed batch in smaller units.
- Match subagent results by video ID and place name, not by list order or the server's spotId. Matching by
  spotId attached results to the wrong spot when a video had multiple places. After merging, confirm each
  description actually refers to its place (it names or clearly describes it) before applying.

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
          "description": "시부야 뒷골목 야키토리 투어에서 방문한 카운터 10석 규모의 노포. 대표 메뉴는 비장탄에 구운 쓰쿠네와 레바로, 쓰쿠네는 겉을 바삭하게 구운 뒤 노른자에 찍어 먹고(육즙이 팡 터진다고 표현), 레바는 비린내 없이 부드럽다고 강조했다 (12:30)."
        }
      ]
    }
  ]
}
```

### 9. Confirm

Tell the user locations have been saved and ask if they want to proceed to Sunrei creation.
