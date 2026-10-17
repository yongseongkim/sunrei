# Admin API Operations by Hand

`create_sunrei.py`, `registry_update.py`, and `update_sunrei_spots.py` cover
the normal path. Use these calls when a step has to be done by hand or
repaired.

## Server and Token

`SERVER_URL` is `http://localhost:3030` locally and
`https://sunrei-api.yongseongkimm.com` in production. Check it first:

```bash
curl -s "{SERVER_URL}/health"
```

Mint a short-lived admin JWT. The script decrypts `auth-jwt-secret` from
`deploy/secrets/secrets.enc.yaml` with SOPS and signs the token, so no browser
login is needed:

```bash
TOKEN=$(python3 .claude/scripts/auth/mint_token.py)               # 60 minutes
TOKEN=$(python3 .claude/scripts/auth/mint_token.py --minutes 180)
```

Keep the token in the shell variable and never write it to a file. When
decryption fails, run `gcloud auth application-default login`. The scripts
mint their own token the same way; `SUNREI_ADMIN_TOKEN` overrides it.

When calling production from Python, set a descriptive `User-Agent` such as
`sunrei-ingest/1.0`. Cloudflare answers Python's default urllib agent with
HTTP 403. The shared helpers already do this.

## Source

Prefer a YouTube Source whose `externalUrl` equals `channel.url`; otherwise
reuse an exact channel-title match; otherwise create one.

```bash
curl -s -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/sources?q=${channel.title}&size=100" \
  | jq '.data[] | select(.type=="YOUTUBE")'

curl -s -X POST "{SERVER_URL}/admin/sources" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "type": "YOUTUBE",
    "name": "<channel.title>",
    "synopsis": "<channel.description, truncated to ~500 chars>",
    "externalUrl": "<channel.url>",
    "posterImage": { "images": [ { "url": "<channel.thumbnailUrl>" } ] }
  }'
```

For an older workspace without a `channel` object, use `channelName` and
`https://www.youtube.com/channel/{channelId}`, and omit `synopsis` and
`posterImage`.

## Tags

```bash
curl -s -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/tags" | jq '.data'
```

`data` holds `{id, labelEn, labelKo}` entries, with pagination fields and
`spotCountByTagId` beside it.

## Create the Sunrei

```bash
curl -s -X POST "{SERVER_URL}/admin/sunreis" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "sourceId": "SRC...",
    "published": false,
    "title": "비밀이야 in 이탈리아 🍝",
    "summary": "one-line trip summary from transcripts",
    "description": "2-4 sentence summary from transcripts and descriptions",
    "link": "https://www.youtube.com/playlist?list=...",
    "images": [],
    "spots": [
      {
        "title": "video title (max 128 chars)",
        "context": "approved locations[].description, unchanged",
        "images": [],
        "sourceLink": "https://www.youtube.com/watch?v=...&t=123",
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

Tags belong to `spots[].tagIds`; there is no top-level `tagIds`.

HTTP 409 means a Sunrei with the same `link` exists, and the body carries
`existingId`. Update that Sunrei instead of creating another.

## Channel Registry

The server stores one JSON document per channel in S3 behind
`/admin/resources/youtube/{channelId}` and owns the AWS credentials.

```bash
curl -s -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/resources/youtube/{channelId}"

curl -s -X PUT -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  --data-binary @registry.json "{SERVER_URL}/admin/resources/youtube/{channelId}"
```

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

`spots[].videoId` is the `v` parameter of each spot's `sourceLink`, and
`videoTitle` comes from `selectedVideos[].title`.

A production database reset leaves dead IDs in the registry. Check one entry
with `GET /admin/sunreis/{sunreiId}`; on 404, rebuild the registry from the
live Sunreis instead of appending to it:

```bash
uv run python .claude/scripts/youtube/registry_update.py <channelId> <liveId1,liveId2> --commit
```

## Edit an Existing Sunrei

`PUT {SERVER_URL}/admin/sunreis/{id}`:

- Send only the top-level fields that change; all are optional.
- Include `spots` only when changing spots. An item with an `id` updates that
  spot, an item without an `id` creates one, and every existing spot whose
  `id` is missing from the list is soft-deleted. A partial list silently
  deletes the rest, so start from a fresh GET, list every live spot with at
  least `id` and `title`, and compare the spot count before and after.
- `{ "id": "...", "title": "...", "_delete": true }` marks a spot for
  deletion explicitly. It is rarely needed, because omission already deletes.
- Tags update per spot: send `tagIds` or `tagLabels` only when replacing that
  spot's tag set.
- Send one PUT per Sunrei with all changes combined. Concurrent PUTs overwrite
  each other; when that has already left the data inconsistent, recreate the
  Sunrei from `locations.json`.

Full spot replacement from `locations.json`, keeping the Sunrei ID, Source,
and published state:

```bash
uv run python .claude/scripts/youtube/update_sunrei_spots.py <ID> <SUNREI_ID> [--prod] [--summary "..."] [--commit]
```

Preview large changes against a local server before writing to production.

## Publish

```bash
curl -s -X PUT "{SERVER_URL}/admin/sunreis/{id}" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d '{"published": true}'
```

Publish only when the user asks.

## Clean Up

Delete a workspace only when the user asks:

```bash
rm -rf .claude/workspace/youtube/{ID}
```
