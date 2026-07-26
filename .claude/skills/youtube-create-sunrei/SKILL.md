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
- Admin API access, minted locally in Step 2 — no login flow. Requires `sops` plus GCP credentials with decrypt permission on the homelab KMS key (`gcloud auth application-default login` if decryption fails).
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

레지스트리는 오래됐을 수 있다. 운영 DB를 초기화하고 나면 이미 없는 ID를 가리킨다.
이미 등록된 것으로 넘기기 전에, 레지스트리의 `sunreiId` 하나를 실제 API로 확인한다:

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/sunreis/{sunreiId}"
```

404가 나오면 레지스트리를 무시하고 전부 새로 만든 뒤, 6단계에서 레지스트리를 덮어쓴다.

### 2. Get Server Configuration

Ask the user for:

- Server URL: Default `http://localhost:3030`, production `https://sunrei-api.yongseongkimm.com`

The user can provide this or set it as an environment variable (`SUNREI_SERVER_URL`).

Verify the server is running before proceeding:

```bash
curl -s http://localhost:3030/health
```

If the health check fails, ask the user to start the server first.

Mint a short-lived admin token for the API calls in Steps 4–6:

```bash
TOKEN=$(python3 .claude/scripts/auth/mint_token.py)
```

This signs an admin JWT with the server's `auth-jwt-secret` (decrypted from
`deploy/secrets/secrets.enc.yaml` via SOPS), so no browser login is needed. The token
lasts 60 minutes — keep it in the shell variable and never write it to a file. If the
ingest run outruns the token, mint another one; pass `--minutes N` for a longer window.

If minting fails with a decryption error, the GCP credentials lack KMS decrypt permission —
tell the user to run `gcloud auth application-default login`.

curl 대신 Python으로 운영 API를 호출할 때는 실제 `User-Agent` 헤더를 넣는다(예: `sunrei-ingest/1.0`).
Python 기본 urllib User-Agent에는 Cloudflare가 403을 돌려주지만, 같은 요청도 curl로는 성공한다.

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
  "context": "시부야 뒷골목 야키토리 투어에서 방문한 카운터 10석 규모의 노포. 대표 메뉴는 비장탄에 구운 쓰쿠네와 레바로, 쓰쿠네는 겉을 바삭하게 구운 뒤 노른자에 찍어 먹고(육즙이 팡 터진다고 표현), 레바는 비린내 없이 부드럽다고 강조했다 (12:30).",
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
  is the per-place description (음식점 소개 + 음식/메뉴 묘사와 영상 속 코멘트) and is exactly the
  spot context, the only editorial text the public map card shows. Do NOT leave it empty, do NOT
  re-derive it, and do NOT trim the food detail away.
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

위 소스 해석·spot 구성·409 처리를 한 번에 하는 스크립트가 있다. 워크스페이스 하나를 받아
dry-run으로 만들 내용을 먼저 보여주고, `--commit`에서만 실제로 생성한다(기본 초안, `--publish` 시 공개):

```bash
uv run python .claude/scripts/youtube/create_sunrei.py <ID> [--prod] [--commit] \
  [--summary "트랜스크립트 기반 한 줄 요약"] [--tag-ids a,b]
```

여러 재생목록은 이 명령을 워크스페이스마다 반복한다. 다만 태그 선택·spot 검토 같은 대화형 확인을
건너뛰므로, 요약은 `--summary`로 직접 넘기고(트랜스크립트 기반) 생성 뒤 admin에서 검토한다.
성공 시 `_create_manifest.json`을 남기니 6단계 S3 레지스트리 갱신에 쓴다.

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

### 6.5. 기존 Sunrei 수정하기

수정은 `PUT {SERVER_URL}/admin/sunreis/{id}`로 한다:

- 최상위 필드(`title`, `summary`, `description`, `link`, `images`, `published`, `sourceId`)는
  선택이라, 담아 보낸 필드만 바뀐다.
- `spots`는 통째로 교체가 아니라 병합이다. `id`가 있는 항목은 해당 spot을 수정하고
  (`title`은 모든 항목에 필수, 나머지는 선택), `id`가 없는 항목은 새 spot을 만들며,
  `{"id": "SS...", "delete": true}`는 삭제 표시(soft-delete)한다. 배열에 없는 spot은 그대로 둔다.
- Sunrei 하나당 PUT은 한 번에 하나씩 보낸다. PUT을 겹쳐 보내면(예: 여러 spot 이름을 병렬로 수정)
  요청이 서로 엉켜 Sunrei 상태가 어긋난다. 바꿀 내용은 방금 받은 `GET /admin/sunreis/{id}` 위에
  모아 한 요청으로 보낸다.
- 이미 상태가 꼬였다면, Sunrei를 지우고 `locations.json`에서 다시 만드는 편이 하나씩 고치는 것보다 빠르고 안전하다.

### 7. Cleanup (Optional)

Ask the user if they want to keep or clean up the workspace files:

```bash
rm -rf .claude/workspace/youtube/{ID}
```
