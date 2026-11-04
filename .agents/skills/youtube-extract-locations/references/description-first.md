# Parse Creator Descriptions

Use during evidence collection. A parser extracts proposed names, addresses,
links and chapters; it does not establish venue identity.

## Stages

```bash
uv run python .claude/scripts/youtube/extract_from_descriptions.py <ID> fetch
uv run python .claude/scripts/youtube/extract_from_descriptions.py <ID> parse
```

`fetch` caches per-video descriptions. `parse` writes `staging.json` and
`resolved_links.json`, including direct map-link resolution. Inspect the
parsed entries against the original description before using them.

The script's `geocode` and `all` modes perform Places searches. Do not run
those modes on unresolved entries. Complete the
[identity gate](identity-resolution.md) first; query individually when a batch
contains held candidates. An existing parser result is not approval.

## Supported Formats and Limitations

| Format | What the helper reads | What to check |
| --- | --- | --- |
| Map link per stop | `maps.app.goo.gl`, `goo.gl/maps`, `maps.google.com`, `g.page` | Link-to-venue association and the filmed branch; a nearby search result can still be wrong |
| Store-information block | Name line paired with the nearest address | Hours, list numbers and address fragments can be mistaken for the name |
| Heading variants | Bracketed names, alternate address labels, split road names | Keep the real name and complete address; inspect incomplete blocks |
| Timestamped chapter | Chapter time and label | The label can be a dish/category; match it to the destination and timed evidence |

Recover a missing name from the title, creator comments, speech or on-screen
text. Never geocode an address-only block to discover the business. Preserve
contradictory addresses as claims to research rather than silently replacing
the video's region with the copied address's region.

The output supplies identity clues and coordinates, not finished editorial
context. Write `concept` and descriptions from the evidence for that visit.
For concrete failure cases, read [worked examples](../examples/place-resolution.md).

## Creator-Authored Comments

Use [source evidence](source-evidence.md#creator-authored-comments). Comments
are separate sources; this description parser does not collect them.
