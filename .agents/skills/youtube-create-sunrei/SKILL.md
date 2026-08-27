---
name: youtube-create-sunrei
description: Create or update a Sunrei from prepared YouTube metadata, transcripts, and locations. Use when the user asks to save a Sunrei or finish the YouTube-to-Sunrei workflow after approving locations.
---

# Create a Sunrei from YouTube Data

Turn approved YouTube data into a draft Sunrei and its SunreiSpots through the
server admin API.

## Prerequisites

- Require `.claude/workspace/youtube/{ID}/video_info.json` and
  `.claude/workspace/youtube/{ID}/locations.json`.
- Run sunrei-server before making local API requests.
- Use `sops` and GCP credentials that can decrypt the homelab KMS key. If
  decryption fails, run `gcloud auth application-default login`.
- Use the Admin API for the channel registry. The server owns the S3
  credentials; do not decrypt or pass AWS keys for registry updates.

## Steps

### 1. Load the Workspace

Read all JSON files from `.claude/workspace/youtube/{ID}/`:

- `video_info.json`: video or playlist metadata, including the `channel` object
  (`id`, `title`, `handle`, `url`, `description`, `thumbnailUrl`) fetched in
  `youtube-fetch-info` step 4; use it to resolve the Source
- `transcripts.json`: cleaned transcripts and the primary source for the Sunrei
  `summary` and `description`; fall back to video descriptions when absent
- `locations.json`: approved, geocoded locations

### 2. Configure the Server and Authentication

Read the server URL from `SUNREI_SERVER_URL` or ask the user for it. Use
`http://localhost:3030` by default; production is
`https://sunrei-api.yongseongkimm.com`.

Verify the server before continuing:

```bash
curl -s "{SERVER_URL}/health"
```

If the health check fails, ask the user to start the server.

Mint a short-lived admin token:

```bash
TOKEN=$(python3 .claude/scripts/auth/mint_token.py)
```

The script decrypts `auth-jwt-secret` from
`deploy/secrets/secrets.enc.yaml` and signs an admin JWT, so no browser login is
needed. Keep the 60-minute token in the shell variable and never write it to a
file. Mint another token if it expires, or pass `--minutes N` when a longer run
is expected.

If decryption fails, run `gcloud auth application-default login`.

When calling production from Python, set a descriptive `User-Agent`, such as
`sunrei-ingest/1.0`. Cloudflare rejects Python's default urllib user agent with
HTTP 403.

### 3. Check the Channel Registry

Read the channel registry through the Admin API:

```bash
curl -s -H "Authorization: Bearer ${TOKEN}" \
  "{SERVER_URL}/admin/resources/youtube/{channelId}"
```

The registry contains a `sunreis` array:

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

- If the registry exists, show its Sunrei and spot counts, then ask whether to
  create another Sunrei.
- If it does not exist, continue.

A production database reset can leave stale IDs in the registry. Verify one
registered `sunreiId` against the live API:

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/sunreis/{sunreiId}"
```

If the API returns 404, ignore the existing entries and replace the registry in
step 7 after creating the Sunrei.

### 4. Compose the Sunrei

Create one Sunrei for each playlist or trip. Use the channel as the Source and
attach every approved location in the playlist to that Sunrei. For a single
video, create one Sunrei for that video.

Set these fields without asking the user:

- Title:
  - For a playlist, use its `title` unchanged, such as
    `비밀이야 in 이탈리아 🍝`.
  - For a video, use its `title`, truncated to 128 characters.
- Summary: Write one line that captures the region and theme of the entire
  trip. Derive it from `cleanedText` or `fullText`, not only from the video
  descriptions. Example:
  `피렌체·로마·베네치아를 돌며 미슐랭 레스토랑과 현지 맛집을 찾아가는 이탈리아 미식 여행`.
- Description: Write two to four sentences that summarize the trip. Use
  transcripts first, then the video descriptions. If transcripts are missing,
  use the descriptions alone.
- Link:
  - For a playlist, use `video_info.json.url`. For an older workspace without
    `url`, use `https://www.youtube.com/playlist?list={id}`.
  - For a video, use its `url`.
  - This playlist or video URL is the Sunrei link and the HTTP 409 conflict key.
    Use the channel URL only for the Source `externalUrl`.
