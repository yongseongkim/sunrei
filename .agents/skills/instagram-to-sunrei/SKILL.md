---
name: instagram-to-sunrei
description: Collect places from an Instagram account into a Sunrei. Use when the user asks to register an Instagram account, collect or renew its posts, extract the places its posts introduce, review or cross-check those places against YouTube, or import a prototype Instagram workspace.
---

# Collect Instagram Places into a Sunrei

Each registered Instagram account has one Sunrei. The collector stores the
account's posts, location tags, reel transcripts, and extracted place
candidates in the Sunrei DB through `/admin/instagram/*`. A candidate becomes a
SunreiSpot linked to its post only when it is approved. See
`SPEC-instagram.md` for the data model and rules.

Everything that touches Instagram runs on this machine: Business Discovery
calls, post page reads, reel downloads, Whisper and OCR, extraction, and
geocoding. The server only stores the results and serves them; it never calls
Instagram and has no scheduled job. Point `SUNREI_API_URL` at the server that
should receive the data.

Every command takes `SUNREI_API_URL` (default: production). The admin token is
minted locally from SOPS, as for the YouTube scripts.

## 1. Check the Access Token

Business Discovery needs a valid Facebook user token:

```bash
python3 .claude/scripts/instagram/token_status.py
```

- Exit 0: continue.
- Exit 2: continue, and tell the user the token expires within 7 days.
- Exit 1: stop and ask the user to run
  `! python3 .claude/scripts/instagram/refresh_token.py`. Check again before
  continuing.

`refresh_token.py` opens the Facebook login in the browser. In the consent
dialog the user edits the settings and opts in only the Sunrei Page and the
`_yongseongk` Instagram account. The script catches the result on
`localhost:9877`, exchanges it for a token that lasts about 60 days, and saves
it to the secrets file; remind the user to commit that file. Do not run it
yourself unless the user's permission settings allow it, because it writes the
secrets file. If the login fails, the fallback is a Graph API Explorer token:
`! pbpaste | python3 .claude/scripts/instagram/refresh_token.py --token-stdin`.
One token works for every account Business Discovery looks up.

## 2. Register the Account

```bash
python3 .claude/scripts/instagram/instagram_accounts.py add USERNAME
```

- The account must be a public professional (business or creator) account.
- Without `--sunrei`, the command finds or creates the account's INSTAGRAM
  Source (an existing Source with the profile URL is switched to INSTAGRAM)
  and a draft Sunrei.
- The profile picture becomes the Source's poster image, the channel avatar in
  the app. Instagram picture URLs expire, so it is copied into Sunrei's image
  storage. `instagram_accounts.py update USERNAME --refresh-picture` replaces
  it after the account changes its picture.
- The account's Sunrei may be moved under another Source of the same series,
  as choiza11's Sunrei sits under the 최자로드 YouTube channel. The scripts then
  leave that Source's poster alone.
- Every post is collected, history included. `--baseline skip` records the
  newest page as SKIPPED so only later posts are processed; use it only when
  the user asks for new posts only.
- `instagram_accounts.py list` shows each account's post counts and backfill
  progress.

## 3. Collect Posts

Dry run first, then commit:

```bash
python3 .claude/scripts/instagram/renew_accounts.py --account USERNAME
python3 .claude/scripts/instagram/renew_accounts.py --commit --account USERNAME --max-posts 30
```

A committed run:

- lists posts through Business Discovery (`--max-pages`, default 10, per run;
  the backfill continues from the saved cursor next time);
- reads location tags from the logged-out post pages;
- downloads reels and runs Whisper and full-frame OCR;
- extracts places in batches of 15 posts with Codex, then Claude on failure;
- geocodes candidates with Places Text Search and stores one extraction run per
  post.

Posts move from PENDING to REVIEW_PENDING, or COMPLETED when nothing is left
to review. A failed post becomes FAILED and is retried by the next run.

Pace and limits:

- Business Discovery shares an hourly budget per app. A full backfill of a
  2,000-post account fills it; the client pauses at 75% usage.
- Instagram throttles logged-out page reads and downloads without a published
  limit. The scripts pause between requests and stop on a login wall; rerun an
  hour later. See `instagram-download-reels` for the download rules.
- Disclosed ads and the author's own promotions produce no candidates; the
  server enforces this.

## 4. Copy Post Images

Spots show their post's images in the app (place detail) and the admin (spot
card). The collector copies them for new posts with candidates. For posts
imported or collected before that, run:

```bash
python3 .claude/scripts/instagram/post_images.py USERNAME
python3 .claude/scripts/instagram/post_images.py USERNAME --commit
```

It takes each post's images (a reel's cover, the photo, or up to five carousel
items) through Business Discovery, copies them into Sunrei's image storage with
`/admin/images/upload-url`, and stores them on the post; spots already approved
from the post that have no images get them. Instagram's image URLs expire, so
never store them directly. Posts flagged for copyright can come back without an
image URL; those are reported and skipped.

## 5. Review Candidates

