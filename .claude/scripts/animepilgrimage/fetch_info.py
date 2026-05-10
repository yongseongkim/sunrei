"""
Fetch anime info from animepilgrimage.com (cache-first).

Usage:
    # List mode: prints all anime as JSON to stdout
    uv run --with requests python .claude/scripts/animepilgrimage/fetch_info.py --list

    # Slug mode: fetches one anime's full data (incl. synopsis) and writes to --out
    uv run --with requests python .claude/scripts/animepilgrimage/fetch_info.py \\
        --slug shoshimin \\
        --out .claude/workspace/animepilgrimage/shoshimin/anime_info.json

Caches consulted in order:
    1. scripts/animepilgrimage-anime-list.json  (list mode)
    2. scripts/animepilgrimage-by-anime/{slug}.json  (slug mode — places + base anime)
    3. scripts/animepilgrimage-data.json  (slug mode — synopsis enrichment)
    4. https://api.animepilgrimage.com  (fallback)

A cache entry is considered stale if its mtime is older than --max-age-days (default 30).
"""

import argparse
import json
import sys
import time
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
LIST_FILE = REPO_ROOT / "scripts" / "animepilgrimage-anime-list.json"
BY_ANIME_DIR = REPO_ROOT / "scripts" / "animepilgrimage-by-anime"
MASTER_FILE = REPO_ROOT / "scripts" / "animepilgrimage-data.json"
API_BASE = "https://api.animepilgrimage.com"
DEFAULT_MAX_AGE_DAYS = 90


def is_fresh(path: Path, max_age_days: int) -> bool:
    if not path.is_file():
        return False
    age_seconds = time.time() - path.stat().st_mtime
    return age_seconds < max_age_days * 86400


def fetch_with_retry(url: str, *, max_retries: int = 3) -> dict:
    for attempt in range(max_retries):
        try:
            res = requests.get(url, timeout=30)
            if res.ok:
                return res.json()
            if res.status_code == 429 or res.status_code >= 500:
                delay = 2 ** (attempt + 1)
                print(f"  retry {attempt + 1}/{max_retries} for {url} (status {res.status_code}), waiting {delay}s", file=sys.stderr)
                time.sleep(delay)
                continue
            raise RuntimeError(f"HTTP {res.status_code} for {url}")
        except requests.RequestException as e:
            if attempt == max_retries - 1:
                raise
            delay = 2 ** (attempt + 1)
            print(f"  retry {attempt + 1}/{max_retries} for {url} ({e}), waiting {delay}s", file=sys.stderr)
            time.sleep(delay)
    raise RuntimeError(f"failed after {max_retries} retries: {url}")


def load_list(max_age_days: int) -> list[dict]:
    if is_fresh(LIST_FILE, max_age_days):
        return json.loads(LIST_FILE.read_text())

    print(f"List cache missing or stale; fetching from {API_BASE}/geo ...", file=sys.stderr)
    geo = fetch_with_retry(f"{API_BASE}/geo")
    anime_ids: list[str] = []
    seen: set[str] = set()
    for feature in geo.get("features", []):
        aid = feature.get("properties", {}).get("animeId")
        if aid and aid not in seen:
            seen.add(aid)
            anime_ids.append(aid)

    place_count_by_anime: dict[str, int] = {}
    for feature in geo.get("features", []):
        aid = feature.get("properties", {}).get("animeId")
        if aid:
            place_count_by_anime[aid] = place_count_by_anime.get(aid, 0) + 1

    entries: list[dict] = []
    for aid in anime_ids:
        detail = fetch_with_retry(f"{API_BASE}/anime/{aid}")
        anime = detail.get("anime", {})
        title = anime.get("title", {})
        entries.append({
            "slug": anime.get("animeSlug", ""),
            "ja": title.get("ja", ""),
            "kr": title.get("kr", ""),
            "en": title.get("en", ""),
            "places": place_count_by_anime.get(aid, 0),
        })

    LIST_FILE.parent.mkdir(parents=True, exist_ok=True)
    LIST_FILE.write_text(json.dumps(entries, ensure_ascii=False, indent=2))
    return entries


