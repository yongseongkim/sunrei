"""Extract locations from a YouTube playlist by parsing video descriptions.

For channels whose descriptions carry structured "가게 정보 / [name] / 주소:" blocks
(e.g. 비밀이야), this pulls restaurant name + address straight from the description
— no transcripts needed — geocodes each via Places Text Search (name + address), and
writes locations.json in the schema create_sunrei.py expects.

Usage:
    uv run python .claude/scripts/youtube/extract_desc_locations.py <PLAYLIST_ID|URL>

Writes .claude/workspace/youtube/{ID}/locations.json. Re-runnable: skips locations
already carrying coords (incremental). Prints progress per video.
"""
import json
import re
import sys
import time

from _common import WS_ROOT, http_json, load_google_api_key

API = "https://www.googleapis.com/youtube/v3"
PLACES = "https://places.googleapis.com/v1/places:searchText"
FIELDS = ("places.displayName,places.formattedAddress,places.location,"
          "places.id,places.googleMapsUri")

BRACKET = re.compile(r"^\s*【?\[([^\[\]]+?)\]】?\s*$")
ADDR = re.compile(r"주소\s*[:：]\s*(.+)")
# A Korean road address reliably has a road suffix (로/길/대로/번길) next to a digit.
ADDR_PAT = re.compile(r"특별자치도|특별자치시|특별시|광역시|(?:로|길|대로|번길|가길)\s*\d")
TS = re.compile(r"^\s*\d{1,2}:\d{2}")
TITLE_SEP = re.compile(r"[|｜ㅣ│]")
NAME_FORBID = re.compile(r"주소|번호|전화|팩스|영업|휴무|가게|정보|메뉴|가격|먹자|마시자|놀러|다니자|방랑기|"
                         r":|~|\d{1,2}:\d{2}|\d{3,}")


def is_addr_line(s):
    """A bare Korean address line: a road-suffix+number, not a timestamp."""
    s = s.strip()
    if not s or TS.match(s) or len(s) < 8:
        return False
    return bool(ADDR_PAT.search(s))


def is_name_line(s):
    """A dash/bullet restaurant-name line within 가게 정보 (not an address/hours/phone)."""
    s2 = s.lstrip("-*• ").strip()
    if not (2 <= len(s2) <= 25):
        return False
    if "#" in s2:                       # hashtag line ("#비밀이야 #맃집 ..."), not a venue
        return False
    if len(re.findall(r"[가-힣]", s2)) < 2:
        return False
    return not NAME_FORBID.search(s2)
BOILER = ("먹자", "가게 정보", "가게정보", "비즈니스 문의", "본 영상은",
          "업로드 시간", "인스타그램", "네이버 블로그", "워크숍", "워크샵")


def get_videos(key, ids):
    """Batch-fetch snippet (title+description) for up to 50 video ids."""
    out = {}
    for i in range(0, len(ids), 50):
        batch = ",".join(ids[i:i + 50])
        st, body = http_json("GET", f"{API}/videos?id={batch}&part=snippet&key={key}")
        if st != 200:
            print(f"  videos API {st}: {str(body)[:200]}")
            continue
        for it in body.get("items", []):
            out[it["id"]] = it["snippet"]
    return out


def parse_pairs(desc):
    """Yield (name, address) from a description's 가게 정보 section.

    Handles three description formats the channel uses:
      A) [name] bracket + a following 주소:/address line  (multi-venue videos)
      B) no name line, only a 주소: line                   (name comes from title)
      C) a '- name' bullet line + a following 주소: line   (dash list, no brackets)
    The current venue name is whichever of these most recently preceded an address.
    """
    lines = desc.splitlines()
    start = 0
    for i, ln in enumerate(lines):
        if "가게 정보" in ln or "가게정보" in ln:
            start = i + 1
            break
    pairs, cur_name = [], None
    for ln in lines[start:]:
        s = ln.strip()
        mb = BRACKET.match(s)
        if mb:
            cur_name = mb.group(1).strip()
            continue
        ma = ADDR.search(s)
        if ma:
            addr = ma.group(1).strip().strip("*-—• ")
            if addr:
                pairs.append((cur_name, addr))   # cur_name may be None -> address-only geocode
            continue
        if is_addr_line(s):                       # bare address line (no '주소:' label)
            pairs.append((cur_name, s.strip("*-—• ")))
            continue
        if is_name_line(s):
            cur_name = s.lstrip("-*• ").strip()
    return pairs


def title_fallback_name(title):
    """Last |-separated token of the title, cleaned (for bracket-less descs)."""
    parts = TITLE_SEP.split(title)
    name = parts[-1].strip()
    name = re.sub(r"\[.*?\]|\(.*?\)|#[\w]+", "", name).strip(" ·-—ㅣ")
    return name if 1 < len(name) <= 30 else None


