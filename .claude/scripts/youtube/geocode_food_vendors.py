"""Geocode food-vendor research (from research subagents) into a playlist locations.json.

Input: a JSON file holding an array of vendor entries produced by a research
agent. Entries may use any of these field names (case-insensitive-ish):
  name_original / name / vendor_name      -> primary geocode term (local script)
  name_korean / name_ko                   -> Korean display name
  city / City                             -> city (also used as the grouping unit)
  district                                -> area context
  dish / dish_korean / dish_original      -> dish(es)
  address                                 -> address hint (NOT used as the query)
  source                                  -> source URL

The script:
  - groups entries by vendor (name_original, falling back to name_korean),
    merging their dishes into one description,
  - geocodes each distinct vendor with a name+area text search (never the bare
    address), and verifies the displayName loosely,
  - writes/merges into <playlist workspace>/locations.json grouped by city.

Usage:
    uv run python geocode_food_vendors.py <PLAYLIST_ID> <vendors.json> [--source-url-tag SFF2|SFF1]
"""
import json
import re
import sys
import time

from _common import load_google_api_key, workspace
from geocode import search, name_matches

KOREAN_PREFIX = {
    "Chengdu": "청두", "Harbin": "하얼빈",
    "Istanbul": "이스탄불", "Hanoi": "하노이", "New York": "뉴욕",
    "Xi'an": "시안", "Wuhan": "우한", "Mexico City": "멕시코시티",
    "Taipei": "타이베이", "Sicily": "시칠리아", "Penang": "페낭",
}


def field(e, *keys):
    for k in keys:
        if k in e and e[k]:
            return e[k]
    return ""


def first_source(e):
    s = field(e, "source", "sources", "sourceUrl")
    if isinstance(s, list):
        s = s[0] if s else ""
    return s or ""


def norm_key(s):
    return re.sub(r"\s+", "", (s or "")).lower()


def geocode_query(name, district, city):
    parts = [p for p in [name, district, city] if p]
    return " ".join(parts)


def load_vendors(path):
    data = json.load(open(path))
    # the agent may return {"city":..., "vendors":[...]} or a bare list
    if isinstance(data, dict) and "vendors" in data:
        data = data["vendors"]
    return data


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__); sys.exit(1)
    ws_id, vendors_file = args[0], args[1]
    ws = workspace(ws_id)
    key = load_google_api_key()
    entries = load_vendors(vendors_file)

    # group entries by vendor
    groups = {}
    order = []
    for e in entries:
        name = field(e, "name_original", "vendor_original", "vendor_name_original", "name", "vendor_name")
        name_ko = field(e, "name_korean", "vendor_korean", "vendor_name_ko", "name_ko")
        keyname = name or name_ko
        gk = norm_key(keyname)
        if not gk:
            continue
        if gk not in groups:
            groups[gk] = {"name": name, "name_ko": name_ko, "city": field(e, "city", "City"),
                          "district": field(e, "district"), "dishes": [], "sources": [], "note": ""}
            order.append(gk)
        g = groups[gk]
        dish = field(e, "dish_korean", "dish_ko", "dish", "dish_original")
        if dish and dish not in g["dishes"]:
            g["dishes"].append(dish)
        src = first_source(e)
        if src and src not in g["sources"]:
            g["sources"].append(src)
        if not g["city"]:
            g["city"] = field(e, "city", "City")
        if not g["note"]:
            g["note"] = field(e, "note", "notes")

    # geocode each vendor
    geocoded = {}
    ok = warn = 0
    for gk in order:
        g = groups[gk]
        q = geocode_query(g["name"], g["district"], g["city"])
        res, err = search(key, q)
        entry = {
            "name": g["name_ko"] or g["name"],
            "nameOriginal": g["name"],
            "city": g["city"],
            "dishes": g["dishes"],
            "source": "web_research",
            "sourceUrl": g["sources"][0] if g["sources"] else "",
            "description": (", ".join(g["dishes"]) + (" — " + g["note"] if g["note"] else ""))[:400],
        }
        if err or not res.get("googleMapsId"):
            entry["geocodeWarning"] = f"geocode failed: {err or 'no id'}"
            warn += 1
        else:
            entry.update(address=res["address"], latitude=res["latitude"], longitude=res["longitude"],
                         googleMapsId=res["googleMapsId"], googleMapsUri=res["googleMapsUri"])
            # loose name check across scripts (original names rarely match displayName verbatim)
            if not (name_matches(g["name"], res.get("displayName", "")) or name_matches(g["name_ko"], res.get("displayName", ""))):
                entry["geocodeWarning"] = f"displayName '{res.get('displayName')}' vs '{g['name'] or g['name_ko']}'"
                warn += 1
            else:
                ok += 1
        geocoded[gk] = entry
        time.sleep(0.3)

    # group by city -> locations.json
    locfile = ws / "locations.json"
    if locfile.is_file():
        out = json.load(open(locfile))
    else:
        out = {"videos": []}
    existing_cities = {v.get("videoId"): v for v in out["videos"]}

    for gk in order:
        e = geocoded[gk]
        city = e["city"] or "Unknown"
        vid = f"city:{city}"
        v = existing_cities.get(vid)
        if v is None:
            ko = KOREAN_PREFIX.get(city, city)
            v = {"videoId": vid, "title": f"{ko} ({city})", "concept": f"스트리트푸드파이터 — {ko} 편",
                 "locations": []}
            out["videos"].append(v); existing_cities[vid] = v
        if not any(l.get("googleMapsId") == e.get("googleMapsId") and e.get("googleMapsId") for l in v["locations"]):
            v["locations"].append(e)

    json.dump(out, open(locfile, "w"), ensure_ascii=False, indent=2)
    print(f"geocode_food_vendors: {ok} ok, {warn} flagged, {len(order)} vendors -> {locfile}")


if __name__ == "__main__":
    main()
