# Instagram Location Review

Use after collection, before approving any spot. The collector's preliminary
geocode does not bypass the shared [identity gate](../../youtube-extract-locations/references/identity-resolution.md).

## Read the Candidate State

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$SUNREI_API_URL/admin/instagram/extracted-places?accountId=ACCOUNT_ID&reviewStatus=PENDING&size=100"
```

Follow pagination. Interpret matching state separately from approval:

| State or field | Review action |
| --- | --- |
| `MATCHED` | Verify post-to-venue identity and branch; this is only a search proposal |
| `NAME_MISMATCH` | Research the conflicting name, region or branch and supply a verified place if resolved |
| `NOT_FOUND` / `NOT_SEARCHED` | Do not approve without independently verifying the venue and its pin |
| `nameFound: false` | Research the unnamed destination first; no category/address-only Places lookup |
| `existingSpotIds` | Check the account Sunrei's existing mention and the user's source preference; a repeated post is usually rejected |

## Identify the Visit Before Google Lookup

Use the caption, hashtags, location tag, on-screen name, speech and the
creator's accessible comments to reconstruct the actual destination. Keep
comparisons, source clues and unknown facts separate. Business Discovery does
not supply comments; public pages may expose only some. Record unavailable
comments and continue with usable evidence. Ask for a missing comment only
when it is needed to settle the identity.

Search the observed name/aliases, area, chef, show, menu or distinctive access
rules on sites used in that region. Do not add a guessed name to the search
and then cite results as confirmation. Use
[identity research](../../youtube-extract-locations/references/identity-resolution.md#research-the-missing-fact)
for the missing-name/branch gate and dated evidence.

In Korea, Naver/Kakao often clarify native names and branch/address history.
Naver search pages can expose local place cards and their `roadAddress`;
blog search with `where=blog` can find episode/visit evidence. Inspect those
pages with the available web tools or curl and a browser User-Agent if needed.
Read the source and verify its branch/date; a card or old blog alone does not
establish a move. Confirm at least the visit-specific identity, not just the
same cuisine or district. A recently changed location tag is also a claim.

After identity passes, query Google with the verified business name and area;
a verified exact address can narrow it. Compare the provider's unaltered name
and actual premises. A different written name can be a confirmed alias, but
another business at the address is not the filmed venue. Follow the shared
[map and fallback checks](../../youtube-extract-locations/references/geocoding-and-review.md)
for missing listings and preserve existing user-approved proxy mappings.

Keep filming and current addresses separate. Apply the user's established
mapping choice, or hold an unresolved choice that would change the visitor's
destination. Use [visual/historical review](../../youtube-extract-locations/references/visual-and-historical-review.md)
only for a specific unanswered question, keeping normal extraction text-first.

## Decide and Save

A candidate without a place initially has no `existingSpotIds`. Once a place
is chosen, check the Sunrei again for its `googleMapsId`. The public card
shows one mention per Sunrei and Place; preserve the user's existing source
preference when deciding whether a repeat adds a useful mention.

```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reviewStatus": "APPROVED"}' "$SUNREI_API_URL/admin/instagram/extracted-places/ID"
```

To approve with a verified place, include its `name`, `address`, `latitude`,
`longitude`, and `googleMapsId` under `place`. Carry forward explicit user
decisions and holds; resolve new choices before bulk approval. Approve
sequentially to avoid concurrent Place creation. Reject with `REJECTED` when
appropriate; do not erase the extraction evidence. Leave publication to the
user's explicit request.

For existing-spot edits, use the
[admin update rules](../../youtube-create-sunrei/references/admin-operations.md#edit-an-existing-sunrei)
and compare the fresh state after writing. Approval is not a repair API for
an already-linked spot.
