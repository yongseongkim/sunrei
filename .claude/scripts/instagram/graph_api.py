"""Instagram Graph API client for Business Discovery (stdlib only).

Business Discovery reads another professional account's profile and posts with
our own IG user's token. The token and IG user ID come from SOPS
(instagram-access-token, instagram-user-id) unless INSTAGRAM_ACCESS_TOKEN and
INSTAGRAM_USER_ID are set. Calls pause when Meta's x-app-usage reaches 75%,
wait on rate-limit errors, and stop with the refresh command on an expired token.
"""

import json
import os
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
MEDIA_FIELDS = "id,permalink,timestamp,media_type,media_product_type,caption,like_count,comments_count"
ACCOUNT_FIELDS = "id,username,name,biography,followers_count,media_count,profile_picture_url"
RATE_LIMIT_CODES = {4, 17, 32, 613, 80002}
USAGE_PAUSE_PERCENT = 75
REFRESH_HINT = "python3 .claude/scripts/instagram/refresh_token.py"
SHORTCODE = re.compile(r"instagram\.com/(?:[^/]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)")


class TokenExpired(RuntimeError):
    pass


def log(message):
    print(f"{datetime.now().strftime('%H:%M:%S')} {message}", flush=True)


def shortcode_of(permalink):
    match = SHORTCODE.search(permalink or "")
    return match.group(1) if match else None


def iso_timestamp(value):
    """Graph API times look like 2026-10-11T03:00:00+0000; the admin API wants ISO-8601 with a colon offset."""
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S%z").astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def post_input(media):
    """Convert one Business Discovery media item to the admin API's InstagramPostInput."""
    return {
        "id": media["id"],
        "permalink": media["permalink"],
        "mediaType": media["media_type"],
        "productType": media.get("media_product_type"),
        "caption": media.get("caption"),
        "postedAt": iso_timestamp(media["timestamp"]),
        "likeCount": media.get("like_count"),
        "commentsCount": media.get("comments_count"),
    }


class GraphApi:
    def __init__(self):
        self.token = os.environ.get("INSTAGRAM_ACCESS_TOKEN") or sops_secret("instagram-access-token")
        self.user_id = os.environ.get("INSTAGRAM_USER_ID") or sops_secret("instagram-user-id")
        self.usage = 0

    def call(self, fields):
        """GET our IG user with the given fields; waits on rate limits, raises TokenExpired on #190."""
        while True:
            query = urllib.parse.urlencode({"fields": fields, "access_token": self.token})
            request = urllib.request.Request(f"{GRAPH}/{self.user_id}?{query}", headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    body = json.load(response)
                    usage = json.loads(response.headers.get("x-app-usage") or "{}")
                self.usage = max(usage.values(), default=0)
                if self.usage >= USAGE_PAUSE_PERCENT:
                    log(f"Graph API usage {self.usage}%; pausing 10 minutes")
                    time.sleep(600)
                return body
            except urllib.error.HTTPError as error:
                # Report Meta's error only; the request URL carries the token.
                payload = json.loads(error.read() or b"{}").get("error", {})
                code = payload.get("code")
                if code in RATE_LIMIT_CODES:
                    log(f"Graph API rate limited (#{code}); waiting 10 minutes")
                    time.sleep(600)
                elif code == 190:
                    raise TokenExpired(f"Instagram token expired or invalid. Refresh it with: {REFRESH_HINT}")
                else:
                    raise RuntimeError(f"Graph API error #{code}: {payload.get('message')}")
            except (urllib.error.URLError, TimeoutError) as error:
                log(f"Graph API network error {error}; retrying in 1 minute")
                time.sleep(60)

    def account(self, username):
        body = self.call(f"business_discovery.username({username}){{{ACCOUNT_FIELDS}}}")
        return body["business_discovery"]

    def media_page(self, username, after=None, limit=50, fields=MEDIA_FIELDS):
        """Return (account, media items newest first, cursor for the next page or None)."""
        edge = f"media.after({after}).limit({limit})" if after else f"media.limit({limit})"
        body = self.call(f"business_discovery.username({username}){{{ACCOUNT_FIELDS},{edge}{{{fields}}}}}")
        result = body["business_discovery"]
        page = result.pop("media", {}) or {}
        items = page.get("data", [])
        cursor = page.get("paging", {}).get("cursors", {}).get("after") if items else None
        return result, items, cursor
