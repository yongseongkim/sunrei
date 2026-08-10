"""Merge re-derivation batch results into a fresh locations.json.

Inputs (in <playlist workspace>/):
  locations.legacy.json   - old geocoded places (pre-edit) -> reuse geocode + context
  transcripts.json        - fresh transcripts with segments -> quote -> timestamp
  batch_N_result.json     - agent output: [{videoId, places:[{name,status,quote,areaHint,context}]}]

For each video:
  - confirmed place that matches a legacy place (by name) -> reuse legacy geocode +
    context, refresh timestamp from the quote.
  - new place (or confirmed with no legacy match) -> geocode by name + areaHint,
    use agent context.
  - removed -> dropped.
Writes locations.json.

Usage: uv run python merge_redrive.py <ID>
"""
import glob
import json
import re
import sys
import time

from _common import load_google_api_key, workspace
from geocode import search

SEG_JOIN_RE = re.compile(r"\s+")


def norm(s):
    return re.sub(r"\s+", "", (s or "")).lower()


def legacy_index(legacy_videos):
    """videoId -> list of legacy place dicts (with normalized name)."""
    idx = {}
    for v in legacy_videos:
        places = []
        for l in v.get("locations", []):
            d = dict(l)
            d["_norm"] = norm(l.get("name"))
            places.append(d)
        idx[v["videoId"]] = places
    return idx


def match_legacy(place_name, legacy_places):
    n = norm(place_name)
    if not n:
        return None
    # exact normalized first
    for lp in legacy_places:
        if lp["_norm"] and lp["_norm"] == n:
            return lp
    # substring either way
    for lp in legacy_places:
        if lp["_norm"] and (lp["_norm"] in n or n in lp["_norm"]):
            return lp
    return None


def ts_for_quote(segments, quote):
    if not quote:
        return None
    q = norm(quote)
    if len(q) < 4:
        return None
    ntexts = [norm(s.get("text", "")) for s in segments]
    offsets = []
    cum = 0
    for nt in ntexts:
        offsets.append(cum)
        cum += len(nt)
    total = "".join(ntexts)
    probe = q[:24]
    pos = total.find(probe)
    if pos < 0:
        pos = total.find(q)
    if pos < 0:
        # try last 20 chars (quote may start mid-join)
        pos = total.find(q[-20:])
    if pos < 0:
        return None
    for i, nt in enumerate(ntexts):
        if offsets[i] <= pos < offsets[i] + max(len(nt), 1):
            return segments[i].get("start")
    return None


def main():
    ws_id = sys.argv[1]
    ws = workspace(ws_id)
    key = load_google_api_key()
    legacy_videos = json.load(open(ws / "locations.legacy.json"))["videos"]
    legacy = legacy_index(legacy_videos)
    legacy_concept = {v["videoId"]: v.get("concept", "") for v in legacy_videos}
    transcripts = {v["videoId"]: v for v in json.load(open(ws / "transcripts.json"))["videos"]}
    info = json.load(open(ws / "video_info.json"))
    sel_order = [v["videoId"] for v in info["selectedVideos"]]
    titles = {v["videoId"]: (v.get("title") or "") for v in info["selectedVideos"]}

    results = {}
    for f in sorted(glob.glob(str(ws / "batch_*_result.json"))):
        for entry in json.load(open(f)):
            results[entry["videoId"]] = entry.get("places", [])

    out_videos = []
    n_conf = n_reused = n_new = n_geo_new = n_removed = n_notfound = 0
    for vid in sel_order:
        segs = transcripts.get(vid, {}).get("segments", [])
        leg_places = legacy.get(vid, [])
        agent_places = results.get(vid, [])
        if not agent_places and not leg_places:
            continue
        concept = legacy_concept.get(vid, "")
        # concept from legacy video if present else from title
        # (legacy video concept stored separately)
        locs = []
        for ap in agent_places:
            status = ap.get("status", "new")
            name = ap.get("name", "").strip()
            quote = ap.get("quote", "")
            ts = ts_for_quote(segs, quote)
            if status == "removed":
                n_removed += 1
                continue
            lp = match_legacy(name, leg_places) if status == "confirmed" else None
            if lp:
                entry = {
                    "name": lp.get("name", name),
                    "address": lp.get("address", ""),
                    "latitude": lp.get("latitude"),
                    "longitude": lp.get("longitude"),
                    "googleMapsId": lp.get("googleMapsId"),
                    "googleMapsUri": lp.get("googleMapsUri"),
                    "source": "transcript_mention",
                    "description": ap.get("context") or lp.get("description") or "",
                }
                n_reused += 1; n_conf += 1
            else:
                # geocode fresh
                area = ap.get("areaHint", "")
                res, err = search(key, f"{name} {area}".strip())
                entry = {
                    "name": name,
                    "source": "transcript_mention",
                    "description": ap.get("context", ""),
                }
                if err or not (res or {}).get("googleMapsId"):
                    entry["geocodeWarning"] = f"geocode failed: {err or 'no id'}"
                    n_notfound += 1
                else:
                    entry.update(address=res["address"], latitude=res["latitude"],
                                 longitude=res["longitude"], googleMapsId=res["googleMapsId"],
                                 googleMapsUri=res["googleMapsUri"])
                    n_geo_new += 1; n_new += 1
                time.sleep(0.3)
            if ts is not None:
                entry["timestamp"] = ts
                entry["videoUrlWithTimestamp"] = f"https://www.youtube.com/watch?v={vid}&t={int(ts)}"
            locs.append(entry)
        if locs:
            out_videos.append({"videoId": vid, "title": titles.get(vid, ""), "concept": concept, "locations": locs})

    json.dump({"videos": out_videos}, open(ws / "locations.json", "w"), ensure_ascii=False, indent=2)
    print(f"{ws_id}: {len(out_videos)} videos, reused {n_reused} legacy geocodes, geocoded {n_geo_new} new, "
          f"{n_notfound} geocode-failed, {n_removed} removed -> locations.json")


if __name__ == "__main__":
    main()
