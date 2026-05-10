---
name: animepilgrimage-extract-locations
description: This skill should be used when the user asks to "extract locations from animepilgrimage", "geocode anime places", or wants to continue the AnimePilgrimage-to-Sunrei workflow after fetching info.
---

# Extract Locations from AnimePilgrimage Data

Step 2 of the AnimePilgrimage-to-Sunrei workflow. Reverse-geocodes each place's lat/lng (already provided by AnimePilgrimage) into a real address + Google Maps Place ID, then assembles a unified `sunrei.json` for the shared `/create-sunrei` skill.

Unlike YouTube, locations don't need to be "discovered" — they're already in the source data with coordinates. This step only enriches them with addresses and place IDs so the Sunrei API can dedupe places across anime.

## Prerequisites

- `.claude/workspace/animepilgrimage/{slug}/anime_info.json` must exist (created by `/animepilgrimage-fetch-info`).
- `GOOGLE_MAPS_API_KEY` in `.claude/.env` (same key used by `youtube-extract-locations`). If missing, ask the user to set it.

## Steps

### 1. Reverse-Geocode Each Place

```bash
uv run --with requests python .claude/scripts/animepilgrimage/reverse_geocode.py \
  --in  .claude/workspace/animepilgrimage/{slug}/anime_info.json \
  --out .claude/workspace/animepilgrimage/{slug}/locations.json
```

Behavior:
- Calls `GET https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&language=ko&key={GOOGLE_MAPS_API_KEY}` for each place.
- Picks `results[0]` → `formatted_address` and `place_id`.
- Caches results at `.claude/workspace/animepilgrimage/_geocode_cache.json` keyed by `"{lat:.6f},{lng:.6f}"`. Repeat places (Tokyo Station, etc.) across slugs reuse the cache and skip API calls.
- On `ZERO_RESULTS`, falls back to a synthesized address from `cityId` (e.g. `JP-gifu-gifu` → `기후현 기후, 일본`) and leaves `googleMapsId` null. The stderr log records how many fallbacks were used.

### 2. Review Cache & Fallback Stats

The helper prints to stderr:

```
wrote .claude/workspace/animepilgrimage/{slug}/locations.json (places=58, cache_hits=12, api_calls=46, cityId_fallbacks=2)
```

If `cityId_fallbacks` is non-zero, surface the affected places to the user — Step 3 will still POST them, but with a coarse address. Offer to skip those places before continuing.

### 3. Assemble `sunrei.json`

```bash
uv run python .claude/scripts/animepilgrimage/assemble_sunrei.py \
  --slug {slug}
```

This combines `anime_info.json` + `locations.json` into the unified shape consumed by `/create-sunrei`. The helper:

- Builds `title`/`description` from `anime.title.kr` / `anime.synopsis.kr` (fallback en → ja)
- Sets `link = null`, `tagIds = []`
- Builds `spots[]` with KR-localized place names, episode-aware spot descriptions
- Adds the `_source` block:
  - `type: "animepilgrimage"`
  - `registryKey: "animepilgrimage.json"`
  - `registryInit: {source: "animepilgrimage"}`
  - `summary: {slug, title}` — merged into the new sunrei entry in the S3 registry
  - `spotMetadata: [{placeId, name, ep}, ...]` — parallel to `spots[]`, merged into each registry spot
  - `tagCandidates: ["애니메이션", "{studio}", "{top prefecture}"]` — 3-5 tag names; `/create-sunrei` will match against existing tags or auto-create

Output written to `.claude/workspace/animepilgrimage/{slug}/sunrei.json`.

### 4. Output Formats

`locations.json` (intermediate, useful for inspection):

```json
{
  "slug": "shoshimin",
  "places": [
    {
      "placeId": "000296f8-...",
      "name": "Ishigure Coffee",
      "ep": 7, "type": "EP",
      "cityId": "JP-gifu-gifu",
      "latitude": 35.41881, "longitude": 136.75917,
      "address": "일본 〒500-8856 기후현 기후시 ...",
      "googleMapsId": "ChIJ...",
      "streetViewUrl": "..."
    }
  ]
}
```

`sunrei.json` (consumed by `/create-sunrei`):

```json
{
  "title": "소시민 시리즈",
  "description": "...",
  "link": null,
  "tagIds": [],
  "spots": [
    {
      "title": "Ishigure Coffee",
      "description": "소시민 시리즈 EP7 등장 장소",
      "youtubeLink": null,
      "place": {"name": "Ishigure Coffee", "address": "...", "latitude": 35.41881, "longitude": 136.75917, "googleMapsId": "ChIJ..."},
      "images": []
    }
  ],
  "images": [],
  "_source": {
    "type": "animepilgrimage",
    "tagCandidates": ["애니메이션", "Madhouse", "기후현"],
    "registryKey": "animepilgrimage.json",
    "registryInit": {"source": "animepilgrimage"},
    "summary": {"slug": "shoshimin", "title": "소시민 시리즈"},
    "spotMetadata": [{"placeId": "000296f8-...", "name": "Ishigure Coffee", "ep": 7}]
  }
}
```

### 5. Confirm

Tell the user how many places were geocoded (with cache-hit / fallback counts) and which tag candidates were derived. Ask whether to proceed to `/create-sunrei` (Step 3).
