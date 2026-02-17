---
name: youtube-to-sunrei
description: This skill should be used when the user asks to "convert YouTube to sunrei", "create sunrei from YouTube", "process YouTube video end-to-end", or provides a YouTube URL and wants the full extraction workflow.
---

# YouTube to Sunrei — Full Workflow

Orchestrate the complete YouTube-to-Sunrei pipeline with interactive checkpoints. This chains all 4 individual skills into a single guided flow.

## Usage

The user provides a YouTube video or playlist URL as an argument. Example:

- `/youtube-to-sunrei https://www.youtube.com/watch?v=VIDEO_ID`
- `/youtube-to-sunrei https://www.youtube.com/playlist?list=PLAYLIST_ID`

## Workflow

### Step 1: Fetch Video Info

Execute the `/youtube-fetch-info` skill with the provided URL.

- Fetch video/playlist metadata from YouTube Data API v3
- Display video details to the user
- For playlists: let user select which videos to process
- Save to `.claude/workspace/youtube/{ID}/video_info.json`

Checkpoint: Confirm with user before proceeding to transcript extraction.

### Step 2: Extract Transcripts

Execute the `/youtube-extract-transcript` skill.

- Extract transcript for each selected video
- Clean and audit transcripts (fix Korean auto-caption errors, remove noise)
- Present each transcript for user approval
- User can request re-edits or approve
- Save to `.claude/workspace/youtube/{ID}/transcripts.json`

Checkpoint: All transcripts must be approved before proceeding.

### Step 3: Extract Locations

Execute the `/youtube-extract-locations` skill.

- Analyze video concept from title/description
- Parse Google Maps links from video descriptions
- Extract location mentions from transcripts
- Geocode locations via Google Maps Places API
- Present locations for user review (add/edit/remove)
- Save to `.claude/workspace/youtube/{ID}/locations.json`

Checkpoint: User must approve location list before Sunrei creation.

### Step 4: Create Sunrei

Execute the `/youtube-create-sunrei` skill.

- Requires admin authentication: `SUNREI_ADMIN_TOKEN` must be set in `.claude/.env`. If missing, run: `uv run --with requests python .claude/scripts/auth/login.py`
- Auto-set title, description, and link from video_info.json; select tags if available
- Build SunreiSpots from extracted locations
- Create via server admin API (all requests require `Authorization: Bearer ${TOKEN}` header)
- Report created Sunrei ID and summary

## Error Handling

- If any step fails, inform the user and offer to retry that step
- The user can exit at any checkpoint and resume later using the individual skills
- All intermediate data is saved to `.claude/workspace/youtube/{ID}/` so progress is preserved
- If the user has already completed some steps, skip them and continue from where they left off (check for existing JSON files)

## Resuming

If `.claude/workspace/youtube/{ID}/` already contains data from a previous run:

1. Check which JSON files exist
2. Show the user what's already been done
3. Ask if they want to continue from where they left off or start fresh
