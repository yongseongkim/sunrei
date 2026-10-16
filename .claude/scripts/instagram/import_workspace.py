"""Import a prototype Instagram workspace into the Sunrei DB through /admin/instagram/*.

The workspace (.claude/workspace/instagram/{username}/) holds what the
prototype pipeline produced: posts.json (Business Discovery listing),
location_tags.json, evidence/{shortcode}.json (Whisper and OCR),
extraction.json, and candidates.json (geocoded places). This stores the
account, every post with its caption, the location tags, the Whisper and OCR
texts, and one extraction run per post with its candidates, then sets each post
to REVIEW_PENDING or COMPLETED. Candidates the prototype matched are re-checked
with place_search.branch_mismatch, so a wrong-district branch becomes NAME_MISMATCH.

Posts that are already past PENDING/FAILED are skipped, so a rerun resumes.
The command is a dry run unless --commit is given. SUNREI_API_URL selects the
server (default: production).

Usage:
    python3 .claude/scripts/instagram/import_workspace.py WORKSPACE [--sunrei SUNREI_ID] [--commit] [--workers 4] [--limit N]
"""

import argparse
import hashlib
import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from extraction_runs import api_location_tag, candidate_input, ocr_text, run_request, status_after_run, whisper_text  # noqa: E402
from graph_api import post_input  # noqa: E402
from instagram_collection_api import InstagramCollectionApi  # noqa: E402
from place_search import branch_mismatch  # noqa: E402

PROCESSABLE = {"PENDING", "FAILED"}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("workspace", type=Path)
    parser.add_argument("--sunrei", help="Sunrei that approved places go to; required when the account is new")
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int, help="Import at most N posts (newest first), for a trial run")
    return parser.parse_args()


def geocoding_of(candidate):
    """Translate a prototype candidate's status into place_search.geocode() fields."""
    status = candidate["status"]
    place = candidate.get("place")
    found = {key: place[key] for key in ("name", "address", "latitude", "longitude", "googleMapsId")} if place else None
    if candidate.get("nameFound") is False or status in ("unnamed", "skipped_name", "skipped_ad"):
        return {"geocodeStatus": "NOT_SEARCHED"}
    if status == "geocode_failed":
        return {"geocodeStatus": "NOT_FOUND", "geocodeWarning": candidate.get("geocodeWarning") or "No Places result"}
    if status == "name_mismatch":
        return {"geocodeStatus": "NAME_MISMATCH", "place": found, "geocodeWarning": candidate.get("geocodeWarning")}
    missing = branch_mismatch(candidate.get("area"), found["address"]) if found else None
    if missing:
        return {"geocodeStatus": "NAME_MISMATCH", "place": found,
                "geocodeWarning": f"Address '{found['address']}' is not in {', '.join(missing)} from the area '{candidate.get('area')}'"}
    return {"geocodeStatus": "MATCHED", "place": found}


def load_workspace(ws):
    listing = json.loads((ws / "posts.json").read_text())
    tags_path = ws / "location_tags.json"
    tags = json.loads(tags_path.read_text()) if tags_path.is_file() else {}
    extraction = json.loads((ws / "extraction.json").read_text())
    candidates = json.loads((ws / "candidates.json").read_text())
    by_post = {}
    for candidate in candidates:
        by_post.setdefault(candidate["postId"], []).append(candidate)
    batch_of = {}
    for batch in extraction["batches"]:
        # Prototype batches have no id; derive one so posts extracted together share it.
        batch.setdefault("batchId", "ws" + hashlib.sha1(batch["startedAt"].encode()).hexdigest()[:24])
        for post_id in batch["postIds"]:
            batch_of[post_id] = batch  # later batches win: a re-extracted post keeps its latest batch
    return listing, tags, extraction["posts"], by_post, batch_of


def main():
    args = parse_args()
    ws = args.workspace
    listing, tags, items, candidates_by_post, batch_of = load_workspace(ws)
    account = listing["account"]
    posts = listing["posts"]
    api = InstagramCollectionApi()
    print(f"server: {api.base_url}")
    print(f"workspace: {account['username']} ({account['id']}), {len(posts)} posts, {len(items)} extracted, "
          f"{sum(len(v) for v in candidates_by_post.values())} candidates")

    existing = api.get_account(account["id"])
    if not existing and not args.sunrei:
        raise SystemExit("The account is not registered yet; pass --sunrei SUNREI_ID")
    if not args.commit:
        stored = {post["id"]: post["status"] for post in api.list_posts(account_id=account["id"])} if existing else {}
        todo = [post for post in posts if stored.get(post["id"], "PENDING") in PROCESSABLE][: args.limit]
        print(f"account: {'registered' if existing else 'new'}; {len(stored)} posts stored, {len(todo)} to import")
        print("Dry run only. Re-run with --commit to import.")
        return

    api.upsert_account(account["id"], {
        "username": account["username"],
        "name": account.get("name"),
        "biography": account.get("biography"),
        "followersCount": account.get("followers_count"),
        "mediaCount": account.get("media_count"),
        "sunreiId": args.sunrei,
    })
    added, updated = api.upsert_posts(account["id"], [post_input(post) for post in posts])
    print(f"posts stored: {len(added)} added, {len(updated)} updated")

    stored = {post["id"]: post["status"] for post in api.list_posts(account_id=account["id"])}
    todo = [post for post in posts if stored.get(post["id"]) in PROCESSABLE][: args.limit]
    print(f"{len(todo)} posts to import")
    lock = threading.Lock()
    counts = {"REVIEW_PENDING": 0, "COMPLETED": 0, "FAILED": 0, "candidates": 0}

    def import_post(post):
        post_id, code = post["id"], post["shortcode"]
        try:
            if code in tags:
                api.set_location_tag(post_id, api_location_tag(tags[code].get("location")))
            evidence_path = ws / "evidence" / f"{code}.json"
            evidence = json.loads(evidence_path.read_text()) if evidence_path.is_file() else None
            text_ids = []
            for text in (whisper_text(evidence), ocr_text(evidence)):
                if text:
                    kind = text.pop("kind")
                    text_ids.append(api.create_text(post_id, kind, **text)["id"])
            item = items.get(post_id)
            if item is None:
                api.update_post(post_id, status="FAILED", stage="import", error="No extraction in the workspace")
                return "FAILED", 0
            candidates = [candidate_input(c, geocoding_of(c), evidence) for c in candidates_by_post.get(post_id, [])]
            run = api.create_extraction_run(post_id, run_request(item, batch_of.get(post_id, {}), candidates, text_ids))
            status = status_after_run(run)
            api.update_post(post_id, status=status, stage="imported")
            return status, len(run["places"])
        except Exception as error:  # noqa: BLE001 - record and continue with the other posts
            try:
                api.update_post(post_id, status="FAILED", stage="import", error=str(error)[:1000])
            except Exception:  # noqa: BLE001
                pass
            return "FAILED", 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(import_post, post) for post in todo]
        for index, future in enumerate(as_completed(futures), 1):
            status, stored_candidates = future.result()
            with lock:
                counts[status] += 1
                counts["candidates"] += stored_candidates
            if index % 100 == 0 or index == len(todo):
                print(f"[{index}/{len(todo)}] {counts}", flush=True)
    print(f"done: {counts}")
    if counts["FAILED"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
