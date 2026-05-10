---
name: animepilgrimage-to-sunrei
description: This skill should be used when the user asks to "convert animepilgrimage to sunrei", "create sunrei from animepilgrimage", "import animepilgrimage anime", or provides a slug/URL from animepilgrimage.com/kr.
---

# AnimePilgrimage to Sunrei — Full Workflow

Orchestrate the complete AnimePilgrimage-to-Sunrei pipeline with interactive checkpoints. This chains the 3 individual skills into a single guided flow, following the unified Step 1 → Step 2 → Step 3 model shared with `youtube-to-sunrei`.

## Usage

The user provides one or more anime slugs from `https://www.animepilgrimage.com/kr`, or asks to browse and select. Examples:

- `/animepilgrimage-to-sunrei` — interactive selection
- `/animepilgrimage-to-sunrei shoshimin`
- `/animepilgrimage-to-sunrei https://www.animepilgrimage.com/kr/anime/shoshimin`

## Workflow

### Step 1: Extract Info

Execute the `/animepilgrimage-fetch-info` skill.

- Load the anime list (271 entries; cache-first from `scripts/animepilgrimage-anime-list.json`)
- Optionally filter to Netflix Korea catalog
- Let the user multi-select one or more slugs
- For each selected slug, write `.claude/workspace/animepilgrimage/{slug}/anime_info.json` (anime metadata + places + KR synopsis)

Checkpoint: Confirm the selected slugs before proceeding.

### Step 2: Extract Locations

Execute the `/animepilgrimage-extract-locations` skill.

- Reverse-geocode each place's lat/lng into `address` + `googleMapsId` via Google Maps Geocoding API
- Cache hits across slugs (Tokyo Station etc.) skip API calls
- `cityId`-derived addresses fall back when geocoding returns ZERO_RESULTS
- Save to `.claude/workspace/animepilgrimage/{slug}/locations.json`

Checkpoint: User reviews any `cityId`-fallback addresses (coarse/imprecise) before proceeding.

### Step 3: Create Sunrei

Execute the shared `/create-sunrei` skill with `--workspace .claude/workspace/animepilgrimage/{slug}`.

- Reads `sunrei.json` (assembled by Step 2) — already includes `_source.registryKey="animepilgrimage.json"` and `_source.tagCandidates`
- Resolves tags (matches existing or auto-creates), dry-run preview, user confirmation, then POSTs to `/admin/sunreis`
- On 201: appends to `s3://sunrei-resources/animepilgrimage.json` (asks the user for an `aws-vault` profile)
- Reports created Sunrei ID and spot count per slug

## Error Handling

- If any step fails, inform the user and offer to retry that step
- The user can exit at any checkpoint and resume later using the individual skills
- All intermediate data is saved to `.claude/workspace/animepilgrimage/{slug}/` so progress is preserved
- If the user has already completed some steps, skip them and continue from where they left off (check for existing JSON files)

## Resuming

If `.claude/workspace/animepilgrimage/{slug}/` already contains data from a previous run:

1. Check which JSON files exist (`anime_info.json`, `locations.json`, `payload.json`, `result.json`)
2. Show the user what's already been done
3. Ask if they want to continue from where they left off or start fresh
