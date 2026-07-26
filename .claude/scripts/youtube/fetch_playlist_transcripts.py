"""Batch-fetch YouTube captions for a playlist workspace, rate-limit aware.

YouTube's caption endpoint IP-blocks on request rate (~15-20 requests per
window regardless of 14-20s spacing). A 60-90s drip between videos stays under
the threshold; on a block, back off 10 minutes and retry the same video.
Progress is written incrementally to transcripts_raw.json, so an interrupted
run resumes by rerunning the same command.

Usage:
    uv run --with youtube-transcript-api --with python-dotenv \
      python .claude/scripts/youtube/fetch_playlist_transcripts.py {ID}

{ID} is the workspace directory name under .claude/workspace/youtube/
(a path to the workspace directory also works).
"""
import json
import random
import sys
import time
from pathlib import Path

from extract_transcript import extract_transcript

DELAY_MIN, DELAY_MAX = 60, 90
BLOCK_BACKOFF = 600
MAX_CONSEC_BLOCKS = 4


def is_block(err):
    e = err or ""
    return "blocking requests from your IP" in e or "blocked by YouTube" in e


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    ws = Path(sys.argv[1])
    if not ws.is_dir():
        ws = Path(__file__).resolve().parents[2] / "workspace" / "youtube" / sys.argv[1]
    info_file = ws / "video_info.json"
    if not info_file.is_file():
        print(f"Error: {info_file} not found. Run /youtube-fetch-info first.")
        sys.exit(1)

    info = json.load(open(info_file))
    out = ws / "transcripts_raw.json"

    done = {}
    if out.exists():
        try:
            done = {v["videoId"]: v for v in json.load(open(out)).get("videos", [])}
        except Exception:
            done = {}

    if info.get("type") == "video":
        vids = [(info["id"], info.get("title", ""))]
    else:
        vids = [(v["videoId"], v.get("title", "")) for v in info["selectedVideos"]]
    todo = [(vid, t) for vid, t in vids if vid not in done or "error" in done[vid]]
    cached = sum(1 for v in done.values() if "error" not in v)
    print(f"to fetch: {len(todo)} (cached ok: {cached})", flush=True)

    results = list(done.values())
    ok = fail = consec_blocks = 0
    i = 0
    while i < len(todo):
        vid, title = todo[i]
        res = extract_transcript(vid)
        res["title"] = title

        if "error" in res and is_block(res["error"]):
            consec_blocks += 1
            print(f"[{i+1}/{len(todo)}] {vid} BLOCKED — backing off {BLOCK_BACKOFF}s ({consec_blocks}/{MAX_CONSEC_BLOCKS})", flush=True)
            if consec_blocks > MAX_CONSEC_BLOCKS:
                print("ABORT: block persists. Progress saved; rerun to resume.", flush=True)
                break
            time.sleep(BLOCK_BACKOFF)
            continue  # retry the same video, do not advance

        if "error" in res:
            fail += 1
            print(f"[{i+1}/{len(todo)}] {vid} no-caption ({res['error'][:50]})", flush=True)
        else:
            ok += 1
            print(f"[{i+1}/{len(todo)}] {vid} OK ({len(res.get('segments', []))} seg, {res.get('language')})", flush=True)
        consec_blocks = 0
        results = [r for r in results if r.get("videoId") != vid] + [res]
        json.dump({"videos": results}, open(out, "w"), ensure_ascii=False, indent=2)
        i += 1
        if i < len(todo):
            time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))

    print(f"DONE: {ok} ok, {fail} no-caption -> {out}", flush=True)


if __name__ == "__main__":
    main()
