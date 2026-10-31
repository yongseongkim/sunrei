---
name: instagram-download-reels
description: Download Instagram reels as MP4 files with request pacing, resumable status, and an API fallback. Use when the user asks to download Instagram videos or reels, or needs reel audio and frames for Whisper or OCR.
---

# Download Instagram Reels

Download public Instagram reels with yt-dlp, one at a time and without logging
in. The script records every reel's outcome, so the same command resumes after
an interruption.

## Rate Limits

Treat the safe threshold for logged-out access as unknown. Throttling may
appear without HTTP 429: yt-dlp reports `Instagram sent an empty media response`
or `rate-limit reached or login required`.

The script limits request pressure and handles throttling by:

- downloading one reel at a time with a random 5-10 second pause
- backing off for 2 minutes after a throttled reel, then waiting 5 minutes
  before one retry pass after the main pass
- stopping after three throttled reels in a row, which leaves the rest for a
  rerun an hour or so later

At this pace, 75 choiza11 reels took 13 minutes in October 2026. Two returned an
empty media response and downloaded fine when retried after the run.

Do not shorten the pause or run downloads in parallel. Repeated throttling can
put the IP behind a login wall, which also blocks location-tag reads from post
pages.

## Run

```bash
uv run --with yt-dlp python .claude/scripts/instagram/download_reels.py \
  .claude/workspace/instagram/{USERNAME}/videos {URLS_FILE}
```

Inputs can be reel or post URLs, shortcodes, or text files with one per line.
Lines starting with `#` are ignored. Each reel is saved as `{shortcode}.mp4`.
The format selection prefers 720p or lower but has an unrestricted fallback.
A carousel post with videos is saved as `{shortcode}_1.mp4`,
`{shortcode}_2.mp4`, and so on.

Download the selected video posts needed for evidence, skipping known ads
when the collection scope excludes them. Do not expand a request for specific
posts into a whole-account download.

`status.json` in the output directory decides what a rerun does:

| Status | Meaning | On rerun |
|---|---|---|
| `downloaded` | MP4 saved | Skipped |
| `throttled` | Empty media response or rate limit | Retried |
| `failed` | Any other yt-dlp error | Retried |
| `login_required` | Age-restricted reel | Skipped unless `--api-fallback` |
| `unavailable` | Deleted or not found | Skipped |

Exit code 3 means throttled or unattempted reels remain. Report the counts to the
user and rerun later instead of retrying immediately.

Inspect the status counts even on exit 0: `failed` or `login_required` entries
may still remain.

## Age-Restricted Reels

Instagram hides some reels from logged-out visitors, often because they show
alcohol. yt-dlp reports `This content isn't available to everyone`. Do not pass
browser cookies or a logged-in session; this workflow deliberately uses
logged-out downloads and the official API fallback.

Download them through the official Graph API instead. Check the token first
(step 1 of `instagram-to-sunrei`), then run:

```bash
uv run --with yt-dlp python .claude/scripts/instagram/download_reels.py \
  .claude/workspace/instagram/{USERNAME}/videos {URLS_FILE} --api-fallback {USERNAME}
```

The fallback pages the account's posts through Business Discovery until it finds
the age-restricted reels, then downloads each `media_url`. It pauses for 10
minutes when Meta's `x-app-usage` reaches 75%. It cannot help with:

- posts the account does not own, such as collabs authored by another account
- posts Meta flagged for copyright, which come back without a `media_url`

These stay `login_required`; tell the user which reels are missing.

A `media_url` file can also come without an audio track: 2 of the first 4
choiza11 reels did. Check with `ffprobe` before relying on it for Whisper; OCR
still works.

## Files

Keep videos in `.claude/workspace/instagram/{USERNAME}/videos/`, which is
gitignored. Never commit or upload them, and never print the access token.
