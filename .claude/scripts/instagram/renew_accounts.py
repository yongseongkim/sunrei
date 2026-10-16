"""Collect new posts from registered Instagram accounts into the Sunrei DB.

Accounts, posts, and their processing status live behind the admin Instagram
API, so the collector runs anywhere that reaches it (``SUNREI_API_URL``). The
command is a dry run unless ``--commit`` is supplied. A committed run, per
account:

1. lists posts through Business Discovery and stores them. Until the backfill is
   complete it continues from the saved cursor; afterwards it stops at the first
   page with no new post. At most --max-pages pages per run.
2. resets posts left PROCESSING longer than --stale-hours to FAILED.
3. processes up to --max-posts PENDING or FAILED posts, newest first: reads the
   location tags, downloads reels for Whisper and OCR, extracts places in
   batches, geocodes them, and stores texts and one extraction run per post.
   Posts that produced candidates get copies of their images (post_images.py).
   Candidates wait for admin review, so no Sunrei is changed here.

Heavy steps run as their own scripts with ``uv run``: location_tags.py
(Chrome), download_reels.py (yt-dlp), reel_evidence.py (Whisper, EasyOCR), and
extract_locations.py (Codex, then Claude). Files of a run are kept under
.claude/workspace/instagram/automation/ and its videos are deleted afterwards.

Usage:
    python3 .claude/scripts/instagram/renew_accounts.py
    python3 .claude/scripts/instagram/renew_accounts.py --commit [--account USERNAME] [--max-posts 30] [--max-pages 10]
"""

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "youtube"))
from _common import ROOT, load_google_api_key  # noqa: E402
from extract_locations import post_input as prompt_post_input  # noqa: E402
from extraction_runs import api_location_tag, candidate_input, ocr_text, run_request, status_after_run, whisper_text  # noqa: E402
from graph_api import GraphApi, TokenExpired, log, post_input  # noqa: E402
from instagram_accounts import set_profile_picture, source_of_sunrei  # noqa: E402
from instagram_collection_api import InstagramCollectionApi  # noqa: E402
from place_search import geocode  # noqa: E402
from post_images import save_post_images  # noqa: E402

AUTOMATION_ROOT = ROOT / ".claude" / "workspace" / "instagram" / "automation"
AD_PROMOTIONS = {"DISCLOSED_AD", "SELF_PROMOTION"}
PROCESSABLE = ("PENDING", "FAILED")


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--account", help="Only this username (also when syncEnabled is false)")
    parser.add_argument("--max-pages", type=int, default=10)
    parser.add_argument("--max-posts", type=int, default=30)
    parser.add_argument("--stale-hours", type=float, default=24)
    parser.add_argument("--skip-sync", action="store_true", help="Process stored posts without listing new ones")
    return parser.parse_args()


def run_uv(args, timeout, allowed=(0,)):
    """Run a script under ``uv run`` from the repo root; raise unless the exit code is allowed."""
    result = subprocess.run(["uv", "run", *args], cwd=ROOT, text=True, capture_output=True, timeout=timeout)
    for line in result.stdout.strip().splitlines()[-5:]:
        log(f"  {line}")
    if result.returncode not in allowed:
        details = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"{Path(args[-1] if args else '').name} failed ({result.returncode}): {details[-1500:]}")
    return result.returncode


def sync_posts(graph, api, account, max_pages, commit):
    """List posts through Business Discovery and store them; returns (new posts, profile)."""
    username = account["username"]
    backfill = account.get("backfillCompletedAt") is None
    cursor = account.get("backfillCursor") if backfill else None
    stored = {post["id"] for post in api.list_posts(account_id=account["id"])} if not commit else None
    added_total, first_profile = 0, None
    for page_number in range(1, max_pages + 1):
        profile, items, next_cursor = graph.media_page(username, after=cursor)
        first_profile = first_profile or profile
        posts = [post_input(item) for item in items]
        if commit:
            added, _ = api.upsert_posts(account["id"], posts)
        else:
            added = [post["id"] for post in posts if post["id"] not in stored]
        added_total += len(added)
        log(f"{username} page {page_number}: {len(posts)} posts, {len(added)} new (usage {graph.usage}%)")
        if commit:
            body = {"username": profile.get("username", username), "name": profile.get("name"),
                    "biography": profile.get("biography"), "followersCount": profile.get("followers_count"),
                    "mediaCount": profile.get("media_count")}
            if backfill:
                body.update({"backfillCompleted": True} if not next_cursor else {"backfillCursor": next_cursor})
            api.upsert_account(account["id"], body)
        if not next_cursor or (not backfill and not added):
            break
        cursor = next_cursor
    return added_total, first_profile


