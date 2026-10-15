"""Download Instagram reels as MP4 for Whisper and OCR, paced to avoid throttling.

Instagram publishes no limit for logged-out access. When it throttles, yt-dlp
gets an empty media response or "rate-limit reached or login required" instead
of the video. Downloads therefore run one at a time with a random pause. A
throttled reel waits and is retried once at the end of the run, and three
throttled reels in a row stop the run. status.json records every reel's
outcome, so a rerun skips finished reels and retries the rest.

Age-restricted reels (alcohol, for example) need a logged-in session and are
recorded as login_required. Login cookies are deliberately not supported. With
--api-fallback USERNAME, those reels are downloaded from the Graph API's
media_url instead, using instagram-access-token and instagram-user-id from
deploy/secrets/secrets.enc.yaml (SOPS). INSTAGRAM_ACCESS_TOKEN and
INSTAGRAM_USER_ID environment variables override them.

Usage:
    uv run --with yt-dlp python .claude/scripts/instagram/download_reels.py OUT_DIR URL_OR_FILE... \
        [--min-sleep 5] [--max-sleep 10] [--api-fallback USERNAME]

URL_OR_FILE is a reel or post URL, a shortcode, or a text file with one per
line. Exit code 3 means throttled reels remain; rerun later.
"""

import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "youtube"))
from _common import UA, sops_secret  # noqa: E402

GRAPH = "https://graph.facebook.com/v25.0"
SHORTCODE = re.compile(r"^[A-Za-z0-9_-]{5,}$")
URL_CODE = re.compile(r"instagram\.com/(?:[^/]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)")
FORMAT = "bv*[height<=720]+ba/b[height<=720]/b"
THROTTLE_STREAK_LIMIT = 3
THROTTLE_BACKOFF_SECONDS = 120
RETRY_PASS_DELAY_SECONDS = 300
API_MAX_PAGES = 60
API_USAGE_PAUSE_PERCENT = 75
DONE = {"downloaded", "unavailable"}


def log(message):
    print(f"{datetime.now().strftime('%H:%M:%S')} {message}", flush=True)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("out_dir", type=Path)
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--min-sleep", type=float, default=5)
    parser.add_argument("--max-sleep", type=float, default=10)
    parser.add_argument("--api-fallback", metavar="USERNAME")
    return parser.parse_args()


def reel_urls(inputs):
    """Return {shortcode: url} in input order from URLs, shortcodes, and list files."""
    reels = {}
    for value in inputs:
        path = Path(value)
        lines = path.read_text().splitlines() if path.is_file() else [value]
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            match = URL_CODE.search(line)
            if match:
                reels.setdefault(match.group(1), line)
            elif SHORTCODE.match(line):
                reels.setdefault(line, f"https://www.instagram.com/reel/{line}/")
            else:
                raise SystemExit(f"Not an Instagram post URL or shortcode: {line}")
    return reels


def existing_file(out_dir, code):
    single = out_dir / f"{code}.mp4"
    if single.is_file():
        return single.name
    parts = sorted(out_dir.glob(f"{code}_*.mp4"))
    return parts[0].name if parts else None


def classify(message):
    # Match phrases, not bare numbers: shortcodes in the message can contain "429".
    text = message.lower()
    if "isn't available to everyone" in text or "certain audiences" in text:
        return "login_required"
    if "empty media response" in text or "rate-limit" in text or "http error 429" in text or "too many requests" in text:
        return "throttled"
    if "http error 404" in text or "page not found" in text or "no longer available" in text:
        return "unavailable"
    return "failed"


class _Silent:
    def debug(self, message):
        pass

    info = warning = error = debug


