# Geocoding and Map Review

Use in Phase 5 after the [identity gate](identity-resolution.md). This reference
also applies to Instagram; use the post's caption/location/reel evidence in
place of YouTube metadata. Worked failures live in
[examples](../examples/place-resolution.md), not in the query rules.

## Resolve a Creator Pin or Query a Named Target

1. Resolve an associated creator map link before falling back to text search.
   Compare the resolved Google place ID or CID with the result. A shared brand
   name or distance threshold does not show they are the same listing.
2. For Text Search, use the evidenced business/building name plus country,
   city and supported branch/address. Keep native spellings and genuine
   numeric prefixes. Do not search a generic category, a guessed alias, or an
   address alone to discover which business was visited.
3. Preserve Google's raw `displayName`, address, ID and coordinates alongside
   the candidate's source name. Never rename a search result in the review
   record to conceal a mismatch.
4. Compare the result using the table below before recording an accepted pin.
   If a material mismatch remains, return to identity research or hold it;
   do not select the nearest alternative simply to finish geocoding.

A valid source name can trigger `geocode.py`'s numeric-prefix guard. Verify
the original name and use a direct named lookup rather than stripping digits.
The helper's `geocodeWarning` and Korean district checks are useful warnings,
not comprehensive validation. Absence of a warning proves no match.

## Accept or Reject the Result

| Check | Acceptable evidence | Hold or reject when |
| --- | --- | --- |
| Name and identity | Source/confirmed alias matches the actual business or building | Only a similar sound, substring, category or renamed payload matches |
| Branch and premises | Evidence points to this branch, entrance/building/floor or site | Another branch, facility, tenant or successor shares a name/address |
| Region and coordinates | The pin is within the visit's supported region and actual premises | It lands elsewhere without content evidence for that visit |
| Creator link | The listing matches its ID/CID and visit clues | Name search switched the supplied pin to a nearby business |
| Address | Locality, street, number and relevant floor/unit agree after legitimate formatting normalization | A different number, region or branch remains unexplained |
| Time and status | Dated sources connect the filmed venue to this listing | Today's listing silently replaces the filmed address or closed business |

Identity requires the relevant checks together; no arbitrary count of matching
fields guarantees a match. A translated name can be correct after verification.
A matching full address can still identify another tenant. Category/menu
conflicts can disqualify a result but are not sufficient positive identity.

## Filmed Premises, Moves, and Missing Listings

Use [historical review](visual-and-historical-review.md#reconstruct-the-place-at-the-time-of-filming)
for dated sources, move/closure checks, and the user's mapping choice. Read
the relevant owner/branch notices; search absence is not proof of closure.
Preserve closed filmed places as historical records rather than substituting
a current nearby business. A production facility, tasting room and restaurant
under one brand can be different destinations.

Only after the venue and exact premises are independently verified may an
address/building pin be a fallback for a missing business listing. Record it
as a proxy, confirm coordinates at the actual premises, and preserve the
verified venue name/address. A different business at the address is not a
verified business match. Carry forward an existing user-approved proxy choice;
resolve a new materially different destination choice before saving it.

`findOrCreatePlace` reuses the canonical Place for a `googleMapsId` without
renaming it from a spot payload. Inspect that record before reuse. Follow
[admin operations](../../youtube-create-sunrei/references/admin-operations.md#edit-an-existing-sunrei)
when correcting it; repoint a wrongly attached spot instead of globally
renaming another venue. Keep proxy limitations outside the public context.

## Final Batch and Region Check

Repeat the checks over the complete accepted set after all workers, retries,
manual corrections, and cached proposals have been reconciled. Check
per-video/scene geography; a multi-region compilation need not match its
playlist title. Country cleanup helpers are only appropriate for an actually
single-country scope, and their replacement results still need review.

Each accepted pin needs a traceable match decision. Keep unresolved identity,
branch and address conflicts held even for an admin review import. Track an
unknown scene time separately: a verified venue may still use a whole-video
link. Do not label extraction confidence, a candidate's `APPROVED` transfer,
or a successful API write as a completed venue verification.

## Places API by Hand

Reuse the [shared key loader](../../youtube-fetch-info/references/manual-youtube-api.md#api-key)
without exposing the key. After the identity gate:

```bash
curl -s -X POST "https://places.googleapis.com/v1/places:searchText" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: {GOOGLE_MAPS_API_KEY}" \
  -H "X-Goog-FieldMask: places.displayName,places.formattedAddress,places.location,places.id,places.googleMapsUri" \
  -d '{"textQuery": "{EVIDENCED_NAME} {CITY} {COUNTRY}", "languageCode": "ko"}'
```

Inspect the actual returned name and address before choosing a place. Request
`places.businessStatus` only when needed. For a known ID, Place Details uses
unprefixed field names; moved-place fields and their limits are covered by
[historical review](visual-and-historical-review.md).