def intro_context(desc, name, addr):
    """First meaningful prose line(s) from the description; fallback if none."""
    for ln in desc.splitlines():
        s = ln.strip()
        if len(s) < 8 or s.startswith("#") or s.startswith("*") or s.startswith("-"):
            continue
        if any(b in s for b in BOILER):
            continue
        if BRACKET.match(s) or ADDR.search(s) or is_addr_line(s):
            continue
        if TS.match(s):  # chapter timestamp
            continue
        if len(re.findall(r"[가-힣]", s)) < 4:  # phone/number/emoji-only lines
            continue
        return s[:300]
    region = addr.split()[0] if addr else ""
    return f"{name} — 비밀이야 in 한국 영상에서 소개한 {region} 맛집."


def search(key, query):
    st, body = http_json("POST", PLACES,
                         headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS},
                         body={"textQuery": query, "languageCode": "ko"})
    if st != 200:
        return None, f"HTTP {st}: {str(body)[:160]}"
    places = (body or {}).get("places") or []
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


def norm(s):
    return re.sub(r"[\s\-·]", "", (s or "").lower())


def main():
    if not sys.argv[1:]:
        print(__doc__)
        sys.exit(1)
    key = load_google_api_key()
    if not key:
        print("No Google API key in application-local.conf.")
        sys.exit(1)
    pid = sys.argv[1]
    if "list=" in pid:
        pid = re.search(r"list=([\w-]+)", pid).group(1)
    ws = WS_ROOT / pid
    info = json.load(open(ws / "video_info.json"))
    vids = [v for v in info["selectedVideos"]
            if not re.search(r"(?i)#?shorts", v.get("title", ""))]
    print(f"{len(vids)} long-form videos (shorts filtered)")

    # load existing locations.json to allow incremental resume
    locfile = ws / "locations.json"
    data = json.load(open(locfile)) if locfile.is_file() else {"videos": []}
    by_vid = {v["videoId"]: v for v in data.get("videos", [])}

    all_ids = [v["videoId"] for v in vids]
    snippets = get_videos(key, all_ids)
    print(f"fetched {len(snippets)}/{len(all_ids)} descriptions")

    total_geo = total_skip = total_flag = 0
    for v in vids:
        vid = v["videoId"]
        sn = snippets.get(vid)
        if not sn:
            continue
        desc = sn.get("description", "")
        pairs = parse_pairs(desc)
        fb = title_fallback_name(v.get("title", ""))
        if not pairs and fb:                       # nothing parsed; last-ditch title guess
            am = ADDR.search(desc)
            if am:
                pairs = [(fb, am.group(1).strip().strip("*-—• "))]
        if not pairs:
            continue
        pairs = [(n, a) for n, a in pairs if a]    # keep None names -> geocode by address
        entry = by_vid.get(vid) or {
            "videoId": vid, "title": v["title"], "concept": "",
            "locations": [],
        }
        entry["title"] = v["title"]
        # index existing geocoded names to skip rework
        done = {l["name"] for l in entry["locations"]
                if l.get("latitude") and l.get("googleMapsId")}
        intro = None
        for name, addr in pairs:
            name = (name or "").strip()
            if name and name in done:
                continue
            if intro is None:
                intro = intro_context(desc, name, addr)
            res, err = search(key, f"{name} {addr}".strip())
            total_geo += 1
            loc = {"name": name, "address": addr, "description": intro,
                   "videoUrlWithTimestamp": f"https://www.youtube.com/watch?v={vid}"}
            if err:
                loc["geocodeWarning"] = f"geocode failed: {err}"
                total_flag += 1
                time.sleep(0.05)
                continue
            loc.update(address=res["address"], latitude=res["latitude"],
                       longitude=res["longitude"], googleMapsId=res["googleMapsId"],
                       googleMapsUri=res["googleMapsUri"])
            if not name:                            # address-only geocode -> take the name back
                loc["name"] = res.get("displayName") or ""
                if not loc["name"]:
                    loc["geocodeWarning"] = "no displayName for address-only geocode"
                    total_flag += 1
            elif not (norm(name) in norm(res["displayName"])
                      or norm(res["displayName"]) in norm(name)):
                loc["geocodeWarning"] = (f"displayName '{res['displayName']}' "
                                         f"!= '{name}'; verify")
                total_flag += 1
            entry["locations"].append(loc)
            done.add(loc["name"])
            time.sleep(0.05)
        if entry["locations"]:
            region = entry["locations"][0]["address"].split()[0] if entry["locations"][0].get("address") else ""
            entry["concept"] = region
            by_vid[vid] = entry
            n_ok = sum(1 for l in entry["locations"] if l.get("latitude"))
            print(f"  {vid}  {v['title'][:34]:36s}  {n_ok}/{len(entry['locations'])} geocoded")

    data["videos"] = list(by_vid.values())
    json.dump(data, open(locfile, "w"), ensure_ascii=False, indent=2)
    n_spots = sum(len(v.get("locations", [])) for v in data["videos"])
    n_ok = sum(1 for v in data["videos"] for l in v.get("locations", [])
               if l.get("latitude") and l.get("googleMapsId"))
    print(f"\nvideos with spots: {len(data['videos'])}  spots: {n_spots}  "
          f"geocoded: {n_ok}  flagged: {total_flag}  -> {locfile}")


if __name__ == "__main__":
    main()
