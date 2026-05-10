"""
Assemble a unified sunrei.json from anime_info.json + locations.json.

Usage:
    uv run python .claude/scripts/animepilgrimage/assemble_sunrei.py \\
        --slug shoshimin \\
        --workspace .claude/workspace/animepilgrimage

Reads:
    {workspace}/{slug}/anime_info.json   (output of fetch_info.py)
    {workspace}/{slug}/locations.json    (output of reverse_geocode.py)

Writes:
    {workspace}/{slug}/sunrei.json       (CreateSunreiRequest + _source block)

The output is consumed by .claude/scripts/sunrei/create.py (the shared Step 3 helper).
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

TITLE_MAX = 128

# Korean prefecture names matching reverse_geocode.py
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


def pick_localized(d, prefer):
    if not isinstance(d, dict):
        return ""
    for key in prefer:
        v = d.get(key)
        if isinstance(v, str) and v.strip():
            return v
    for v in d.values():
        if isinstance(v, str) and v.strip():
            return v
    return ""


def pick_localized_list(d, prefer):
    if not isinstance(d, dict):
        return []
    for key in prefer:
        v = d.get(key)
        if isinstance(v, list) and v:
            return [s for s in v if isinstance(s, str) and s.strip()]
    return []


def truncate(s, n):
    return s if len(s) <= n else s[: n - 1] + "…"


def derive_tag_candidates(anime, places):
    candidates: list[str] = ["애니메이션"]

    studios_kr = pick_localized_list(anime.get("studio"), ["kr", "en", "ja"])
    if studios_kr:
        candidates.append(studios_kr[0])

    pref_counts: Counter = Counter()
    for p in places:
        city_id = p.get("cityId") or ""
        parts = city_id.split("-")
        if len(parts) >= 2 and parts[0] == "JP":
            pref_counts[parts[1]] += 1
    if pref_counts:
        top_pref = pref_counts.most_common(1)[0][0]
        pref_ko = JP_PREF_KO.get(top_pref)
        if pref_ko:
            candidates.append(pref_ko)

    if len(candidates) < 3:
        candidates.append("성지순례")

    seen: set[str] = set()
    out: list[str] = []
    for c in candidates:
        key = c.lower()
        if key not in seen:
            seen.add(key)
            out.append(c)
        if len(out) >= 5:
            break
    return out


def build_sunrei_json(anime_info, locations):
    anime = anime_info.get("anime", {})
    title = pick_localized(anime.get("title"), ["kr", "en", "ja"])
    description = pick_localized(anime.get("synopsis"), ["kr", "en", "ja"])
    slug = anime.get("animeSlug") or anime.get("slug") or locations.get("slug") or ""

    spots: list[dict] = []
    spot_metadata: list[dict] = []
    for place in locations.get("places", []):
        spot_title = place.get("name") or pick_localized(
            {"kr": place.get("nameKr"), "en": place.get("nameEn"), "ja": place.get("nameJa")},
            ["kr", "en", "ja"],
        )
        if not spot_title:
            continue

        ep = place.get("ep")
        ep_type = place.get("type")
        if ep and ep_type == "EP":
            spot_desc = f"{title} EP{ep} 등장 장소" if title else f"EP{ep} 등장 장소"
        else:
            spot_desc = f"{title} 등장 장소" if title else ""

        place_obj = {
            "name": spot_title,
            "address": place.get("address") or "",
            "latitude": place.get("latitude"),
            "longitude": place.get("longitude"),
        }
        if place.get("googleMapsId"):
            place_obj["googleMapsId"] = place["googleMapsId"]

        spots.append({
            "title": truncate(spot_title, TITLE_MAX),
            "description": spot_desc,
            "youtubeLink": None,
            "place": place_obj,
            "images": [],
        })
        spot_metadata.append({
            "placeId": place.get("placeId"),
            "name": spot_title,
            "ep": ep,
        })

    return {
        "title": truncate(title, TITLE_MAX),
        "description": description,
        "link": None,
        "tagIds": [],
        "spots": spots,
        "images": [],
        "_source": {
            "type": "animepilgrimage",
            "tagCandidates": derive_tag_candidates(anime, locations.get("places", [])),
            "registryKey": "animepilgrimage.json",
            "registryInit": {"source": "animepilgrimage"},
            "summary": {"slug": slug, "title": truncate(title, TITLE_MAX)},
            "spotMetadata": spot_metadata,
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    parser.add_argument("--workspace", default=".claude/workspace/animepilgrimage")
    args = parser.parse_args()

    workspace = Path(args.workspace) / args.slug
    anime_info_path = workspace / "anime_info.json"
    locations_path = workspace / "locations.json"
    sunrei_path = workspace / "sunrei.json"

    if not anime_info_path.is_file():
        print(f"Error: missing {anime_info_path}", file=sys.stderr)
        return 1
    if not locations_path.is_file():
        print(f"Error: missing {locations_path}", file=sys.stderr)
        return 1

    anime_info = json.loads(anime_info_path.read_text())
    locations = json.loads(locations_path.read_text())

    sunrei = build_sunrei_json(anime_info, locations)
    sunrei_path.write_text(json.dumps(sunrei, ensure_ascii=False, indent=2))
    print(
        f"wrote {sunrei_path} (title={sunrei['title']!r}, spots={len(sunrei['spots'])}, tagCandidates={sunrei['_source']['tagCandidates']})",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
