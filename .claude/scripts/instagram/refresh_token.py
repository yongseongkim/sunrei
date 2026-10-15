"""Log in with Facebook and save a long-lived Instagram access token.

Business Discovery calls use a Facebook user token. By default this opens the
Facebook login dialog in the browser, catches the authorization code on
localhost, and exchanges it for a token that lasts about 60 days. The token
replaces instagram-access-token in deploy/secrets/secrets.enc.yaml through
`sops set --value-stdin`, so no secret appears in arguments or output.

Meta accepts the localhost redirect only while the app is in development mode.
The login and the exchange need instagram-app-id and instagram-app-secret in the
secrets file. instagram-login-config-id (a Facebook Login for Business
configuration) is used when present; otherwise the dialog asks for SCOPES.

Usage:
    python3 .claude/scripts/instagram/refresh_token.py                     # browser login
    pbpaste | python3 .claude/scripts/instagram/refresh_token.py --token-stdin
    pbpaste | python3 .claude/scripts/instagram/refresh_token.py --app-secret-stdin
"""

import http.server
import json
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "youtube"))
from _common import SECRETS_FILE, UA, sops_secret  # noqa: E402

GRAPH = "https://graph.facebook.com/v25.0"
DIALOG = "https://www.facebook.com/v25.0/dialog/oauth"
CALLBACK_PORT = 9877  # login.py uses 9876 for Google
REDIRECT_URI = f"http://localhost:{CALLBACK_PORT}/callback"
SCOPES = "instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement"
LOGIN_TIMEOUT_SECONDS = 300
KST = timezone(timedelta(hours=9))


def save(name, value):
    result = subprocess.run(
        ["sops", "set", "--value-stdin", str(SECRETS_FILE), f'["stringData"]["{name}"]'],
        input=json.dumps(value),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"sops set failed: {result.stderr.strip()[-300:]}")


def graph_token(params):
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(f"{GRAPH}/oauth/access_token?{query}", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Report Meta's error only; the request URL carries the secrets.
        payload = json.loads(error.read() or b"{}").get("error", {})
        raise SystemExit(f"Token request failed (HTTP {error.code}): #{payload.get('code')} {payload.get('message')}")


class CallbackHandler(http.server.BaseHTTPRequestHandler):
    result = None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/callback":
            self.send_response(404)
            self.end_headers()
            return
        CallbackHandler.result = {key: values[0] for key, values in urllib.parse.parse_qs(parsed.query).items()}
        message = "Login failed. You can close this tab." if "error" in self.result else "Logged in. You can close this tab."
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(f"<html><body><h2>{message}</h2></body></html>".encode())

    def log_message(self, format, *args):
        pass


def login_code(app_id):
    state = secrets.token_urlsafe(16)
    params = {"client_id": app_id, "redirect_uri": REDIRECT_URI, "state": state, "response_type": "code"}
    config_id = sops_secret("instagram-login-config-id", required=False)
    if config_id:
        params["config_id"] = config_id
    else:
        params["scope"] = SCOPES
    server = http.server.HTTPServer(("localhost", CALLBACK_PORT), CallbackHandler)
    server.timeout = 1
    print("Opening the Facebook login in your browser. Opt in the Sunrei Page and the Instagram account.")
    webbrowser.open(f"{DIALOG}?{urllib.parse.urlencode(params)}")
    deadline = time.time() + LOGIN_TIMEOUT_SECONDS
    try:
        while CallbackHandler.result is None and time.time() < deadline:
            server.handle_request()
    finally:
        server.server_close()
    result = CallbackHandler.result
    if result is None:
        raise SystemExit("Timed out waiting for the Facebook login")
    if "error" in result:
        raise SystemExit(f"Login failed: {result.get('error_reason') or result['error']} {result.get('error_description', '')}".strip())
    if result.get("state") != state or not result.get("code"):
        raise SystemExit("Login callback did not match this request; try again")
    return result["code"]


def main():
    if "--app-secret-stdin" in sys.argv:
        value = sys.stdin.read().strip()
        if not value:
            raise SystemExit("No app secret on stdin")
        save("instagram-app-secret", value)
        print(f"Saved instagram-app-secret to {SECRETS_FILE.name}. Commit the file to keep it.")
        return

    app_id = sops_secret("instagram-app-id")
    app_secret = sops_secret("instagram-app-secret", required=False)
    if "--token-stdin" in sys.argv:
        token = sys.stdin.read().strip()
        if not token:
            raise SystemExit("No token on stdin")
        if not app_secret:
            save("instagram-access-token", token)
            print(f"Saved the token as it is to {SECRETS_FILE.name}; it lasts only an hour or two. "
                  "Add instagram-app-secret to get a 60-day token.")
            return
    else:
        if not app_secret:
            raise SystemExit("The browser login needs instagram-app-secret. Copy the App Secret from the app's "
                             "basic settings, then run: pbpaste | python3 .claude/scripts/instagram/refresh_token.py --app-secret-stdin")
        code = login_code(app_id)
        token = graph_token({"client_id": app_id, "client_secret": app_secret, "redirect_uri": REDIRECT_URI, "code": code})["access_token"]

    body = graph_token({
        "grant_type": "fb_exchange_token",
        "client_id": app_id,
        "client_secret": app_secret,
        "fb_exchange_token": token,
    })
    save("instagram-access-token", body["access_token"])
    expires_in = body.get("expires_in")
    expiry = f"expires around {datetime.now(KST) + timedelta(seconds=int(expires_in)):%Y-%m-%d %H:%M} KST" if expires_in else "no expiry returned"
    print(f"Saved a long-lived token to {SECRETS_FILE.name}; {expiry}. Commit the file to keep it.")


if __name__ == "__main__":
    main()
