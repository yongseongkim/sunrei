"""
Reverse-geocode places from anime_info.json into locations.json.

Usage:
    uv run --with requests python .claude/scripts/animepilgrimage/reverse_geocode.py \\
        --in .claude/workspace/animepilgrimage/{slug}/anime_info.json \\
        --out .claude/workspace/animepilgrimage/{slug}/locations.json

Reads anime_info.json (output of fetch_info.py) and produces locations.json with
formatted_address and googleMapsId for each place.

Cache: .claude/workspace/animepilgrimage/_geocode_cache.json keyed by "{lat:.6f},{lng:.6f}".
Reuse across slugs (e.g. Tokyo Station appearing in many anime) skips repeat API calls.

Requires GOOGLE_MAPS_API_KEY in .claude/.env.
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = REPO_ROOT / ".claude" / ".env"
CACHE_FILE = REPO_ROOT / ".claude" / "workspace" / "animepilgrimage" / "_geocode_cache.json"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

JP_PREF_KO = {
    "hokkaido": "홋카이도", "aomori": "아오모리현", "iwate": "이와테현", "miyagi": "미야기현",
    "akita": "아키타현", "yamagata": "야마가타현", "fukushima": "후쿠시마현", "ibaraki": "이바라키현",
    "tochigi": "도치기현", "gunma": "군마현", "saitama": "사이타마현", "chiba": "치바현",
    "tokyo": "도쿄도", "kanagawa": "가나가와현", "niigata": "니가타현", "toyama": "도야마현",
    "ishikawa": "이시카와현", "fukui": "후쿠이현", "yamanashi": "야마나시현", "nagano": "나가노현",
    "gifu": "기후현", "shizuoka": "시즈오카현", "aichi": "아이치현", "mie": "미에현",
    "shiga": "시가현", "kyoto": "교토부", "osaka": "오사카부", "hyogo": "효고현",
    "nara": "나라현", "wakayama": "와카야마현", "tottori": "돗토리현", "shimane": "시마네현",
    "okayama": "오카야마현", "hiroshima": "히로시마현", "yamaguchi": "야마구치현",
    "tokushima": "도쿠시마현", "kagawa": "카가와현", "ehime": "에히메현", "kochi": "고치현",
    "fukuoka": "후쿠오카현", "saga": "사가현", "nagasaki": "나가사키현", "kumamoto": "구마모토현",
    "oita": "오이타현", "miyazaki": "미야자키현", "kagoshima": "가고시마현", "okinawa": "오키나와현",
}


def load_dot_env():
    if not ENV_FILE.is_file():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, _, value = line.partition("=")
        if key and key not in os.environ:
            os.environ[key] = value


def load_cache() -> dict:
    if CACHE_FILE.is_file():
        return json.loads(CACHE_FILE.read_text())
    return {}


def save_cache(cache: dict):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2))


def synthesize_address(city_id: str | None) -> str:
    """Fallback address from cityId like 'JP-gifu-gifu' → '기후현 기후, 일본'."""
    if not city_id:
        return ""
    parts = city_id.split("-")
    if len(parts) < 2 or parts[0] != "JP":
        return city_id
    pref_ko = JP_PREF_KO.get(parts[1], parts[1].capitalize())
    rest = " ".join(p.capitalize() for p in parts[2:])
    return f"{pref_ko} {rest}, 일본".strip()


def reverse_geocode(lat: float, lng: float, api_key: str) -> tuple[str | None, str | None]:
    params = {
        "latlng": f"{lat},{lng}",
        "language": "ko",
        "key": api_key,
    }
    res = requests.get(GEOCODE_URL, params=params, timeout=15)
    res.raise_for_status()
    body = res.json()
    status = body.get("status")
    if status == "OK" and body.get("results"):
        first = body["results"][0]
        return first.get("formatted_address"), first.get("place_id")
    if status == "ZERO_RESULTS":
        return None, None
    if status in ("OVER_QUERY_LIMIT", "REQUEST_DENIED", "INVALID_REQUEST", "UNKNOWN_ERROR"):
        raise RuntimeError(f"geocode API error: {status} ({body.get('error_message', '')})")
    return None, None


def pick_name(name: dict, prefer: list[str]) -> str:
    for key in prefer:
        v = name.get(key)
        if v:
            return v
    return next((v for v in name.values() if v), "")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="in_path", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--language", default="ko")
    parser.add_argument("--rate-limit-ms", type=int, default=50, help="delay between API calls")
    args = parser.parse_args()

    load_dot_env()
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        print("Error: GOOGLE_MAPS_API_KEY not set. Add it to .claude/.env.", file=sys.stderr)
        return 1

    in_path = Path(args.in_path)
    out_path = Path(args.out)
    data = json.loads(in_path.read_text())

    cache = load_cache()
    cache_dirty = False
    cache_hits = 0
    api_calls = 0
    fallbacks = 0

    out_places: list[dict] = []
    for place in data.get("places", []):
        geo = place.get("geo", {})
        lat = geo.get("latitude")
        lng = geo.get("longitude")
        if lat is None or lng is None:
            continue

        cache_key = f"{lat:.6f},{lng:.6f}"
        address: str | None = None
        gmap_id: str | None = None

        if cache_key in cache:
            address = cache[cache_key].get("address")
            gmap_id = cache[cache_key].get("googleMapsId")
            cache_hits += 1
        else:
            try:
                address, gmap_id = reverse_geocode(lat, lng, api_key)
                api_calls += 1
                cache[cache_key] = {"address": address, "googleMapsId": gmap_id}
                cache_dirty = True
                if args.rate_limit_ms:
                    time.sleep(args.rate_limit_ms / 1000)
            except Exception as e:
                print(f"  geocode failed for ({lat}, {lng}): {e}", file=sys.stderr)

        if not address:
            address = synthesize_address(place.get("cityId"))
            fallbacks += 1

        name = place.get("name", {}) if isinstance(place.get("name"), dict) else {}
        out_places.append({
            "placeId": place.get("placeId") or place.get("id"),
            "name": pick_name(name, ["kr", "en", "ja"]),
            "nameKr": name.get("kr"),
            "nameEn": name.get("en"),
            "nameJa": name.get("ja"),
            "ep": place.get("ep"),
            "type": place.get("type"),
            "cityId": place.get("cityId"),
            "latitude": lat,
            "longitude": lng,
            "address": address,
            "googleMapsId": gmap_id,
            "streetViewUrl": place.get("streetViewUrl"),
        })

    if cache_dirty:
        save_cache(cache)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({
        "slug": data.get("anime", {}).get("animeSlug") or data.get("anime", {}).get("slug"),
        "places": out_places,
    }, ensure_ascii=False, indent=2))

    print(
        f"wrote {out_path} (places={len(out_places)}, cache_hits={cache_hits}, api_calls={api_calls}, cityId_fallbacks={fallbacks})",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
