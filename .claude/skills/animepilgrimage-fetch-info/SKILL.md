---
name: animepilgrimage-fetch-info
description: This skill should be used when the user asks to "fetch animepilgrimage info", "load anime list from animepilgrimage", "get animepilgrimage data", or wants to start the AnimePilgrimage-to-Sunrei workflow.
---

# Fetch AnimePilgrimage Anime Info

Step 1 of the AnimePilgrimage-to-Sunrei workflow. Loads the anime list from `animepilgrimage.com/kr` (cache-first), helps the user pick which anime to process, and writes per-anime data to the workspace.

## Prerequisites

- Cache files (already populated by `scripts/scrape-animepilgrimage.ts`; refreshed automatically by the helper when older than 90 days):
  - `scripts/animepilgrimage-anime-list.json` — anime list
  - `scripts/animepilgrimage-by-anime/{slug}.json` — per-anime places
  - `scripts/animepilgrimage-data.json` — master file with synopsis (used for KR description)

The helper will refetch from `https://api.animepilgrimage.com` if any cache is missing or stale.

## Steps

### 1. Load the Anime List

```bash
uv run --with requests python .claude/scripts/animepilgrimage/fetch_info.py --list
```

Output: JSON array of `{slug, ja, kr, en, places}` (271 entries). The helper reads `scripts/animepilgrimage-anime-list.json` if fresh, otherwise refetches.

### 2. (Optional) Filter to Netflix Korea Catalog

If the user wants to limit selection to anime available on Netflix KR, intersect with `scripts/animepilgrimage-netflix-matched.json` (55 entries). Ask the user up front whether to apply this filter.

### 3. Display the List for Selection

Sort by descending `places` count. Show the user the top entries with:

- Slug (used for selection)
- Korean title (`kr`, fall back to `en`)
- English title (`en`)
- Place count

### 4. User Selection

Use AskUserQuestion:

- For ≤4 candidates the user is interested in, present them as multi-select options.
- For larger selections, ask the user to type a comma-separated list of slugs and validate each against the loaded list. Reject any unknown slug and re-ask.

### 5. Fetch Per-Anime Data

For each selected `{slug}`:

```bash
uv run --with requests python .claude/scripts/animepilgrimage/fetch_info.py \
  --slug {slug} \
  --out .claude/workspace/animepilgrimage/{slug}/anime_info.json
```

The helper:
1. Reads `scripts/animepilgrimage-by-anime/{slug}.json` if fresh
2. Enriches `synopsis` from `scripts/animepilgrimage-data.json` (master) when available
3. Falls back to `GET /anime/{animeId}` from the live API if synopsis is missing
4. Writes the combined output to `--out`

### 6. Output Format

Each `.claude/workspace/animepilgrimage/{slug}/anime_info.json`:

```json
{
  "anime": {
    "animeId": "QG989BWllZZQ1ZeuErVx",
    "animeSlug": "shoshimin",
    "title": { "ja": "小市民シリーズ", "kr": "소시민 시리즈", "en": "Shoshimin Series" },
    "synopsis": { "ja": "...", "kr": "...", "en": "..." },
    "author": { "ja": [...], "en": [...], "kr": [...] },
    "studio": { "ja": [...], "en": [...] }
  },
  "placeCount": 58,
  "places": [
    {
      "placeId": "000296f8-714f-4161-a874-93a27a3058a5",
      "name": { "en": "Ishigure Coffee", "ja": "いしぐれ珈琲" },
      "geo": { "latitude": 35.41881, "longitude": 136.75917 },
      "ep": 7, "type": "EP",
      "cityId": "JP-gifu-gifu",
      "streetViewUrl": "https://www.google.com/maps/place/...",
      "copyright": "©米澤穂信..."
    }
  ]
}
```

### 7. Confirm

Tell the user how many slugs were processed and ask whether to proceed to `/animepilgrimage-extract-locations` (Step 2).
