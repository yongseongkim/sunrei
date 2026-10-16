"""Read Instagram location tags from the logged-out post pages (headless Chrome).

The Graph API has no location field, but the logged-out post page embeds the
media object with ``location {pk, name, lat, lng}``. Results are saved after
every post, so a rerun resumes and skips posts already in OUT_JSON.

A page without the media object is a miss. After five misses in a row the
reader reloads a post that loaded before: if it still loads, the misses were
posts hidden from logged-out visitors (age-restricted) and are recorded with
"miss": true; if it does not, Instagram is showing a login wall and the reader
stops with exit code 3.

Usage:
    uv run --with playwright python .claude/scripts/instagram/location_tags.py OUT_JSON CODE_OR_FILE... [--delay 4]

CODE_OR_FILE is a shortcode, a post URL, or a text file with one per line.
"""

import argparse
import json
import random
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from graph_api import shortcode_of

SCRIPT_JSON = re.compile(r'<script type="application/json"[^>]*>(.*?)</script>', re.S)
MISS_LIMIT = 5


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("out_json", type=Path)
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--delay", type=float, default=4.0)
    return parser.parse_args()


def shortcodes(inputs):
    codes = []
    for value in inputs:
        path = Path(value)
        for line in (path.read_text().splitlines() if path.is_file() else [value]):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            code = shortcode_of(line) or line
            if code not in codes:
                codes.append(code)
    return codes


def find_media(value, shortcode):
    if isinstance(value, dict):
        if value.get("code") == shortcode and "taken_at" in value:
            return value
        for child in value.values():
            found = find_media(child, shortcode)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_media(child, shortcode)
            if found:
                return found
    return None


def media_from_html(html, shortcode):
    for blob in SCRIPT_JSON.findall(html):
        if shortcode not in blob or '"taken_at"' not in blob:
            continue
        try:
            media = find_media(json.loads(blob), shortcode)
        except json.JSONDecodeError:
            continue
        if media:
            return media
    return None


def summarize(media):
    location = media.get("location") or None
    return {
        "location": {
            "pk": str(location.get("pk")),
            "name": location.get("name"),
            "lat": location.get("lat"),
            "lng": location.get("lng"),
        } if location else None,
        "owner": (media.get("user") or {}).get("username"),
        "coauthors": [author.get("username") for author in media.get("coauthor_producers") or []],
        "productType": media.get("product_type"),
    }


def load(page, code):
    try:
        page.goto(f"https://www.instagram.com/p/{code}/", wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(1500)
        return media_from_html(page.content(), code)
    except Exception as error:  # noqa: BLE001
        print(f"  {code}: {error}", flush=True)
        return None


def save(path, results):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def main():
    args = parse_args()
    out_path = args.out_json
    results = json.loads(out_path.read_text()) if out_path.is_file() else {}
    pending = [code for code in shortcodes(args.inputs) if code not in results]
    print(f"{len(pending)} posts to read ({len(results)} cached)", flush=True)
    probe = next((code for code, value in results.items() if not value.get("miss")), None)
    misses, missed, login_wall = 0, [], False

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome")
        page = browser.new_page(locale="ko-KR")
        for index, code in enumerate(pending, 1):
            media = load(page, code)
            if media:
                results[code] = summarize(media)
                misses, missed, probe = 0, [], code
                tag = results[code]["location"]
                print(f"[{index}/{len(pending)}] {code} {tag['name'] if tag else '-'}", flush=True)
            else:
                misses += 1
                missed.append(code)
                print(f"[{index}/{len(pending)}] {code} no media object (miss {misses})", flush=True)
                if misses >= MISS_LIMIT:
                    if not probe or not load(page, probe):
                        print(f"stopping: {MISS_LIMIT} misses in a row and a known post no longer loads, likely a login wall", flush=True)
                        login_wall = True
                        break
                    print(f"  {probe} still loads; recording {len(missed)} posts as hidden from logged-out visitors", flush=True)
                    for missed_code in missed:
                        results[missed_code] = {"location": None, "miss": True}
                    misses, missed = 0, []
            save(out_path, results)
            time.sleep(args.delay + random.uniform(0, 2))
        browser.close()

    save(out_path, results)
    tagged = sum(1 for value in results.values() if value.get("location"))
    print(f"done: {len(results)} read, {tagged} with a location tag", flush=True)
    if login_wall:
        sys.exit(3)


if __name__ == "__main__":
    main()
