---
name: create-sunrei
description: This skill should be used when the user asks to "create a sunrei", "save to sunrei", "post sunrei", or wants to finalize any source-to-sunrei workflow after Step 2 has produced a sunrei.json.
---

# Create Sunrei (Source-Agnostic)

Step 3 of every source-to-sunrei pipeline. Reads a unified `sunrei.json` (CreateSunreiRequest + `_source` block), resolves tags, POSTs to `/admin/sunreis`, and updates the source's S3 registry on success.

This skill replaces the old `youtube-create-sunrei` and `animepilgrimage-create-sunrei` skills. Step 2 of each pipeline is now responsible for assembling `sunrei.json`.

## Prerequisites

- `{workspace}/sunrei.json` exists, written by Step 2.
- The sunrei-server is running.
- `SUNREI_ADMIN_TOKEN` in `.claude/.env`. If missing/expired, run: `uv run --with requests python .claude/scripts/auth/login.py`.
- For S3 registry update: `aws-vault` and `aws` CLI installed; user provides an aws-vault profile.

## Input shape

`{workspace}/sunrei.json`:

```json
{
  "title": "...",
  "description": "...",
  "link": "..." or null,
  "tagIds": [],
  "spots": [
    {
      "title": "...",
      "description": "...",
      "youtubeLink": "..." or null,
      "place": {"name": "...", "address": "...", "latitude": ..., "longitude": ..., "googleMapsId": "..."},
      "images": []
    }
  ],
  "images": [],
  "_source": {
    "type": "youtube" | "animepilgrimage" | ...,
    "tagCandidates": ["...", "...", "..."],
    "registryKey": "youtube/UC123.json",
    "registryInit": {"channelName": "...", "link": "..."},
    "summary": {"channelId": "UC123"},
    "spotMetadata": [
      {"videoId": "...", "videoTitle": "..."},
      ...
    ]
  }
}
```

The `_source` block is consumed by the helper and stripped before POSTing. `_source.tagCandidates` carries 3-5 tag names extracted by Step 2; the helper auto-creates any that don't already exist (no per-tag confirmation — the user can curate later in admin).

## Steps

### 1. Server Configuration

Ask the user for:

- Server URL: Default `http://localhost:3030`, production `https://sunrei-api.yongseongkimm.com`

Verify health:

```bash
curl -s {SERVER_URL}/health
```

Read `SUNREI_ADMIN_TOKEN` from `.claude/.env` (auto-loaded by the helper).

### 2. AWS Vault Profile (if registryKey is set)

If `_source.registryKey` is present in `sunrei.json`, ask the user which `aws-vault` profile to use. Without a profile the helper still POSTs the Sunrei but skips the S3 registry update (warning logged).

### 3. Dry-Run Preview

```bash
uv run --with requests python .claude/scripts/sunrei/create.py \
  --workspace {workspace} \
  --server {SERVER_URL} \
  --dry-run
```

The helper:
- Fetches existing tags via `GET /admin/tags`
- Matches `_source.tagCandidates` (case-insensitive name match) and resolves to existing IDs
- Auto-creates new tags via `POST /admin/tags` for unmatched candidates
- Writes `{workspace}/payload.json` (CreateSunreiRequest with finalized `tagIds`)
- Prints a summary: title, spotCount, tagIds, matchedTags, createdTags, registryKey, sample spots

Display this to the user. If they want details, read `payload.json`.

### 4. User Confirmation

Show the dry-run summary and ask the user to confirm before POSTing. For batch flows (multiple workspaces in one orchestrator run), confirm once up front.

### 5. POST + Registry Update

```bash
uv run --with requests python .claude/scripts/sunrei/create.py \
  --workspace {workspace} \
  --server {SERVER_URL} \
  --aws-profile {profile}
```

The helper:
- Re-resolves tags (reads tags fresh, idempotent for matched IDs)
- (If `--aws-profile` set and `registryKey` present) downloads the existing registry and warns if the source already has Sunreis there
- POSTs `/admin/sunreis`
- On 201:
  - Writes `{workspace}/result.json` with `{sunreiId, spotIds, createdTags, matchedTags, registryUpdated, registryKey}`
  - If `registryKey` present and `--aws-profile` set: appends a new entry to the registry and re-uploads
- On 409: prints `existingId` from response and exits with code 2
- On other error: prints body and exits with code 3

Pass `--no-registry` to suppress the S3 update even when `registryKey` is present (useful in dev).

### 6. Cleanup (Optional)

Ask the user if they want to keep or clean up the workspace files. The helper itself doesn't delete anything.

## Registry shape

`s3://sunrei-resources/{registryKey}` — the helper merges `_source.summary` into the new sunrei entry and `_source.spotMetadata[i]` into each spot. Example outputs:

YouTube (`s3://sunrei-resources/youtube/UC123.json`):

```json
{
  "channelName": "비밀이야 bimirya",
  "link": "https://www.youtube.com/channel/UC123",
  "sunreis": [
    {
      "sunreiId": "SR...",
      "createdAt": "2026-05-10T...",
      "channelId": "UC123",
      "spots": [
        {"spotId": "SS...", "videoId": "abc", "videoTitle": "..."}
      ]
    }
  ]
}
```

AnimePilgrimage (`s3://sunrei-resources/animepilgrimage.json`):

```json
{
  "source": "animepilgrimage",
  "sunreis": [
    {
      "sunreiId": "SR...",
      "createdAt": "2026-05-10T...",
      "slug": "shoshimin",
      "title": "소시민 시리즈",
      "spots": [
        {"spotId": "SS...", "placeId": "...", "name": "Ishigure Coffee", "ep": 7}
      ]
    }
  ]
}
```

## Error handling

- Tag fetch failure: warn but proceed without tags (don't block creation).
- Tag creation 4xx: surface body to user, ask whether to skip the tag and proceed.
- POST 401: token expired — ask the user to re-run the login script.
- POST 409: print `existingId`, ask whether to skip or abort the batch.
- S3 registry failure: the Sunrei is already created. Surface the error; the user can rerun a small fix script later.
