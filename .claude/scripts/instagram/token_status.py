"""Report whether the stored Instagram access token works and when it expires.

Read-only: asks Meta's debug_token about instagram-access-token from
deploy/secrets/secrets.enc.yaml (or INSTAGRAM_ACCESS_TOKEN) and never prints it.
Run it before any Instagram step that calls the Graph API.

Exit codes: 0 valid, 2 valid but expires within --warn-days, 1 expired or
invalid (refresh with refresh_token.py).

Usage:
    python3 .claude/scripts/instagram/token_status.py [--warn-days 7]
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "youtube"))
from _common import UA, sops_secret  # noqa: E402

GRAPH = "https://graph.facebook.com/v25.0"
KST = timezone(timedelta(hours=9))
REFRESH = "python3 .claude/scripts/instagram/refresh_token.py"


def when(timestamp):
    if not timestamp:
        return "never"
    days = (timestamp - time.time()) / 86400
    return f"{datetime.fromtimestamp(timestamp, KST):%Y-%m-%d %H:%M} KST ({days:.1f} days left)"


def main():
    warn_days = float(sys.argv[sys.argv.index("--warn-days") + 1]) if "--warn-days" in sys.argv else 7
    token = os.environ.get("INSTAGRAM_ACCESS_TOKEN") or sops_secret("instagram-access-token")
    query = urllib.parse.urlencode({"input_token": token, "access_token": token})
    request = urllib.request.Request(f"{GRAPH}/debug_token?{query}", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.load(response)["data"]
    except urllib.error.HTTPError as error:
        # Report Meta's error only; the request URL carries the token.
        payload = json.loads(error.read() or b"{}").get("error", {})
        print(f"Token invalid: #{payload.get('code')} {payload.get('message')}")
        print(f"Refresh by logging in with Facebook:\n  {REFRESH}")
        sys.exit(1)

    if not data.get("is_valid"):
        print(f"Token invalid: {(data.get('error') or {}).get('message', 'unknown reason')}")
        print(f"Refresh by logging in with Facebook:\n  {REFRESH}")
        sys.exit(1)
    expires_at = data.get("expires_at") or 0
    data_access = data.get("data_access_expires_at") or 0
    print(f"Token valid; expires {when(expires_at)}")
    print(f"Data access expires {when(data_access)}")
    soonest = min(t for t in (expires_at, data_access) if t) if expires_at or data_access else 0
    if soonest and soonest - time.time() < warn_days * 86400:
        print(f"Expires within {warn_days:g} days; refresh soon with\n  {REFRESH}")
        sys.exit(2)


if __name__ == "__main__":
    main()