def reset_stale(api, account, stale_hours):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=stale_hours)
    for post in api.list_posts(account_id=account["id"], status="PROCESSING"):
        if datetime.fromisoformat(post["updatedAt"].replace("Z", "+00:00")) < cutoff:
            api.update_post(post["id"], status="FAILED", stage="stale", error=f"PROCESSING for more than {stale_hours} hours")
            log(f"{post['shortcode']}: reset stale PROCESSING to FAILED")


def process_posts(api, account, posts, run_dir):
    """Run tags, reels, extraction, and geocoding for posts already set to PROCESSING."""
    username = account["username"]
    by_code = {post["shortcode"]: post for post in posts}
    codes_file = run_dir / "codes.txt"
    codes_file.write_text("\n".join(by_code) + "\n")

    # Location tags: a login wall (exit 3) leaves the rest unread, which only loses a hint.
    tags_file = run_dir / "location_tags.json"
    run_uv(["--with", "playwright", "python", str(HERE / "location_tags.py"), str(tags_file), str(codes_file)], 3600, allowed=(0, 3))
    tags = json.loads(tags_file.read_text()) if tags_file.is_file() else {}
    for code, tag in tags.items():
        if code in by_code:
            api.set_location_tag(by_code[code]["id"], api_location_tag(tag.get("location")))

    # Reels: download, then Whisper and OCR. Throttled downloads (exit 3) are retried in a later run.
    videos_dir, evidence_dir = run_dir / "videos", run_dir / "evidence"
    reels = [post for post in posts if post["mediaType"] == "VIDEO"]
    text_ids = {post["id"]: [] for post in posts}
    evidence = {}
    if reels:
        urls_file = run_dir / "reels.txt"
        urls_file.write_text("\n".join(post["permalink"] for post in reels) + "\n")
        run_uv(["--with", "yt-dlp", "python", str(HERE / "download_reels.py"), str(videos_dir), str(urls_file),
                "--api-fallback", username], 7200, allowed=(0, 3))
        run_uv(["--python", "3.11", "--with", "openai-whisper", "--with", "easyocr", "--with", "opencv-python-headless",
                "python", str(HERE / "reel_evidence.py"), str(videos_dir), str(evidence_dir)], 7200)
        for post in reels:
            path = evidence_dir / f"{post['shortcode']}.json"
            if not path.is_file():
                continue
            evidence[post["id"]] = json.loads(path.read_text())
            for text in (whisper_text(evidence[post["id"]]), ocr_text(evidence[post["id"]])):
                if text:
                    kind = text.pop("kind")
                    text_ids[post["id"]].append(api.create_text(post["id"], kind, **text)["id"])

    # Extraction in batches of 15 posts per agent call.
    input_file, output_file = run_dir / "extraction_input.json", run_dir / "extraction.json"
    input_file.write_text(json.dumps({
        "account": {"username": username, "name": account.get("name") or username},
        "posts": [prompt_post_input(post["id"], post["permalink"], post["postedAt"], post["mediaType"], post.get("productType"),
                                    post.get("caption"), (tags.get(post["shortcode"]) or {}).get("location"), evidence.get(post["id"]))
                  for post in posts],
    }, ensure_ascii=False))
    run_uv(["--with", "openai-codex==0.160.0", "python", str(HERE / "extract_locations.py"), str(input_file), str(output_file)], 7200)
    extraction = json.loads(output_file.read_text())
    batch_of = {post_id: batch for batch in extraction["batches"] for post_id in batch["postIds"]}

    key = load_google_api_key()
    if not key:
        raise RuntimeError("No Google API key for Places search")
    cache = {}
    with_places = {}
    for post in posts:
        item = extraction["posts"].get(post["id"])
        if item is None:
            api.update_post(post["id"], status="FAILED", stage="extract", error="The agent returned no result for this post")
            continue
        try:
            tag = api_location_tag((tags.get(post["shortcode"]) or {}).get("location"))
            candidates = []
            for place in item["places"]:
                # Ads produce no candidates on the server, so skip their Places searches.
                fields = {"geocodeStatus": "NOT_SEARCHED"} if item["promotion"] in AD_PROMOTIONS else geocode(key, place, tag, cache)
                candidates.append(candidate_input(place, fields, evidence.get(post["id"])))
            run = api.create_extraction_run(post["id"], run_request(item, batch_of.get(post["id"], {}), candidates, text_ids[post["id"]]))
            status = status_after_run(run)
            api.update_post(post["id"], status=status, stage="done")
            if run["places"]:
                with_places[post["id"]] = post["shortcode"]
            log(f"{post['shortcode']}: {len(run['places'])} candidates, {status}")
        except Exception as error:  # noqa: BLE001 - keep the other posts going
            api.update_post(post["id"], status="FAILED", stage="store", error=str(error)[:1000])
            log(f"{post['shortcode']}: FAILED {error}")

    # Copy the images of posts that produced candidates, so their spots show the post.
    if with_places:
        log(f"post images: {save_post_images(GraphApi(), api, username, with_places)}")
    shutil.rmtree(videos_dir, ignore_errors=True)