def download(out_dir, code, url):
    """Return (status, file, error) for one reel downloaded with yt-dlp."""
    import yt_dlp

    options = {
        "format": FORMAT,
        "merge_output_format": "mp4",
        # Carousel posts expand to several videos: {code}_1.mp4, {code}_2.mp4, ...
        "outtmpl": str(out_dir / f"{code}%(playlist_index&_{{}}|)s.%(ext)s"),
        "logger": _Silent(),
        "noprogress": True,
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            ydl.download([url])
    except yt_dlp.utils.DownloadError as error:
        message = re.sub(r"\s+", " ", str(error)).removeprefix("ERROR: ")
        return classify(message), None, message[:300]
    name = existing_file(out_dir, code)
    return ("downloaded", name, None) if name else ("failed", None, "yt-dlp finished without an MP4")


def graph_media_urls(username, wanted):
    """Page the account's media via Business Discovery until every wanted shortcode is found."""
    token = os.environ.get("INSTAGRAM_ACCESS_TOKEN") or sops_secret("instagram-access-token")
    user_id = os.environ.get("INSTAGRAM_USER_ID") or sops_secret("instagram-user-id")
    found, after = {}, None
    for _ in range(API_MAX_PAGES):
        edge = f"media.after({after}).limit(50)" if after else "media.limit(50)"
        fields = f"business_discovery.username({username}){{{edge}{{permalink,media_type,media_url}}}}"
        query = urllib.parse.urlencode({"fields": fields, "access_token": token})
        request = urllib.request.Request(f"{GRAPH}/{user_id}?{query}", headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = json.load(response)
                usage = json.loads(response.headers.get("x-app-usage") or "{}")
        except urllib.error.HTTPError as error:
            # Report Meta's error only; the request URL carries the token.
            payload = json.loads(error.read() or b"{}").get("error", {})
            hint = "\nRefresh the token by logging in with Facebook:\n  python3 .claude/scripts/instagram/refresh_token.py" if payload.get("code") == 190 else ""
            raise SystemExit(f"Graph API error #{payload.get('code')}: {payload.get('message')}{hint}")
        page = body["business_discovery"].get("media", {})
        for item in page.get("data", []):
            match = URL_CODE.search(item.get("permalink", ""))
            if match and match.group(1) in wanted:
                found[match.group(1)] = item.get("media_url")
        after = page.get("paging", {}).get("cursors", {}).get("after")
        if wanted <= found.keys() or not after or not page.get("data"):
            break
        if max(usage.values(), default=0) >= API_USAGE_PAUSE_PERCENT:
            log("Graph API usage is high; pausing 10 minutes")
            time.sleep(600)
    return found


def fetch_file(url, path):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    temporary = path.with_name(path.name + ".part")
    with urllib.request.urlopen(request, timeout=300) as response, temporary.open("wb") as file:
        while chunk := response.read(1 << 20):
            file.write(chunk)
    temporary.replace(path)


def main():
    args = parse_args()
    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    status_path = out_dir / "status.json"
    status = json.loads(status_path.read_text()) if status_path.is_file() else {}
    reels = reel_urls(args.inputs)

    def record(code, state, file=None, error=None, via=None):
        entry = status.setdefault(code, {"url": reels[code], "attempts": 0})
        entry.update(status=state, file=file, error=error, updatedAt=datetime.now(timezone.utc).isoformat())
        if via:
            entry["via"] = via
        temporary = status_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n")
        temporary.replace(status_path)

    queue = []
    for code in reels:
        name = existing_file(out_dir, code)
        if name:
            if (status.get(code) or {}).get("status") != "downloaded":
                record(code, "downloaded", name)
        elif (status.get(code) or {}).get("status") not in DONE | {"login_required"}:
            queue.append(code)
    log(f"{len(reels)} reels: {len(reels) - len(queue)} already settled, {len(queue)} to download")

    def attempt(code):
        status.setdefault(code, {"url": reels[code], "attempts": 0})["attempts"] += 1
        state, name, error = download(out_dir, code, reels[code])
        record(code, state, name, error)
        log(f"{code}: {state}" + (f" ({error[:120]})" if error and state != "downloaded" else ""))
        return state

    stopped, deferred, streak = False, [], 0
    for index, code in enumerate(queue):
        if index:
            time.sleep(random.uniform(args.min_sleep, args.max_sleep))
        if attempt(code) != "throttled":
            streak = 0
            continue
        streak += 1
        deferred.append(code)
        if streak >= THROTTLE_STREAK_LIMIT:
            log(f"throttled {streak} times in a row; stopping. Rerun in an hour or so.")
            stopped = True
            break
        log(f"backing off {THROTTLE_BACKOFF_SECONDS}s")
        time.sleep(THROTTLE_BACKOFF_SECONDS)

    if deferred and not stopped:
        log(f"retrying {len(deferred)} throttled reels after {RETRY_PASS_DELAY_SECONDS}s")
        time.sleep(RETRY_PASS_DELAY_SECONDS)
        for index, code in enumerate(deferred):
            if index:
                time.sleep(random.uniform(args.min_sleep, args.max_sleep))
            attempt(code)

    if args.api_fallback:
        wanted = {code for code in reels if status.get(code, {}).get("status") == "login_required"}
        if wanted:
            log(f"looking up {len(wanted)} login-required reels via the Graph API")
            media_urls = graph_media_urls(args.api_fallback, wanted)
            for code in sorted(wanted):
                url = media_urls.get(code)
                if not url:
                    note = "not found in the account's media" if code not in media_urls else "API returned no media_url"
                    record(code, "login_required", error=note)
                    log(f"{code}: {note}")
                    continue
                try:
                    fetch_file(url, out_dir / f"{code}.mp4")
                    record(code, "downloaded", f"{code}.mp4", via="graph_api")
                    log(f"{code}: downloaded via Graph API")
                except (urllib.error.URLError, TimeoutError) as error:
                    record(code, "login_required", error=f"media_url download failed: {error}")
                    log(f"{code}: media_url download failed: {error}")

    counts = {}
    for code in reels:
        state = status.get(code, {}).get("status", "pending")
        counts[state] = counts.get(state, 0) + 1
    log(f"done: {counts}")
    if counts.get("throttled") or counts.get("pending"):
        sys.exit(3)


if __name__ == "__main__":
    main()
