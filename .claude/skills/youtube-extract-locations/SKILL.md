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

장소를 "찾는" 소스와 그 장소를 "설명하는" 소스를 구분한다.

찾는 소스 (어떤 장소가 있는지) — 우선순위:
1. 타임스탬프가 있는 설명란 챕터 (제작자가 직접 정리 — 최상)
2. 설명란의 Google Maps 링크 (Step 4)
3. 제목·설명 분석 (챕터가 없을 때 주요 건물/장소)
4. 트랜스크립트 언급

설명하는 소스 (그 장소·음식이 어땠는지) — 트랜스크립트가 1순위다. 챕터는 대개 "00:00 가게이름"뿐이라,
맛·조리·서빙·유튜버의 코멘트 같은 실제 묘사는 나레이션에 있다. 트랜스크립트가 "찾는" 데에서 최하위라고
해서, 설명을 뽑을 때까지 흘려보내면 안 된다.

각 장소의 `description`은 아래 두 축을 모두 담는다 (3~6문장, 영상이 음식을 많이 다루면 더 길어도 된다).
이 값은 나중에 spot의 `context`가 되며, public 지도 카드가 보여주는 유일한 편집 텍스트다:

1. 음식점 — 어떤 곳인지(분위기·특징·위치 맥락)와 영상의 개념/테마를 한두 문장으로.
2. 음식 — 대표 메뉴가 무엇인지, 어떻게 조리·서빙되는지, 그리고 영상에서 그 음식을 어떻게 묘사했는지
   (맛·식감·평가). 가능하면 해당 장면의 타임스탬프를 함께 남긴다.

Bad: "야키토리 맛집" (너무 짧고 맥락 없음)
Bad: "쓰쿠네가 극찬받았다" (감상만 있고 음식 묘사가 없음)
Good: "시부야 뒷골목 야키토리 투어에서 방문한 카운터 10석 규모의 노포 야키토리 전문점. 대표 메뉴는 비장탄에
구운 쓰쿠네와 레바로, 쓰쿠네는 겉을 바삭하게 구운 뒤 날달걀 노른자에 찍어 먹으며 유튜버가 '육즙이 팡
터진다'고 표현했고, 레바는 비린내 없이 부드럽다고 강조했다 (12:30)."

트랜스크립트에서 뽑을 때 확인할 것:

- 장소 이름 (식당·카페·상점·명소)
- 언급된 주소나 동네
- 장소를 특정하는 묘사 ("시부야역 근처 그 야키토리 집")
- 음식/메뉴에 대한 구체적 코멘트 (무슨 메뉴, 맛·조리·평가)와 그 타임스탬프

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
- 장소 이름 검증: `name`은 실제 상호여야 한다. 설명란의 정형 블록(이름 / 주소 / 영업시간이
  줄줄이 이어진 형태)을 파싱하면 엉뚱한 줄이 `name`에 들어가기 쉽다 — 영업시간("매일 11:00 - 21:00"),
  전화번호, 주소 조각 같은 것들. 이런 이름은 버리고 영상 제목이나 자막에서 실제 이름을 찾는다.
  이름을 알 수 없으면 지어내지 말고 사용자에게 표시한다. 이런 값은 좌표 검색 단계로 넘기지 않는다 —
  주소 조각이 이름으로 들어가면 핀 위치까지 틀어진다(6단계 참고).
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

조심해야 할 실패 두 가지:

- 주소만으로 좌표를 찾지 않는다. 주소만 담은 `textQuery`는 Google이 그 주소에서 가장 가깝다고
  판단한 업체를 돌려준다 — 대개 근처 호텔이나 사무실 건물이다 — 그래서 그럴듯한 좌표에 엉뚱한
  `googleMapsId`가 붙는다. 항상 상호에 지역 맥락을 더해 검색한다.
- 결과를 받아들이기 전에 확인한다. 돌려받은 `displayName`이 추출한 이름과 맞아야 하며,
  언어나 로마자 표기 차이는 감안한다. 어긋나면 검색어를 다듬어 다시 시도하거나 검토 대상으로
  표시하고, 첫 결과를 말없이 그대로 쓰지 않는다.

이 두 가지 가드를 코드로 넣어 둔 헬퍼가 있다. 개별 조회와 `locations.json` 일괄 백필을 모두 지원한다:

```bash
# 한 곳만 조회 (displayName 불일치 시 경고)
uv run python .claude/scripts/youtube/geocode.py --query "<상호>" --area "<지역>"

# locations.json에서 좌표 없는 항목을 채우고, 이상한 이름·불일치는 geocodeWarning으로 표시
uv run python .claude/scripts/youtube/geocode.py <ID>
```

### 6.5. 대용량 재생목록: 하위 에이전트로 나눠 추출하기

영상이 수십 개인 재생목록은 영상별 추출(3~6단계)을 하위 에이전트로 나눠 돌린다. 겪어 보고 얻은 두 가지 원칙:

- 한꺼번에 다 띄우지 말고 3~4개씩 작은 묶음으로 실행한다. 한 번에 크게(예: 13개) 띄우면 API 요청
  제한에 걸려 그 묶음 전체가 429로 실패한다. 실패한 묶음은 더 작은 단위로 다시 돌린다.
- 하위 에이전트 결과는 목록 순서나 서버의 spotId가 아니라 영상 ID와 장소 이름으로 맞춘다.
  spotId로 맞췄더니 한 영상에 장소가 여럿일 때 결과가 엉뚱한 spot에 붙었다. 병합한 뒤에는
  각 설명이 실제로 그 장소를 가리키는지(이름을 언급하거나 분명히 묘사하는지) 확인하고 반영한다.

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
