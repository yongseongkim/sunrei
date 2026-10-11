"""Country-aware geocode cleanup for re-derived playlists.

For a playlist whose videos are all in one country, find spots whose pin is
missing or landed outside that country (a common failure when geocoding a
foreign place by its Korean-transliterated name), and re-geocode with stronger
country/city context derived from the video concept.

Usage: uv run python cleanup_geocodes.py <ID> <country>
  country: japan | france | italy
"""
import json
import re
import sys
import time

from _common import load_google_api_key, workspace
from geocode import search

BOUNDS = {
    "japan": (30, 46, 128, 146),
    "france": (41, 51, -5, 10),
    "italy": (35, 47, 6, 19),
}
COUNTRY_TERM = {"japan": "Japan 日本", "france": "France", "italy": "Italy Italia"}


def in_bounds(lat, lng, b):
    if lat is None or lng is None:
        return False
    return b[0] <= lat <= b[1] and b[2] <= lng <= b[3]


def city_from_concept(concept):
    # concepts look like "일본 건축여행 - 東京都 広尾" / "비밀이야 in 프랑스 - 파리 8구"
    parts = re.split(r"[-–—]", concept or "")
    if len(parts) < 2:
        return ""
    return parts[-1].strip().replace("도", "도 ").strip()[:30]


def main():
    ws_id, country = sys.argv[1], sys.argv[2]
    if country not in BOUNDS:
        print("country must be japan|france|italy"); sys.exit(1)
    ws = workspace(ws_id)
    key = load_google_api_key()
    bounds = BOUNDS[country]
    data = json.load(open(ws / "locations.json"))
    fixed = unfixed = 0
    for v in data["videos"]:
        city = city_from_concept(v.get("concept", ""))
        for l in v["locations"]:
            needs = (not l.get("googleMapsId")) or (not in_bounds(l.get("latitude"), l.get("longitude"), bounds))
            if not needs:
                continue
            name = re.sub(r"\s*\(.*?\)\s*", " ", l.get("name", "")).strip()
            q = f"{name} {city} {COUNTRY_TERM[country]}".strip()
            res, err = search(key, q)
            if err or not (res or {}).get("googleMapsId") or not in_bounds(res["latitude"], res["longitude"], bounds):
                l["geocodeWarning"] = f"cleanup unable to pin in {country}: {err or res.get('displayName') if res else 'no result'}"
                unfixed += 1
            else:
                l.pop("geocodeWarning", None)
                l.update(address=res["address"], latitude=res["latitude"], longitude=res["longitude"],
                         googleMapsId=res["googleMapsId"], googleMapsUri=res["googleMapsUri"])
                fixed += 1
            time.sleep(0.3)
    json.dump(data, open(ws / "locations.json", "w"), ensure_ascii=False, indent=2)
    print(f"{ws_id}: cleanup fixed {fixed}, still unplaced {unfixed}")


if __name__ == "__main__":
    main()