def main():
    args = parse_args()
    api = InstagramCollectionApi()
    accounts = api.list_accounts()
    if args.account:
        accounts = [a for a in accounts if a["username"].lower() == args.account.lower().lstrip("@")]
        if not accounts:
            raise SystemExit(f"Account {args.account} is not registered; add it with instagram_accounts.py")
    else:
        accounts = [a for a in accounts if a["syncEnabled"]]
    log(f"server: {api.base_url}; {len(accounts)} accounts; {'COMMIT' if args.commit else 'DRY-RUN'}")

    graph = None if args.skip_sync else GraphApi()

    for account in accounts:
        username = account["username"]
        try:
            if graph:
                added, profile = sync_posts(graph, api, account, args.max_pages, args.commit)
                log(f"{username}: {added} new posts")
                # The channel avatar: copy the profile picture once, when the Source has no poster yet.
                if args.commit and profile and account.get("sunreiId"):
                    set_profile_picture(api, source_of_sunrei(api, account["sunreiId"]), profile.get("profile_picture_url"))
        except TokenExpired as error:
            raise SystemExit(str(error))
        if args.commit:
            reset_stale(api, account, args.stale_hours)
        pending = sorted(
            (post for status in PROCESSABLE for post in api.list_posts(account_id=account["id"], status=status)),
            key=lambda post: post["postedAt"], reverse=True,
        )
        batch = pending[: args.max_posts]
        log(f"{username}: {len(pending)} posts waiting, processing {len(batch)}")
        if not args.commit or not batch:
            continue
        run_dir = AUTOMATION_ROOT / username / datetime.now().strftime("%Y%m%d-%H%M%S")
        run_dir.mkdir(parents=True, exist_ok=True)
        for post in batch:
            api.update_post(post["id"], status="PROCESSING", stage="collect", error="")
        try:
            process_posts(api, account, batch, run_dir)
        except Exception as error:  # noqa: BLE001 - leave the batch retryable
            for post in batch:
                current = api.get_post(post["id"])
                if current and current["post"]["status"] == "PROCESSING":
                    api.update_post(post["id"], status="FAILED", stage="collect", error=str(error)[:1000])
            log(f"{username}: batch failed: {error}")


if __name__ == "__main__":
    main()
