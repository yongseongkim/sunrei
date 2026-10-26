---
name: youtube-extract-locations
description: Extract and verify places mentioned in YouTube videos. Use when the user asks to find locations in a video or continues the YouTube-to-Sunrei workflow after transcript extraction.
---

# Extract and Verify Locations

Turn a video's description, captions, Whisper transcript, and on-screen text
into geocoded place candidates, then review them with the user.

## Inputs

- `video_info.json` from `youtube-fetch-info` for a workspace, or
  `metadata.json` for a single-video run directory.
- The evidence files from `youtube-extract-transcript`: `captions.json`,
  `audio_transcript.json`, `onscreen_text.json`, and
  `transcripts.reviewed.json` when a review ran.
- The Google API key. The scripts read `YOUTUBE_API_KEY` from the environment
  or `google.youtubeApiKey` from
  `sunrei-server/src/main/resources/application-local.conf`. The Places API
  and the YouTube Data API share it.

When an input is missing, report which step produces it and stop.

## Choose an Extraction Path

Inspect a few descriptions, then pick one path per playlist or video:

| Path | Choose when | Tool |
| --- | --- | --- |
| Description-first | Descriptions carry a Google Maps link per place or a structured store-information block | `extract_from_descriptions.py` |
| Timeline-driven | Places are named only in speech and on-screen text | `extract_locations_headless.py` |
| Web research | The video shows places but no source names them, such as clip compilations of a TV show | `geocode_food_vendors.py`, `geocode.py` |

Every path still uses the full evidence timeline for context, proper-name
correction, and audit. When sources disagree about which place it is, the
description link wins. The formats the first path parses, and their failure
modes, are in `references/description-first.md`.

## Load the Shared Extraction Rules

Read `.claude/scripts/youtube/prompts/extract_locations.md` before selecting
or describing any place. It is the single source of truth for scope, which
places to include or exclude, place identity, evidence, and the public
context, and the headless extractor sends the same file to Codex. When a rule
needs to change, change it there, not here.

Keep hand-written candidates in the shape of
`.claude/scripts/youtube/location_candidates.schema.json` until they are
converted to `locations.json`.

## Extract Candidates

Timeline-driven path, per video:

```bash
uv run python .claude/scripts/youtube/evidence_timeline.py "{RUN_DIR}"
uv run --with openai-codex==0.160.0 python .claude/scripts/youtube/extract_locations_headless.py "{RUN_DIR}"
```

The extractor sends the metadata and one timeline window at a time, records
verbatim evidence per source, and writes `location_candidates.json` with every
location at `decision: pending`. Pass `--restart` to discard a cached result.

Description-first path, per workspace:

```bash
uv run python .claude/scripts/youtube/extract_from_descriptions.py <ID> all   # or: fetch | parse | geocode
```

The script fills identity and coordinates only. Write `concept` and each
location's `description` from the evidence timeline, following the shared
rules.

Web-research path: identify each place through web research, cross-check
fan sites and blogs with local review and map sites in the language of the
video's region, and dedupe clips to distinct places. Geocode a food-vendor list
from a research agent in one pass, and other places one at a time with
`geocode.py --query` as in "Geocode and Verify":

```bash
uv run python .claude/scripts/youtube/geocode_food_vendors.py <ID> <vendors.json>
```

For playlists with dozens of videos, work in batches of three or four videos.
Larger batches hit HTTP 429 on the Places API; retry a failed batch in smaller
groups. Match results by video ID and place name, never by list order.

## Geocode and Verify

Geocode each candidate that has no pin from a Maps link with Places Text
Search, searching for the business name together with its area:

```bash
uv run python .claude/scripts/youtube/geocode.py --query "<business name>" --area "<area>"   # one lookup
uv run python .claude/scripts/youtube/geocode.py <ID>                                        # fill locations.json
```

Verify each result before accepting it:

- The query names a business, not a bare address or a short romanized name.
- The pin lies in the video's region. Re-geocode outliers with country and
  city context; for a single-country playlist run
  `uv run python .claude/scripts/youtube/cleanup_geocodes.py <ID> japan|france|italy`.
- `displayName` matches the extracted name, allowing for translation and
  romanization. Keep a plausible match for a venue named only in speech and
  flag only real uncertainty.
- Buildings the video introduces separately have separate Google places.

The failures each check prevents are in
`references/geocoding-and-review.md`, with the Places API call for lookups by
hand.

## Review

Show every candidate in one table:

| # | Name | Address | Lat/Lng | Source | Timestamp | Google Maps |
| --- | --- | --- | --- | --- | --- | --- |

`Source` is `description_link`, `description_block`, `transcript_mention`, or
`both`. Flag out-of-scope places, duplicates (the same `googleMapsId` twice in
one video keeps the earliest), generic entries, and geocode warnings. The user
approves the list, adds, removes, or edits entries, or asks for another pass
with a revised concept.

When you write or edit a `description`, follow "Write the Public Context" in
the shared rules, including its Korean style: no translated phrasing, verbs
that say what happens at the place, and one fact per sentence.

## Save Approved Locations

Write `.claude/workspace/youtube/{ID}/locations.json`:

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
          "description": "시부야 뒷골목 야키토리 투어에서 들른, 카운터 10석짜리 오래된 야키토리집이다. 대표 메뉴는 비장탄에 구운 쓰쿠네와 레바다. ..."
        }
      ]
    }
  ]
}
```

`description` is the approved candidate description and becomes the spot's
public context unchanged.

If videos were re-edited after an earlier ingest, recollect the evidence and
rebuild the candidates against the current video. Reuse verified geocodes for
places that still appear, and keep the old file as `locations.legacy.json`
until the review is done.

## Finish

Report the path of `location_candidates.json` or the approved
`locations.json`, the number of locations, and any unresolved warnings. Do not
create or update a Sunrei; `youtube-to-sunrei` decides the next step.

## References

- `references/description-first.md`: the description formats the fast path
  parses, and what to do when a block has no name or a wrong address.
- `references/geocoding-and-review.md`: why each geocoding guard exists, how
  spots merge on the public card, and the Places API call by hand.
