"""Extract place candidates from Instagram posts in batches with the structured agent.

Each agent call reads BATCH posts (caption, location tag, and for reels the
Whisper transcript and OCR text) and returns their promotion class and places,
following prompts/extract_locations.md. Results are saved after every batch, so
a rerun skips posts already in OUTPUT_JSON. Codex runs first and Claude takes
over when it fails, as in the YouTube collection.

Usage:
    uv run --with openai-codex==0.160.0 python .claude/scripts/instagram/extract_locations.py INPUT_JSON OUTPUT_JSON [--batch 15]

INPUT_JSON is {"account": {"username", "name"}, "posts": [post inputs]}; build
each post input with post_input(). OUTPUT_JSON gets {"posts": {postId: item},
"batches": [{batchId, agent, promptSha256, startedAt, finishedAt, postIds, missing}]}.
"""

import argparse
import hashlib
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROMPT_FILE = HERE / "prompts" / "extract_locations.md"
SCHEMA_FILE = HERE / "extract_locations.schema.json"
HANGUL = re.compile(r"[가-힣]")
OCR_MIN_CONFIDENCE = 0.6


def prompt_sha256():
    return hashlib.sha256(PROMPT_FILE.read_bytes() + SCHEMA_FILE.read_bytes()).hexdigest()


def evidence_inputs(evidence):
    """Return (speech, onscreen) prompt inputs from a reel_evidence.py result, or (None, None)."""
    if not evidence:
        return None, None
    speech = [{"t": s["start"], "text": s["text"]} for s in (evidence.get("audio") or {}).get("segments", [])] or None
    # OCR fragments that are neither Korean nor confidently read are mostly background noise.
    onscreen = [
        {"t": s["start"], "text": s["text"]}
        for s in (evidence.get("onscreen") or {}).get("segments", [])
        if HANGUL.search(s["text"]) or (s.get("confidence", 0) >= OCR_MIN_CONFIDENCE and len(s["text"]) >= 3)
    ] or None
    return speech, onscreen


def post_input(post_id, permalink, timestamp, media_type, product_type, caption, location_tag=None, evidence=None):
    """Build one post's prompt input. ``location_tag`` is {"name", "lat", "lng"} as read from the page."""
    speech, onscreen = evidence_inputs(evidence)
    return {
        "postId": post_id,
        "permalink": permalink,
        "timestamp": timestamp,
        "mediaType": media_type,
        "productType": product_type,
        "caption": caption or "",
        "locationTag": {"name": location_tag["name"], "latitude": location_tag.get("lat"), "longitude": location_tag.get("lng")}
        if location_tag else None,
        "speech": speech,
        "onscreen": onscreen,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input_json", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--batch", type=int, default=15)
    args = parser.parse_args()

    sys.path.insert(0, str(HERE.parent / "youtube"))
    from structured_agent import run_structured

    data = json.loads(args.input_json.read_text())
    out = json.loads(args.output_json.read_text()) if args.output_json.is_file() else {"posts": {}, "batches": []}
    pending = [post for post in data["posts"] if post["postId"] not in out["posts"]]
    print(f"{len(pending)} posts to extract ({len(out['posts'])} done)", flush=True)
    sha = prompt_sha256()

    for start in range(0, len(pending), args.batch):
        batch = pending[start:start + args.batch]
        payload = {"account": data["account"], "posts": batch}
        prompt = PROMPT_FILE.read_text() + "\n## Input Data\n\n" + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        started = datetime.now(timezone.utc).isoformat()
        result = run_structured(prompt, SCHEMA_FILE, timeout=1200, temp_prefix="sunrei-ig-extract-")
        agent = result.pop("agent", None)
        ids = {post["postId"] for post in batch}
        returned = {item["postId"]: item for item in result.get("posts", []) if item["postId"] in ids}
        for post_id, item in returned.items():
            item["agent"] = agent
            out["posts"][post_id] = item
        out["batches"].append({
            "batchId": "b" + uuid.uuid4().hex[:24],
            "agent": agent,
            "promptSha256": sha,
            "startedAt": started,
            "finishedAt": datetime.now(timezone.utc).isoformat(),
            "postIds": [post["postId"] for post in batch],
            "missing": [post["postId"] for post in batch if post["postId"] not in returned],
        })
        temporary = args.output_json.with_suffix(".tmp")
        temporary.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
        temporary.replace(args.output_json)
        places = sum(len(item["places"]) for item in returned.values())
        print(f"batch {start // args.batch + 1}: {len(batch)} posts, {places} places, agent={agent}, "
              f"missing={len(batch) - len(returned)}", flush=True)


if __name__ == "__main__":
    main()