List what needs a decision:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$SUNREI_API_URL/admin/instagram/extracted-places?accountId=ACCOUNT_ID&reviewStatus=PENDING&size=100"
```

- `MATCHED`: the search found an apparent name-and-area match. Verify the
  post-to-venue evidence and branch before approving; this status is not proof
  that the pin is the place filmed.
- `NAME_MISMATCH`: Google returned another name or a branch in another
  district. Check the post (`permalink`) and pass the right `place` when
  approving, or reject.
- `NOT_FOUND`, `NOT_SEARCHED` (`nameFound` false): no usable match; approve
  only with a `place` you verified.
- `existingSpotIds`: the account's Sunrei already has a spot at this place
  from another post. The public card shows one mention per Sunrei and place, so
  rejecting the repeat is usually right.

When comparing posts with YouTube or choosing between duplicate sources, read
[cross-platform review](references/cross-platform-review.md). Keep the user's
existing exclusions, holds, and source preference; a review request does not
authorize migrating every post or registering additional playlists.

### Search with the Post's Own Keywords

Research every candidate that is not `MATCHED` before approving it. Build the
searches from words the post itself gives, never from a guess:

- the name as spoken in the video or shown on screen, and the area from the
  caption, hashtags, or location tag;
- people and shows the post names, such as a chef's name or nickname and the
  TV program ("소바쥬 무쇠팔 박주성", "흑백요리사");
- facts that set the place apart, such as short opening hours or entry by
  password;
- the author's own comments, which sometimes give the address. Business
  Discovery does not supply these; public page reads may expose only some.
  Continue with other evidence when comments are unavailable, and ask the user
  only if a missing comment is needed to settle the identity.

Search where people in the post's region look up places, such as Naver and
Kakao Map in Korea or Tabelog in Japan. Claude's WebSearch rarely finds these;
fetch the search page with curl and a browser User-Agent.

In Korea, start with Naver Map. Naver's search page,
`https://search.naver.com/search.naver?query=…`, embeds Naver Map's place
cards, and each card's `"roadAddress"` is the listed address. Verify its branch
and freshness when it conflicts with the footage or dated sources. Naver Map
can list branches or moves that Google lacks. Add the area or branch to the
query when the name is short or
has several branches ("방울과꼬막 서순라길", "중국 청운동"). Blog posts
(`where=blog`) help confirm that the place is the one in the post. Accept a
place only when a source matches facts from the post, such as the address, the
chef, the hours, or the menu.

Then search Google with what the research found. In Korea, search the Naver
Map address:

- When Google's result at that address is the business, use it. The Google
  name can differ from the one in the video: "202호" is listed as "이백이호".
- When there is no business listing, follow the verified address-pin rules in
  [geocoding and review](../youtube-extract-locations/references/geocoding-and-review.md).
  Keep existing user-approved proxy mappings, such as 방울과꼬막 서순라길점;
  do not treat an unrelated business returned nearby as a new match.
- Google can keep an old address after a move. Confirm the relocation, keep
  filming and current addresses separate, and follow the user's mapping
  choice. For 소바쥬, the user chose the current 신사 address over the filmed
  공덕 address.
- Without an address, a short or common name needs the category and area in
  the query. "중국" in 서촌 returns other Chinese restaurants nearby;
  "중국 중식당 종로구 서촌" finds it.

A candidate that had no place has an empty `existingSpotIds`. After choosing
its place, check the Sunrei's spots for the same `googleMapsId`.

When signs or interiors need image review, or an old post differs from today's
business, use [visual and historical review](../youtube-extract-locations/references/visual-and-historical-review.md).
Keep filming and source dates separate, and resolve relocation versus another
branch before choosing the pin.

Approve or reject:

```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reviewStatus": "APPROVED"}' "$SUNREI_API_URL/admin/instagram/extracted-places/ID"
```

To approve with a place you found, add `"place": {"name", "address",
"latitude", "longitude", "googleMapsId"}` to the body.

Get decisions for unresolved candidates before approving in bulk; reuse
explicit decisions already given for this scope. Approve sequentially to
avoid concurrent Place creation. For changes to existing spots, follow
[the admin update rules](../youtube-create-sunrei/references/admin-operations.md).
Publish the Sunrei only when the user asks.

## Import a Prototype Workspace

A workspace built by the prototype pipeline
(`.claude/workspace/instagram/USERNAME/` with `posts.json`,
`location_tags.json`, `evidence/`, `extraction.json`, `candidates.json`) is
stored in one pass:

```bash
python3 .claude/scripts/instagram/import_workspace.py .claude/workspace/instagram/USERNAME
python3 .claude/scripts/instagram/import_workspace.py .claude/workspace/instagram/USERNAME --commit
```

Register the account first, or pass `--sunrei`. Posts already past
PENDING/FAILED are skipped, so the command can be rerun.

## Files

Runs keep their inputs and outputs under
`.claude/workspace/instagram/automation/USERNAME/` (gitignored) and delete the
downloaded videos afterwards. Never commit workspace files or print the access
token.

## Finish

Report the reviewed account and post range, candidates approved or rejected,
spots added or changed, and unresolved or unprocessed items. Distinguish
extraction, review, saving, and publication; a completed reviewed batch does
not mean the whole account or its related YouTube playlists are finished.
