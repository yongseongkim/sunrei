---
name: youtube-create-sunrei
description: Create or update a Sunrei from prepared YouTube metadata, transcripts, and locations. Use when the user asks to save a Sunrei or finish the YouTube-to-Sunrei workflow after approving locations.
---

# Create a Sunrei from YouTube Data

Turn an approved `locations.json` into a draft Sunrei and its SunreiSpots
through the admin API. The channel is the Source, one playlist or video is one
Sunrei, and each approved location of each video is one SunreiSpot.

## Prerequisites

- `.claude/workspace/youtube/{ID}/video_info.json` and an approved
  `.claude/workspace/youtube/{ID}/locations.json`. Without the user's approval
  of the location list, stop.
- `transcripts.json` or `transcripts.reviewed.json` for the summary; fall back
  to the video descriptions when absent.
- A reachable server: `http://localhost:3030` by default, production with
  `--prod`. The scripts mint the admin token locally from the SOPS secrets;
  when that fails, run `gcloud auth application-default login`.

## 1. Compose the Sunrei Fields

Set these without asking:

- Title: the playlist title unchanged, or the video title truncated to 128
  characters.
- Summary: one line with the region and theme of the whole trip, written from
  the transcripts, such as
  `피렌체·로마·베네치아를 돌며 미슐랭 레스토랑과 현지 맛집을 찾아가는 이탈리아 미식 여행`.
- Description: two to four sentences, from the transcripts first and the video
  descriptions second.
- Link: `video_info.json.url`. It is the Sunrei link and the duplicate key for
  `POST /admin/sunreis`; the channel URL is only the Source `externalUrl`.
- Published: false. Ingested Sunreis stay drafts until an administrator
  publishes them.

## 2. Choose Spot Tags

Tags belong to spots. List them and let the user pick. The same set applies to
every spot unless the user overrides one; when no tags exist, every spot gets
an empty `tagIds`.

```bash
TOKEN=$(python3 .claude/scripts/auth/mint_token.py)
curl -s -H "Authorization: Bearer ${TOKEN}" "{SERVER_URL}/admin/tags" | jq '.data[] | {id, labelEn, labelKo}'
```

## 3. Check Every Spot

`create_sunrei.py` builds one spot per location: the video title (128
characters) as `title`, `locations[].description` as `context`, the
timestamped video URL as `sourceLink`, an empty `images` array, the selected
tags, and `locations[].name`, address, coordinates, and `googleMapsId` as the
Place. Locations without coordinates or a `googleMapsId` are skipped; run
`geocode.py` on the workspace first.

Before the dry run, check the approved locations for the problems that are
hard to fix after saving:

- The context is the approved `description` as written: finished public text
  with no timestamps, source notes, or placeholders such as
  `<name> — <playlist> 영상에서 소개한 <area> 맛집.`, and never a bare dish name.
- `videoUrlWithTimestamp` is a real video URL with `&t=`, not a city or
  playlist placeholder.
- `name` is a real venue name. The admin API cannot rename a Place:
  `findOrCreatePlace` reuses the existing Place for a `googleMapsId` and keeps
  its old name, so `13-3` or `1) 카덴` needs a DB fix later.
- `name` is the name the video introduces, in Korean when Google returns only
  a foreign-language name (`ネクサスワールド石山棟` is saved as
  `넥서스 월드 이시야마 오사무 동`, keeping Google's `googleMapsId` and
  coordinates). When the video shows its own Korean spelling on screen, use
  it.
- One Place per building or venue. Spots of the same video on one Place
  collapse into one card line that shows only the first context.
- `images` stays empty. There is no YouTube image collection yet, and the
  video thumbnail is not a spot image.
- The video URL goes in `sourceLink`; the old `youtubeLink` field no longer
  exists.

Present the spots in a table and wait for the user's approval.

## 4. Dry Run, Then Commit

```bash
uv run python .claude/scripts/youtube/create_sunrei.py <ID> [--prod] \
  --summary "<one-line summary>" [--description "..."] [--tag-ids a,b]
```

The dry run prints the title, link, the Source it will reuse or create, and
the spot list. Read it, then add `--commit` to create the draft. Run it once
per workspace.

- HTTP 201: note the Sunrei ID and spot count.
- HTTP 409: a Sunrei with this link already exists (`existingId`). Do not
  create another; update that Sunrei instead, as described in
  `references/admin-operations.md`.
- Other errors: check required fields and tag IDs, correct the payload, and
  retry.

The script does not select tags, does not review spot quality, and does not
update the channel registry. Those are steps 2, 3, and 5.

## 5. Update the Channel Registry

The server keeps a per-channel registry of Sunreis and spots in S3. After a
successful create, rebuild it from every live Sunrei of that channel.
Production is the default; add `--local` for a local server:

```bash
uv run python .claude/scripts/youtube/registry_update.py <channelId> <sunreiId1,sunreiId2,...> \
  [--channel-name "..."] [--channel-link "..."] --commit
```

Pass every live Sunrei ID for the channel; entries for IDs left out are
dropped. Run it once per channel.

## Editing an Existing Sunrei

`PUT /admin/sunreis/{id}` changes only the top-level fields it receives, but
`spots` is a full replacement: every existing spot whose `id` is missing from
the list is soft-deleted, so a partial spot list silently deletes the rest.
Start from a fresh GET, send every live spot with at least `id` and `title`,
and compare the spot count before and after. For a full replacement from
`locations.json`, use `update_sunrei_spots.py`. The details and the raw API
calls are in `references/admin-operations.md`.

## Finish

Report the Sunrei ID, the admin URL
(`https://sunrei-admin.yongseongkimm.com/sunreis/{id}` in production), the
number of spots created, and whether the registry was updated. Leave the
Sunrei a draft and keep the workspace unless the user asks otherwise.

## References

- `references/admin-operations.md`: minting a token, the production
  User-Agent, Source and Sunrei requests by hand, HTTP 409, the registry
  format and stale-registry recovery, and editing or publishing an existing
  Sunrei.
