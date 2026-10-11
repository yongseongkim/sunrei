"""Prepare re-derivation batch files from legacy locations + fresh transcripts.

For a playlist, emit batch_N.json files (N videos each) of the form:
  [{videoId, title, concept, legacyPlaces:[{name, oldTimestamp, context}],
    transcript: <cleanedText>}]
A subagent reads one batch file, re-derives places against the CURRENT transcript,
and returns fresh timestamps + new/removed status. Legacy geocodes are reused at
merge time, so the agent only handles fuzzy transcript matching + new places.

Usage: uv run python prep_redrive_batches.py <ID> [batch_size]
"""
import json
import sys
from _common import workspace

BATCH_SIZE = 8


def main():
    ws_id = sys.argv[1]
    size = int(sys.argv[2]) if len(sys.argv) > 2 else BATCH_SIZE
    ws = workspace(ws_id)
    legacy = {v["videoId"]: v for v in json.load(open(ws / "locations.legacy.json"))["videos"]}
    transcripts = {v["videoId"]: v for v in json.load(open(ws / "transcripts.json"))["videos"]}
    info = json.load(open(ws / "video_info.json"))
    sel = info["selectedVideos"]

    batch = []
    bi = 0
    for v in sel:
        vid = v["videoId"]
        leg = legacy.get(vid)
        lp = []
        concept = ""
        if leg:
            concept = leg.get("concept", "")
            for l in leg.get("locations", []):
                lp.append({"name": l.get("name", ""), "oldTimestamp": l.get("timestamp"),
                           "context": (l.get("description") or "")[:200]})
        tr = transcripts.get(vid, {})
        entry = {
            "videoId": vid,
            "title": tr.get("title") or v.get("title", ""),
            "concept": concept,
            "isNew": leg is None,
            "legacyPlaces": lp,
            "transcript": tr.get("cleanedText", ""),
        }
        batch.append(entry)
        if len(batch) >= size:
            json.dump(batch, open(ws / f"batch_{bi}.json", "w"), ensure_ascii=False, indent=2)
            bi += 1; batch = []
    if batch:
        json.dump(batch, open(ws / f"batch_{bi}.json", "w"), ensure_ascii=False, indent=2)
        bi += 1
    print(f"{ws_id}: wrote {bi} batch files (~{size} videos each) from {len(sel)} videos")


if __name__ == "__main__":
    main()
