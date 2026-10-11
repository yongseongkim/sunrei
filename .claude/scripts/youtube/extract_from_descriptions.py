"""Description-first location extractor for food/travel YouTube playlists.

Many channels (e.g. @saturdaytokyo) put a Google Maps link and a timestamped
chapter for every visited place inside each video description. That lets us
extract and geocode locations without touching the caption API (which is
IP-rate-limited). This tool:

  1. fetch   — pull `snippet` (title+description) for every selected video via
               the YouTube Data API (cheap; 50 ids per call) → descriptions.json
  2. parse   — read chapters (timestamp + place name) and Google Maps links from
               each description; resolve each short link (HTTP redirect) to a
               full Maps URL and pull the place name + precise coords + feature
               id → staging.json
  3. geocode — for every place, run a location-biased Places API text search to
               fill the canonical Place ID + formatted address, verifying against
               the link coords; emit locations.json

Usage:
    uv run python extract_from_descriptions.py <ID> fetch
    uv run python extract_from_descriptions.py <ID> parse
    uv run python extract_from_descriptions.py <ID> geocode
    uv run python extract_from_descriptions.py <ID> all

<ID> is the folder under .claude/workspace/youtube/. Stages cache their output so
re-runs are cheap and the workflow can resume at any stage.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request

from _common import WS_ROOT, http_json, load_google_api_key, workspace
from geocode import name_matches

API = "https://www.googleapis.com/youtube/v3"
PLACES = "https://places.googleapis.com/v1/places:searchText"
UA = "sunrei-ingest/1.0"
FIELDS = "places.displayName,places.formattedAddress,places.location,places.id,places.googleMapsUri"

MAP_LINK_RE = re.compile(
    r"https?://(?:maps\.google\.com|goo\.gl/maps|maps\.app\.goo\.gl|g\.page)/\S+"
)
CHAPTER_RE = re.compile(r"^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$")
EMOJO_LEAD_RE = re.compile(r"^[\s\W_]+", re.UNICODE)  # strip leading emoji/symbol noise crudely


def load_selected(ws):
    info = json.load(open(ws / "video_info.json"))
    return info.get("selectedVideos", []), info


def ts_to_sec(ts):
    parts = [int(p) for p in ts.split(":")]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return parts[0] * 60 + parts[1]


def clean_name(raw):
    # drop trailing url-ish / map-link fragments and stray punctuation/emoji
    s = MAP_LINK_RE.sub("", raw)
    s = re.sub(r"http\S*", "", s)
    s = s.strip(" \t-–—•|·:*#")
    s = re.sub(r"\s+", " ", s)
    return s


# --------------------------------------------------------------------------- fetch
def stage_fetch(key, ws):
    vids, _ = load_selected(ws)
    desc_file = ws / "descriptions.json"
    if desc_file.is_file():
        cached = json.load(open(desc_file))
    else:
        cached = {}
    ids = [v["videoId"] for v in vids if v["videoId"] not in cached]
    fetched = 0
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        url = f"{API}/videos?part=snippet&id=" + ",".join(chunk) + "&key=" + key
        st, body = http_json("GET", url)
        if st != 200:
            print("videos API", st, str(body)[:200]); sys.exit(1)
        found = {it["id"]: it["snippet"] for it in body.get("items", [])}
        for vid in chunk:
            sn = found.get(vid)
            cached[vid] = {
                "videoId": vid,
                "title": (sn or {}).get("title", ""),
                "description": (sn or {}).get("description", ""),
            } if sn else {"videoId": vid, "title": "", "description": "", "missing": True}
            fetched += 1
        json.dump(cached, open(desc_file, "w"), ensure_ascii=False, indent=2)
    print(f"fetch: {fetched} new, {len(cached)} total -> {desc_file}")
    return cached


# --------------------------------------------------------------------------- parse
def resolve_link(link, cache):
    """Resolve a short Maps URL to {name,lat,lng,featureId,resolvedUrl} or None."""
    if link in cache:
        return cache[link]
    res = None
    try:
        req = urllib.request.Request(link, headers={"User-Agent": UA}, method="HEAD")
        with urllib.request.urlopen(req, timeout=20) as r:
            final = r.url
        res = parse_resolved_url(final)
    except Exception:
        try:
            # some links need a GET to resolve
            req = urllib.request.Request(link, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                final = r.url
            res = parse_resolved_url(final)
        except Exception as e:
            res = {"error": str(e)}
    cache[link] = res
    time.sleep(0.25)  # be gentle on goo.gl resolution
    return res


def parse_resolved_url(url):
    dec = urllib.parse.unquote(url)
    out = {"resolvedUrl": url}
    # place name in path: /maps/place/<name>/@
    m = re.search(r"/maps/place/([^/]+)/@", dec)
    if m:
        out["name"] = m.group(1).replace("+", " ").strip()
    # precise coords from !8m2!3d<lat>!4d<lng>
    m = re.search(r"!8m2!3d(-?[\d.]+)!4d(-?[\d.]+)", dec)
    if m:
        out["latitude"] = float(m.group(1))
        out["longitude"] = float(m.group(2))
    else:
        m = re.search(r"@(-?[\d.]+),(-?[\d.]+),", dec)
        if m:
            out["latitude"] = float(m.group(1))
            out["longitude"] = float(m.group(2))
    # feature id 0x..:0x..
    m = re.search(r"0x[0-9a-f]+:0x[0-9a-f]+", dec)
    if m:
        out["featureId"] = m.group(0)
    return out


# ---- structured description blocks (e.g. 비밀이야's "* 가게 정보" sections) ----
ADDR_RE = re.compile(r"^\s*[-*]?\s*(주소|地址|住所|address|addr)\s*[:：]\s*(.+)$", re.IGNORECASE)
NAMEKEY_RE = re.compile(r"^\s*[-*]?\s*(상호|이름|가게명|식당명|name)\s*[:：]\s*(.+)$", re.IGNORECASE)
PHONE_RE = re.compile(r"^\s*[-*]?\s*(전화|연락처|phone|tel)\s*[:：]", re.IGNORECASE)
DASHLINE_RE = re.compile(r"^\s*[-*•]\s*(.+)$")
BLOCK_NOISE_RE = re.compile(r"광고|협찬|업로드|문의|영업|휴무|시간|전화|연락|링크|주소|http|www|naver|블로그", re.IGNORECASE)


def parse_blocks(desc):
    """Extract structured venue blocks. Each `주소:` line is paired with the
    nearest preceding plausible venue name (a dash line or 상호/이름 value)."""
    if not desc:
        return []
    blocks, pending = [], ""
    for ln in desc.splitlines():
        s = ln.strip()
        if not s:
            continue
        am = ADDR_RE.match(s)
        if am:
            addr = am.group(2).strip().rstrip(".,;")
            if pending and addr:
                blocks.append({"name": pending, "address": addr})
            pending = ""
            continue
        nm = NAMEKEY_RE.match(s)
        if nm:
            pending = nm.group(2).strip()
            continue
        dm = DASHLINE_RE.match(s)
        if dm and not PHONE_RE.match(s):
            cand = dm.group(1).strip()
            if cand and not BLOCK_NOISE_RE.search(cand) and len(cand) <= 80:
                pending = cand
    return blocks


def area_from_address(addr):
    parts = [p.strip() for p in (addr or "").split(",") if p.strip()]
    return " ".join(parts[-2:]) if len(parts) >= 2 else (parts[-1] if parts else "")


def stage_parse(ws):
    vids, info = load_selected(ws)
    descs = json.load(open(ws / "descriptions.json"))
    link_cache_file = ws / "resolved_links.json"
    link_cache = json.load(open(link_cache_file)) if link_cache_file.is_file() else {}

    videos = []
    n_links = n_resolved = n_with_coords = n_blocks = 0
    for v in vids:
        vid = v["videoId"]
        d = descs.get(vid, {})
        desc = d.get("description", "")
        title = d.get("title") or v.get("title", "")
        # chapters
        chapters = []
        for line in desc.splitlines():
            cm = CHAPTER_RE.match(line)
            if cm:
                name = clean_name(cm.group(2))
                if name and len(name) <= 60:
                    chapters.append({"timestamp": cm.group(1), "sec": ts_to_sec(cm.group(1)), "name": name})
        # map links (dedup, preserve order)
        links = []
        seen = set()
        for lk in MAP_LINK_RE.findall(desc):
            lk = lk.rstrip(".,;)]}>)\"'")
            if lk not in seen:
                seen.add(lk)
                links.append(lk)
        # resolve links
        resolved = []
        for lk in links:
            r = resolve_link(lk, link_cache)
            resolved.append({"link": lk, **(r or {})})
            n_links += 1
            if r and r.get("latitude") is not None:
                n_resolved += 1
                n_with_coords += 1
        json.dump(link_cache, open(link_cache_file, "w"), ensure_ascii=False, indent=2)
        blocks = parse_blocks(desc)
        n_blocks += len(blocks)
        videos.append({
            "videoId": vid,
            "title": title,
            "url": v.get("url") or f"https://www.youtube.com/watch?v={vid}",
            "chapters": chapters,
            "mapLinks": links,
            "resolved": resolved,
            "blocks": blocks,
        })
    out = {"playlistId": info.get("id"), "videos": videos}
    json.dump(out, open(ws / "staging.json", "w"), ensure_ascii=False, indent=2)
    print(f"parse: {len(videos)} videos, {n_links} links, {n_with_coords} with coords, {n_blocks} blocks -> staging.json")
    return out


# --------------------------------------------------------------------------- geocode
def text_search(key, name, lat=None, lng=None):
    body = {"textQuery": name, "languageCode": "ko"}
    if lat is not None and lng is not None:
        body["locationBias"] = {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 200}}
    st, resp = http_json("POST", PLACES,
                         headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS}, body=body)
    if st != 200:
        return None, f"HTTP {st}: {str(resp)[:160]}"
    places = (resp or {}).get("places") or []
    if not places:
        return None, "no result"
    p = places[0]
    loc = p.get("location", {})
    return {
        "displayName": p.get("displayName", {}).get("text"),
        "address": p.get("formattedAddress"),
        "latitude": loc.get("latitude"),
        "longitude": loc.get("longitude"),
        "googleMapsId": p.get("id"),
        "googleMapsUri": p.get("googleMapsUri"),
    }, None


def close(a, b, tol=0.002):
    try:
        return abs(float(a) - float(b)) < tol
    except Exception:
        return False


def stage_geocode(key, ws):
    staging = json.load(open(ws / "staging.json"))
    locs_file = ws / "locations.json"
    existing = {v["videoId"]: v for v in (json.load(open(locs_file))["videos"] if locs_file.is_file() else {"videos": []}).get("videos", [])}
    out_videos = []
    done = flagged = 0
    for v in staging["videos"]:
        vid = v["videoId"]
        # only (re)geocode videos not already finalized
        if vid in existing:
            out_videos.append(existing[vid]); continue
        places = []
        for r in v["resolved"]:
            if r.get("latitude") is None:
                continue
            name = r.get("name") or ""
            res, err = text_search(key, name or "음식점", r["latitude"], r["longitude"])
            entry = {
                "name": name or (res or {}).get("displayName", ""),
                "source": "description_link",
                "googleMapsUri": r.get("resolvedUrl"),
            }
            if err:
                # fall back to the link coords directly
                entry.update(latitude=r["latitude"], longitude=r["longitude"],
                             address="", geocodeWarning=f"text search: {err}")
                flagged += 1
            else:
                entry.update(address=res["address"], latitude=res["latitude"], longitude=res["longitude"],
                             googleMapsId=res["googleMapsId"], googleMapsUri=res.get("googleMapsUri") or entry["googleMapsUri"])
                done += 1
                # verify against creator pin
                if not (close(entry["latitude"], r["latitude"]) and close(entry["longitude"], r["longitude"])):
                    entry["geocodeWarning"] = f"coords differ from link pin ({r['latitude']:.5f},{r['longitude']:.5f})"
                    flagged += 1
            places.append(entry)
        # structured description blocks (name + address, no creator pin)
        have_ids = {p.get("googleMapsId") for p in places if p.get("googleMapsId")}
        for b in v.get("blocks", []):
            bname = (b.get("name") or "").strip()
            if not bname:
                continue
            res, err = text_search(key, f"{bname} {area_from_address(b.get('address', ''))}".strip())
            bentry = {"name": bname, "source": "description_block", "address": b.get("address", "")}
            if err or not (res or {}).get("googleMapsId"):
                bentry["geocodeWarning"] = f"block geocode failed: {err or 'no id'}"
                flagged += 1
            else:
                if res["googleMapsId"] in have_ids:
                    continue  # same place already captured via a map link
                bentry.update(address=res.get("address") or bentry["address"],
                              latitude=res["latitude"], longitude=res["longitude"],
                              googleMapsId=res["googleMapsId"], googleMapsUri=res["googleMapsUri"])
                done += 1
                have_ids.add(res["googleMapsId"])
                if not name_matches(bname, res.get("displayName", "")):
                    bentry["geocodeWarning"] = f"displayName '{res.get('displayName')}' vs '{bname}'"
                    flagged += 1
            places.append(bentry)
            time.sleep(0.3)
        out_videos.append({
            "videoId": vid, "title": v["title"], "concept": "",
            "locations": places,
        })
        time.sleep(0.3)  # gentle on Places API
    json.dump({"videos": out_videos}, open(locs_file, "w"), ensure_ascii=False, indent=2)
    print(f"geocode: {done} resolved, {flagged} flagged -> {locs_file}")


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(1)
    ws_id, stage = args[0], (args[1] if len(args) > 1 else "all")
    ws = workspace(ws_id)
    key = load_google_api_key()
    if not key:
        print("No Google API key."); sys.exit(1)
    if stage in ("fetch", "all"):
        stage_fetch(key, ws)
    if stage in ("parse", "all"):
        stage_parse(ws)
    if stage in ("geocode", "all"):
        stage_geocode(key, ws)


if __name__ == "__main__":
    main()