def find_anime_id(slug: str) -> str | None:
    by_file = BY_ANIME_DIR / f"{slug}.json"
    if by_file.is_file():
        data = json.loads(by_file.read_text())
        return data.get("anime", {}).get("animeId")

    if MASTER_FILE.is_file():
        master = json.loads(MASTER_FILE.read_text())
        for entry in master.get("anime", {}).values():
            if entry.get("anime", {}).get("animeSlug") == slug:
                return entry["anime"].get("animeId")
    return None


def load_master_entry(slug: str) -> dict | None:
    if not MASTER_FILE.is_file():
        return None
    master = json.loads(MASTER_FILE.read_text())
    for entry in master.get("anime", {}).values():
        if entry.get("anime", {}).get("animeSlug") == slug:
            return entry
    return None


def fetch_anime_full(anime_id: str, slug: str) -> dict:
    """Live fetch: anime detail + all places via /anime/{id} and /place/{id}."""
    detail = fetch_with_retry(f"{API_BASE}/anime/{anime_id}")
    geo = fetch_with_retry(f"{API_BASE}/geo")
    place_ids = [
        f["properties"]["placeId"]
        for f in geo.get("features", [])
        if f.get("properties", {}).get("animeId") == anime_id
    ]
    places: list[dict] = []
    for pid in place_ids:
        try:
            places.append(fetch_with_retry(f"{API_BASE}/place/{pid}"))
        except Exception as e:
            print(f"  failed to fetch place {pid}: {e}", file=sys.stderr)
    return {
        "anime": detail.get("anime", {}),
        "placeCount": len(places),
        "places": places,
    }


def load_slug(slug: str, max_age_days: int) -> dict:
    by_file = BY_ANIME_DIR / f"{slug}.json"
    base: dict | None = None
    if is_fresh(by_file, max_age_days):
        base = json.loads(by_file.read_text())
    else:
        anime_id = find_anime_id(slug)
        if not anime_id:
            list_entries = load_list(max_age_days)
            if not any(e.get("slug") == slug for e in list_entries):
                raise RuntimeError(f"unknown slug: {slug}")
            raise RuntimeError(f"could not resolve animeId for slug={slug}; run scrape-animepilgrimage.ts to refresh caches")
        print(f"By-anime cache missing or stale for {slug}; fetching from API ...", file=sys.stderr)
        base = fetch_anime_full(anime_id, slug)
        BY_ANIME_DIR.mkdir(parents=True, exist_ok=True)
        by_file.write_text(json.dumps(base, ensure_ascii=False, indent=2))

    anime = dict(base.get("anime", {}))
    if not anime.get("synopsis"):
        master_entry = load_master_entry(slug)
        if master_entry and master_entry.get("anime", {}).get("synopsis"):
            anime["synopsis"] = master_entry["anime"]["synopsis"]
        else:
            anime_id = anime.get("animeId") or find_anime_id(slug)
            if anime_id:
                print(f"Synopsis missing locally; fetching /anime/{anime_id} ...", file=sys.stderr)
                live = fetch_with_retry(f"{API_BASE}/anime/{anime_id}")
                anime = live.get("anime", anime)

    return {
        "anime": anime,
        "placeCount": base.get("placeCount", len(base.get("places", []))),
        "places": base.get("places", []),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="output the full anime list as JSON")
    parser.add_argument("--slug", help="anime slug (e.g. shoshimin)")
    parser.add_argument("--out", help="output file path (slug mode)")
    parser.add_argument("--max-age-days", type=int, default=DEFAULT_MAX_AGE_DAYS)
    args = parser.parse_args()

    if args.list:
        entries = load_list(args.max_age_days)
        print(json.dumps(entries, ensure_ascii=False, indent=2))
        return 0

    if not args.slug:
        parser.error("--slug is required when --list is not set")

    data = load_slug(args.slug, args.max_age_days)
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        print(f"wrote {out_path} ({data['placeCount']} places)", file=sys.stderr)
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