- Published: Set `published` to `false`. Ingested Sunreis remain drafts until
  an administrator publishes them.

#### Resolve or Create the Source

Resolve or create the YouTube Source from the `channel` object in
`video_info.json`.

```bash
# Look for an existing YouTube source for this channel
curl -s -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/sources?q=${channel.title}" | jq '.data[] | select(.type=="YOUTUBE")'
```

- Prefer a YouTube Source whose `externalUrl` equals `channel.url`. If no URL
  matches, reuse an exact channel-title match.
- If neither matches, create a Source from the channel metadata:

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

Use the returned `id` as `sourceId`. For an older workspace without a `channel`
object, use `channelName` and
`https://www.youtube.com/channel/{channelId}`, and omit `synopsis` and
`posterImage`.

#### Select Spot Tags

Tags belong to spots. Fetch the bilingual tag list:

```bash
curl -s -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/tags" | jq '.data'
```

The response contains `{id, labelEn, labelKo}` entries in `data`, along with
pagination fields and `spotCountByTagId`.

- If tags exist (`data` is non-empty), ask the user to select them. Attach the
  selected IDs to each spot's `tagIds`.
- If no tags exist, skip tag selection (each spot gets an empty `tagIds`).

### 5. Build SunreiSpots

Create one spot for each item in `videos[].locations[]`. Use the parent video's
`videos[].title` as the spot title and truncate it to 128 characters. Keep the
location name in the Place object. Attach every spot to the Sunrei composed in
step 4.

```json
{
  "title": "시부야의 맛있는 야키토리 맛집 투어",
  "context": "시부야 뒷골목 야키토리 투어에서 방문한 카운터 10석 규모의 노포. 대표 메뉴는 비장탄에 구운 쓰쿠네와 레바로, 쓰쿠네는 겉을 바삭하게 구운 뒤 노른자에 찍어 먹고(육즙이 팡 터진다고 표현), 레바는 비린내 없이 부드럽다고 강조했다 (12:30).",
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

- `title`: Parent video title, truncated to 128 characters
- `context`: Copy `locations[].description` exactly. It contains the place and
  menu details and is the only editorial text on the public map card. Do not
  leave it empty, regenerate it, or remove the food details.
- `images`: Empty array
- `youtubeLink`: `locations[].videoUrlWithTimestamp`
- `tagIds`: Tags selected in step 4; apply the same set to every spot unless the
  user overrides a specific spot
- `place.name`: `locations[].name`

If a video contains several locations, create a separate SunreiSpot for each
one and reuse the video title.

Present all spots in a table and wait for approval.

### 6. Create the Sunrei

Send the POST request only after the user approves the spots in step 5.

```bash
curl -s -X POST "{SERVER_URL}/admin/sunreis" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "sourceId": "SRC...",
    "published": false,
    "title": "playlist title (e.g. 비밀이야 in 이탈리아 🍝)",
    "summary": "one-line trip summary from transcripts",
    "description": "2-4 sentence summary from transcripts + descriptions",
    "link": "https://www.youtube.com/playlist?list=...",
    "images": [],
    "spots": [
      {
        "title": "video title (max 128 chars)",
        "context": "how the video covered this place",
        "images": [],
        "youtubeLink": "https://youtube.com/watch?v=...&t=123",
        "tagIds": ["..."],
        "place": {
          "name": "place name",
          "address": "address",
          "latitude": 35.123,
          "longitude": 139.456,
          "googleMapsId": "ChIJ..."
        }
      }
    ]
  }'
```

Do not send top-level `tagIds`; tags belong to `spots[].tagIds`.

The shared script resolves the Source, builds spots, and handles HTTP 409
conflicts. Run it without `--commit` to preview the payload, then add `--commit`
to create the Sunrei. It creates a draft unless `--publish` is supplied.

```bash
uv run python .claude/scripts/youtube/create_sunrei.py <ID> [--prod] [--commit] \
  [--summary "one-line summary from transcripts"] [--tag-ids a,b]
