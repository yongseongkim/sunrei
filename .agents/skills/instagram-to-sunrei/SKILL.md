---
name: instagram-to-sunrei
description: Collect places from an Instagram account into a Sunrei. Use when the user asks to register an Instagram account, collect or renew its posts, extract the places its posts introduce, review those candidates, or import a prototype Instagram workspace.
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
  `! python3 .claude/scripts/instagram/refresh_token.py`, which opens the
  Facebook login in the browser and saves a 60-day token. Do not run it
  yourself; it writes the secrets file. Check again before continuing.

## 2. Register the Account

```bash
python3 .claude/scripts/instagram/instagram_accounts.py add USERNAME
```

- The account must be a public professional (business or creator) account.
- Without `--sunrei`, the command finds or creates the account's INSTAGRAM
  Source (an existing Source with the profile URL is switched to INSTAGRAM)
  and a draft Sunrei.
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

## 4. Review Candidates

List what needs a decision:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$SUNREI_API_URL/admin/instagram/extracted-places?accountId=ACCOUNT_ID&reviewStatus=PENDING&size=100"
```

- `MATCHED`: the business name and district agree with Google. Approve unless
  the description shows a different branch.
- `NAME_MISMATCH`: Google returned another name or a branch in another
  district. Check the post (`permalink`) and pass the right `place` when
  approving, or reject.
- `NOT_FOUND`, `NOT_SEARCHED` (`nameFound` false): no usable match; approve
  only with a `place` you verified.
- `existingSpotIds`: the account's Sunrei already has a spot at this place
  from another post. The public card shows one mention per Sunrei and place, so
  rejecting the repeat is usually right.

Approve or reject:

```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reviewStatus": "APPROVED"}' "$SUNREI_API_URL/admin/instagram/extracted-places/ID"
```

Show the user the candidates and get their decisions before approving in
bulk. Publish the Sunrei only when the user asks.

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
