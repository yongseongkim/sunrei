"""Build locations.json for the 스트리트 푸드 파이터 playlists (Seasons 1 & 2).

The clips themselves carry no location info; this maps each clip's playlist
position to the city/region the show visited, pins it to that city's well-known
food market/district (verifiable, geocodable), and writes one spot per clip.
Same-city clips share one Place (same googleMapsId) so the public map aggregates
them into a single card per market.

Usage:
    uv run python .claude/scripts/youtube/build_streetfood.py <PLAYLIST_ID>
"""
import json
import re
import sys

from _common import WS_ROOT, load_google_api_key
from extract_desc_locations import search

# playlist_id -> [(start_pos, end_pos, city_label, market_query)]
SEASONS = {
    "PLgbB1gJhmG7DWksYdc3AKRjRuzc4TMd5c": [   # Season 1
        (0, 11, "중국 청두", "Kuanzhai Alley Chengdu"),
        (12, 20, "홍콩", "Temple Street Night Market Hong Kong"),
        (21, 29, "태국 방콕", "Yaowarat Road Bangkok"),
        (30, 40, "일본 도쿄", "Tsukiji Market Tokyo"),
        (41, 51, "미국 하와이", "KCC Farmers Market Honolulu"),
        (52, 62, "태국 푸껫", "Phuket Old Town"),
        (63, 73, "일본 후쿠오카", "Nakasu Yatai Fukuoka"),
        (74, 85, "중국 하얼빈", "Central Street Harbin"),
    ],
    "PLgbB1gJhmG7AbFF7O-kA2lQXYt1eRDFM2": [   # Season 2
        (0, 13, "터키 이스탄불", "Eminonu Istanbul"),
        (14, 26, "베트남 하노이", "Hanoi Old Quarter"),
        (27, 38, "미국 뉴욕", "Greenwich Village New York"),
        (39, 49, "중국 시안", "Muslim Quarter Xi'an"),
        (50, 63, "멕시코", "Centro Historico Mexico City"),
        (64, 74, "대만 타이베이", "Ningxia Night Market Taipei"),
        (75, 87, "이탈리아 시칠리아 팔레르모", "Ballaro Market Palermo"),
        (88, 100, "중국 우한", "Hubu Alley Wuhan"),
        (101, 113, "말레이시아 페낭", "New Lane Penang"),
        (114, 127, "중국 연변", "Yanji West Market Yanbian"),
        (128, 128, "미국 뉴욕", "Greenwich Village New York"),
        (129, 130, "멕시코", "Centro Historico Mexico City"),
        (131, 131, "베트남 하노이", "Hanoi Old Quarter"),
        (132, 132, "중국 연변", "Yanji West Market Yanbian"),
    ],
}


def clean_title(t):
    return re.sub(r"#\S+", "", t).strip(" -|·")


def main():
    if not sys.argv[1:]:
        print(__doc__)
        sys.exit(1)
    pid = sys.argv[1]
    spans = SEASONS.get(pid)
    if not spans:
        print(f"No city mapping for {pid}")
        sys.exit(1)
    key = load_google_api_key()
    ws = WS_ROOT / pid
    info = json.load(open(ws / "video_info.json"))
    clips = info["selectedVideos"]

    # geocode each unique market once
    geo = {}
    for s, e, city, q in spans:
        if q in geo:
            continue
        res, err = search(key, q)
        if err:
            print(f"  GEO FAIL '{q}': {err}")
            geo[q] = None
        else:
            geo[q] = res
            print(f"  geo '{q}' -> {res['displayName']} @ {res['latitude']:.4f},{res['longitude']:.4f}")

    videos = []
    for s, e, city, q in spans:
        res = geo.get(q)
        if not res:
            continue
        for pos in range(s, e + 1):
            if pos >= len(clips):
                break
            c = clips[pos]
            title = clean_title(c["title"])
            if not title:
                continue
            videos.append({
                "videoId": c["videoId"],
                "title": title[:128],
                "concept": city,
                "locations": [{
                    "name": res["displayName"],
                    "address": res["address"],
                    "latitude": res["latitude"],
                    "longitude": res["longitude"],
                    "googleMapsId": res["googleMapsId"],
                    "googleMapsUri": res["googleMapsUri"],
                    "description": f"스트리트 푸드 파이터 {city} 편. {title}",
                    "videoUrlWithTimestamp": f"https://www.youtube.com/watch?v={c['videoId']}",
                }],
            })
    out = ws / "locations.json"
    json.dump({"videos": videos}, open(out, "w"), ensure_ascii=False, indent=2)
    n = len(videos)
    print(f"\n{pid}: {n} clips -> spots across {len({s[3] for s in spans})} markets -> {out}")


if __name__ == "__main__":
    main()
