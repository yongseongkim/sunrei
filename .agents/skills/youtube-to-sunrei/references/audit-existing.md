# Audit an Existing Sunrei

Older ingests can leave weak data on the public map. Before reusing or
extending a Sunrei, read it with `GET /admin/sunreis/{id}` and check each spot
for the problems below. Skip spots from members-only videos: their captions,
audio, and frames cannot be fetched, and they are not worth recovering another
way.

## Checklist

- The context is a placeholder, a bare dish name, extraction notes, or copied
  transcript text.
- `title` is empty, or `sourceLink` is a placeholder rather than a video URL
  with `&t=`.
- The Place name is an address fragment, a list label, or a city, street, or
  station standing in for a building.
- Several spots of one video sit on one Place, so the card shows only the
  first context.
- The spot address differs from the store-information block in the video
  description.

## Repair

Contexts: collect captions again at the 60-90 second pace, run OCR on every
video in the language of its burned-in subtitles, and write each spot from its
own video's captions, OCR, and description chapters together, following
`.claude/scripts/youtube/prompts/extract_locations.md`. Music-only scenes,
places named only in on-screen subtitles, and wrong caption uploads all hide
places from the speech track.

Places: re-point a wrong place by geocoding the venue name from the
description with its area, never the bare address. Split merged buildings into
one Place each. Check the filmed premises and any relocation against
[geocoding and review](../../youtube-extract-locations/references/geocoding-and-review.md).
A wrong canonical name or address on the correct Place can be changed with
`PATCH /admin/places/{id}`; check its other uses first. Repoint the spot when
it is the wrong venue instead of renaming another venue's shared Place.

For an Instagram-to-YouTube comparison or source migration, read
[cross-platform review](../../instagram-to-sunrei/references/cross-platform-review.md).
Check uploads and relevant playlists as well as saved spots before marking a
video missing, and apply the user's source preference only to verified matches.

Saving: follow [the spot checks](../../youtube-create-sunrei/SKILL.md#3-check-every-spot)
and [the existing-Sunrei update rules](../../youtube-create-sunrei/references/admin-operations.md#edit-an-existing-sunrei)
for payloads, backups, and read-back verification.