```

Run the command once per workspace. The script skips tag selection and spot
review, so pass a transcript-based summary with `--summary` and review the
result in the admin app. On success, it writes `_create_manifest.json` for the
registry update in step 7.

Creation produces a draft (`published: false`). Publish only when requested:
`PUT {SERVER_URL}/admin/sunreis/{id}` with `{"published": true}`.

If a Sunrei with this playlist/video link already exists (HTTP 409, or one found
in Step 3), update it with Step 8 rather than creating a duplicate.

### 7. Handle the Response and Update the Registry

On HTTP 201:

- Show the Sunrei ID, title, spot count, and admin link.
- Update the S3-backed channel registry through the Admin API.

  1. Read the existing registry:
     ```bash
     curl -s -H "Authorization: Bearer ${TOKEN}" \
       "{SERVER_URL}/admin/resources/youtube/{channelId}"
     ```
  2. If it exists, append the new entry to `sunreis`.
  3. If it does not exist, create a registry with `channelName`, the `link` from
     `video_info.json`, and one `sunreis` entry.
  4. Save the updated registry:
     ```bash
     curl -s -X PUT \
       -H "Authorization: Bearer ${TOKEN}" \
       -H "Content-Type: application/json" \
       --data-binary @/tmp/registry.json \
       "{SERVER_URL}/admin/resources/youtube/{channelId}"
     ```

  Use this entry format:

  ```json
  {
    "sunreiId": "SR...",
    "createdAt": "2026-02-18T12:00:00Z",
    "spots": [
      { "spotId": "SS...", "videoId": "90FahyHS8dA", "videoTitle": "video title" }
    ]
  }
  ```

  Field sources:

  - `sunreiId`: from the API response (`id` of the created Sunrei)
  - `createdAt`: current ISO 8601 timestamp
  - `spots[].spotId`: from the API response (each spot's `id`)
  - `spots[].videoId`: extract from the `youtubeLink` of each spot in the request payload (the `v` query parameter)
  - `spots[].videoTitle`: from the corresponding video in `video_info.json` (`selectedVideos[].title`)

For HTTP 409:

- Explain that a Sunrei with the same link exists.
- Show `existingId` and ask whether to skip or update it.

#### Rebuild a stale registry

If step 3 found stale registry entries, rebuild the registry from live Sunrei
records instead of appending to dead IDs. The helper downloads the registry,
fetches spots for the given Sunrei IDs, rebuilds the `sunreis` array, and
uploads the result:

```bash
uv run python .claude/scripts/youtube/registry_update.py <channelId> <sunreiId1,sunreiId2,...> \
  [--channel-name "..."] [--channel-link "..."] [--commit]
```

Pass every live Sunrei for that channel so stale entries are dropped. Run the
helper once per channel; one channel can contain several playlists or Sunrei.

For any other error:

- Show the error and offer to retry after correcting the payload.
- Check for missing required fields and invalid tag IDs first.

### 8. Edit an Existing Sunrei

Edit via `PUT {SERVER_URL}/admin/sunreis/{id}`:

- Send only top-level fields that should change. All are optional.
- Include `spots` only when changing spots. When `spots` is present, an item
  with an `id` updates that spot, an item without an `id` creates a new spot,
  and any existing spot whose `id` is omitted is soft-deleted.
- To replace all spots, send only the new spot list. Explicit delete entries are
  rarely needed, because every spot item must include `title`, including
  `{ "id": "...", "_delete": true }`.
- Tags update per spot. Send `tagIds` or `tagLabels` only when replacing that
  spot's tag set.
- Send one PUT per Sunrei. Start from a fresh `GET /admin/sunreis/{id}`, combine
  all changes, and submit them together. Concurrent PUT requests can overwrite
  one another.
- If concurrent updates have already left the data inconsistent, recreate the
  Sunrei from `locations.json` instead of repairing spots individually.

For a full spot replacement from `locations.json` (preserves the Sunrei ID,
source, and published status), use the helper:

```bash
uv run python .claude/scripts/youtube/update_sunrei_spots.py <ID> <SUNREI_ID> \
  [--prod] [--commit] [--summary "..."]
```

### 9. Clean Up

Ask whether to keep the workspace. Delete it only with confirmation:

```bash
rm -rf .claude/workspace/youtube/{ID}
```
