# Geocoding Guards and Review Problems

Each check in `youtube-extract-locations` exists because it has already put a
wrong pin or a broken card on the public map. `geocode.py` applies the query
guards automatically; apply them yourself when calling the Places API by hand.

## Query Guards

Never geocode an address alone. Google returns the nearest business at that
address, often a hotel or office, with plausible coordinates but the wrong
`googleMapsId`. Search for the business name and its area together, such as
"시부야 야키토리 가게" rather than "야키토리 가게". `geocode.py` refuses a name
that looks like opening hours, a phone number, or an address.

Never geocode a short romanized name alone. `Nakano` matched Tokyo's Nakano
ward instead of the Shibuya izakaya 奈加野 that the description's map link
pointed to. When the description has a map link, use its pin.

Compare `displayName` with the extracted name, allowing for translation and
romanization. `geocode.py` writes a `geocodeWarning` on a mismatch. Refine an
obvious mismatch, but do not invent a phonetic correction for a venue named
only in speech. If the returned business is plausibly the spoken venue, keep
it and flag only genuine uncertainty.

A shared substring is not a match. 최자로드's "옛집", a closed 신촌 돈까스
restaurant, came back as "옛집국수" in 용산 with no warning, and a bulk
approval put it on the map. `geocode.venue_warning` also flags a result that
adds words other than a branch (`…점`), an area word, or a romanization, and a
Korean address outside the area's 시/구/군. Google often omits closed
businesses, so the top result for a closed shop's name is usually another shop.

Never search for an unnamed venue. A candidate the extractor marked "상호
미상" or "(상호 미확인)" matched a neighbouring shop and even a street when
searched with its dish and area. `geocode.py` and the renewal skip it and leave
the warning `venue name unknown; not searched`. Find the venue by web research
and pass its place when approving.

## Web Research for Review

Before approving, research every candidate that has no place or carries a
warning. Evidence that names only a kind of place and an area, such as
"a 막국수 집 in 을지로", is not enough.
- Search in the language of the video's region, on the sites people there use
  for reviews and maps, such as Naver blogs and Kakao Map in Korea or Tabelog
  in Japan. Claude's WebSearch rarely finds these; fetch the search page with
  curl and a browser User-Agent, for example
  `https://search.naver.com/search.naver?where=blog&query=…`.
- Search the channel or show name together with the area and what the video
  shows. Review sites and fans often tag a place with the show that visited it.
- Read the video's description and pinned comments.
- Accept a place only when a source ties it to that video, or the video's own
  frames show its sign or name.
- Check whether the scene is a preview of the next episode before approving it.

Bulk-approve only candidates with a place and no warning. Show the reviewer
the rest with YouTube links at the scene, as plain URLs.

## Region Check

Validate accepted coordinates against the playlist's region. A foreign place
name matched by its Korean transliteration often lands in another country.
Re-geocode outliers with country and city context. For a single-country
playlist, `cleanup_geocodes.py <ID> japan|france|italy` finds pins outside that
country and re-geocodes them with city context taken from the video concept.
When the creator really visited an out-of-region place, keep it and flag it
for review.

## One Place per Building

The public map shows one card per Place, and the card shows one line per
Sunrei. Spots of the same video that share a `googleMapsId` collapse into that
one line, which shows only the first context. When a video introduces several
buildings of one complex, such as the Nexus World buildings in Fukuoka, find
each building's own Google place and keep one spot per building. When the
video really covers one site, write one spot whose context covers all of it.

Google often returns only a foreign-language name for such buildings, such as
`ネクサスワールド石山棟`. Keep its `googleMapsId` and coordinates, and save the
name the video uses, such as `넥서스 월드 이시야마 오사무 동`.

## Places API by Hand

The Places API (New) must be enabled for the key. When the key is not in the
environment, read it from the server config:

```bash
grep -E '^[[:space:]]*youtubeApiKey' sunrei-server/src/main/resources/application-local.conf \
  | sed -E 's/.*=[[:space:]]*"?([^"]+)"?.*/\1/'
```

Use POSIX `[[:space:]]`; the BSD `grep` and `sed` on macOS do not support `\s`.

```bash
curl -s -X POST "https://places.googleapis.com/v1/places:searchText" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: {GOOGLE_MAPS_API_KEY}" \
  -H "X-Goog-FieldMask: places.displayName,places.formattedAddress,places.location,places.id,places.googleMapsUri" \
  -d '{"textQuery": "{LOCATION_NAME} {AREA_CONTEXT}", "languageCode": "ko"}'
```

Keep the field mask to these fields. Every request is billed, and extra
fields move it to a more expensive SKU.
