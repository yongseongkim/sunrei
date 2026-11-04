# Worked Place-Resolution Cases

Use these to understand phase decisions, not as a database of current venue
facts. The real cases describe observed extraction failures; recheck source
and map data before a new import. The export below uses illustrative values.

## Ordinary Places and Mixed Categories

A food-focused trip deliberately visits a small bookshop and an old bridge
alongside its restaurants; a travel clip introduces a guesthouse and a quiet
walking trail. The source names and describes each stop.

**Decision:** include those destinations with their own visit context even
when they are neither food venues nor famous sights. The title explains the
trip's theme; it does not erase meaningful stops in another category. A station
name shown only for directions remains incidental. An unnamed building that
is an actual subject stays a candidate for identity research, not a substitute
famous landmark.

## Similar Romanized Names

**Evidence:** a Tokyo visit names Kenuki Sushi; the creator's direct map link
points to the Kanda premises. A text lookup returns KENAKI Sushi Counter in
the United States.

**Decision:** reject the text result. Resolve the creator link and compare its
CID/coordinates and the original-language venue identity. Do not rename the
US result Kenuki Sushi or accept it because the spelling is close.

## Same Address, Different Tenant

**Evidence:** the creator names Asahi Honten Tsukiji and shows giant pressed
crackers. Google returns a sushi restaurant at the same street address.
A dated owner notice confirms the filmed cracker branch closed.

**Decision:** the address does not establish the business. Locate the actual
cracker listing using the evidenced native name, preserve the filmed venue
and verified closure, and do not substitute the sushi restaurant. An upload
after the closure leaves filming date unknown unless separately evidenced.

## A Name Beginning with Digits

**Evidence:** a creator venue block clearly names 29 Terrace or 3 STARS
PANCAKE, with a supporting region/address. A query guard calls it an address.

**Decision:** the source name survives the guard. After identity resolution,
query the full name with its region directly. Neither delete the digits nor
geocode only the address.

## Brand Known, Branch Unknown

**Evidence:** a chain-wide product review has no visited branch; or a matcha
cafe's branch name says Omotesando while its address says Harajuku. Selected
frames show only the brand logo.

**Decision:** a product-only review supplies no branch destination. A real
visit with conflicting branches remains held. A brand-only frame adds no
branch proof; do not keep sending similar frames or pick the closest branch.

## A Mixed-Region Compilation

**Evidence:** a playlist named Tokyo contains a compilation with an explicitly
identified Singapore venue and a Singapore address in the creator's notes.

**Decision:** derive scope per scene and verify the Singapore premises.
The playlist label does not justify replacing it with a Tokyo business.
If a current address differs from the filmed one, resolve that separate issue.

## Copied Address or Later Move

**Evidence:** a description's restaurant name and address refer to different
branches. A later creator comment gives a corrected address; official dated
information identifies which branch or move it describes.

**Decision:** the newer comment is a claim to check, not automatic precedence.
Keep both source versions and distinguish copied error, another branch and
relocation. Apply the user's established filming-versus-current mapping
choice; otherwise hold a materially different visitor destination.

## Unknown Name and Searchable Clues

**Evidence:** the clip visits a counter restaurant but no source names it.
Speech mentions a chef, the area, and a distinctive dish.

**Decision:** retain an unnamed candidate and research those observed clues
on web/local sources tied to the episode. Do not run Places Text Search for
"counter restaurant in this area" and convert a plausible result into a name.
An uncorroborated foreign-name reconstruction also stays a hypothesis.

## Timestamps and Duplicated Evidence

**Evidence:** a creator comment and description repeat the same venue list;
both have metadata time zero. One visit has speech/OCR at actual 0.0 seconds,
while another venue's entry has no scene anchor.

**Decision:** count repeated text once as support. The first visit can use
`&t=0`; the other uses a whole-video link with time unknown. Do not assign all
list entries time zero, or attach one venue's menu to another scene.

## Verified Export Shape

This illustrates the existing export structure, not a real place to upload.
Review decisions, raw Google names and unresolved alternatives stay in the
separate review record.

```json
{
  "videos": [{
    "videoId": "VIDEO_ID",
    "title": "영상 제목",
    "concept": "영상에서 확인한 지역과 방문 주제",
    "locations": [{
      "name": "근거로 확인한 상호",
      "address": "검증한 주소",
      "latitude": 35.0,
      "longitude": 139.0,
      "googleMapsId": "VERIFIED_GOOGLE_PLACE_ID",
      "source": "both",
      "timestamp": 0,
      "videoUrlWithTimestamp": "https://www.youtube.com/watch?v=VIDEO_ID&t=0",
      "description": "이 방문의 근거만으로 작성한 장소 소개다."
    }]
  }]
}
```

When scene time is unknown, omit `timestamp` and use the real whole-video URL
in `videoUrlWithTimestamp`. A placeholder Google ID never becomes a real pin.
