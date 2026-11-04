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

## 5. Resolve and Review Locations

Use [Instagram location review](references/location-review.md) for status
queries, regional research, duplicate checks and approval requests. Apply the
shared extraction phases to the post before accepting a map suggestion.
For subagent execution, use the shared
[role and handoff contract](../youtube-extract-locations/references/subagent-workflow.md)
with post IDs and Instagram evidence:

1. Collect caption, location tag, creator comments when accessible, and timed
   reel/OCR evidence; record coverage and source identity.
2. Reconstruct the visit and separate observed venue clues from hypotheses.
3. Pass the [identity gate](../youtube-extract-locations/references/identity-resolution.md)
   before a new Places query. Missing names or conflicting branches stay held.
4. Verify the [exact map match](../youtube-extract-locations/references/geocoding-and-review.md),
   including premises and filming-versus-current address. `MATCHED` is a search
   proposal, not proof that this is the filmed venue.
5. Review the complete set, reuse existing user decisions, and approve only
   within the authorized scope. Publish only when the user asks.

For unresolved visual or historical clues, use
[selective visual review](../youtube-extract-locations/references/visual-and-historical-review.md).
Keep the user's exclusions and source preferences. Cross-platform decisions
follow [cross-platform review](references/cross-platform-review.md); reviewing
one account does not authorize migrating posts or adding related playlists.

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
