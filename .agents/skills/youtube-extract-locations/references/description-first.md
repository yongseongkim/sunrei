# Description-First Extraction

`extract_from_descriptions.py` reads each selected video's description,
parses place identities from it, and geocodes them. Use it when a channel puts
a Google Maps link or a structured store-information block per place in every
description.

## Stages and Cache

```bash
uv run python .claude/scripts/youtube/extract_from_descriptions.py <ID> fetch    # titles and descriptions -> descriptions.json
uv run python .claude/scripts/youtube/extract_from_descriptions.py <ID> parse    # links, chapters, blocks -> staging.json, resolved_links.json
uv run python .claude/scripts/youtube/extract_from_descriptions.py <ID> geocode  # Places lookups -> locations.json
uv run python .claude/scripts/youtube/extract_from_descriptions.py <ID> all
```

Each stage caches its output in the workspace, so a rerun resumes at any
stage. The resulting `locations.json` carries identity and coordinates only:
`concept` is empty and no location has a `description`. Write both from the
evidence timeline, following the shared extraction rules.

## Formats the Parser Handles

Map-link channels, such as @saturdaytokyo / 토요일의 도쿄:

- One link per place: `maps.app.goo.gl`, `goo.gl/maps`, `maps.google.com`, or
  `g.page`.
- The script follows each short link to the creator's pin and checks that the
  Places result lies within about 200 m of it.
- The resolved pin is stronger than a name search. Verify a conflict with the
  filmed branch as described below.

Structured-block channels, such as 비밀이야 bimirya:

- A `* 가게 정보` block with `- <name>` and `- 주소 : <address>` lines. The
  script pairs each address with the nearest preceding name and geocodes by
  name plus area.
- Variants in the same channel: `[name]` headings, `*주소:` lines, a road name
  split as `도산대로 59길 16`, and blocks with no name line.
- `mm:ss <name>` chapters give each place's timestamp.

## Symptoms and Actions

### A block has an address but no name

Symptom: the parsed name is empty, a number such as `3` or `13-3`, or a list
label such as `1) 카덴`.

Action: take the name from the title, the chapters, or the on-screen text at
the chapter time. Never geocode the bare address; that is how older ingests
created places named `3`, `13-3`, and `16`.

### The description address disagrees with the video

Symptom: the block's address is in another city than the title, speech, or
on-screen text. One 목포 video listed 금메달식당 with a 수원 address copied from
another block, while the video showed the 목포 address.

Action: trust the video's region, search by name in that region, and note the
conflict for review.

### Sources disagree about which place it is

Action: a creator's pin outweighs a name-search guess, but it can still point
to an old branch or different premises. Keep the conflict unresolved until
the filmed venue is verified, following
[geocoding and review](geocoding-and-review.md#filmed-premises-moves-and-missing-listings).
