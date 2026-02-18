"""
Sunrei Admin CLI Login

Authenticates via Google OAuth and saves a JWT token as SUNREI_ADMIN_TOKEN in .claude/.env.

Usage:
    uv run --with requests python .claude/scripts/auth/login.py [--prod]

Options:
    --prod  Use production server (https://sunrei-api.yongseongkimm.com)

Environment variables (auto-loaded from .claude/.env if present):
    GOOGLE_OAUTH_CLIENT_ID  - Google OAuth client ID (required)
    SUNREI_SERVER_URL       - Server URL (overrides default and --prod flag)
"""

import http.server
import os
import sys
import threading
import urllib.parse
import webbrowser
from pathlib import Path

import requests

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def _load_dot_env():
    """Load .claude/.env if GOOGLE_OAUTH_CLIENT_ID is not already set."""
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


def _set_env_var(key: str, value: str):
    """Set or update a variable in .claude/.env."""
    lines: list[str] = []
    found = False
    if ENV_FILE.is_file():
        for line in ENV_FILE.read_text().splitlines():
            stripped = line.strip()
            if stripped.startswith(f"{key}=") or stripped.startswith(f"export {key}="):
                lines.append(f"{key}={value}")
                found = True
            else:
                lines.append(line)
    if not found:
        lines.append(f"{key}={value}")
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    ENV_FILE.write_text("\n".join(lines) + "\n")
    ENV_FILE.chmod(0o600)


CALLBACK_PORT = 9876
REDIRECT_URI = f"http://localhost:{CALLBACK_PORT}/callback"
SCOPES = "openid email profile"

class OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    """Handles the Google OAuth callback to capture the authorization code."""

    auth_code: str | None = None
    error: str | None = None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/callback":
            self.send_response(404)
            self.end_headers()
            return

        params = urllib.parse.parse_qs(parsed.query)

        if "error" in params:
            OAuthCallbackHandler.error = params["error"][0]
            self._respond("Login failed. You can close this tab.")
        elif "code" in params:
            OAuthCallbackHandler.auth_code = params["code"][0]
            self._respond("Login successful! You can close this tab.")
        else:
            OAuthCallbackHandler.error = "no_code"
            self._respond("Login failed: no authorization code received.")

    def _respond(self, message: str):
        html = f"<html><body><h2>{message}</h2></body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(html.encode())

    def log_message(self, format, *args):
        pass  # Suppress HTTP server logs


def main():
    _load_dot_env()

    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    if not client_id:
        print("Error: GOOGLE_OAUTH_CLIENT_ID is required. Set it in .claude/.env or as an environment variable.")
        sys.exit(1)

    if os.environ.get("SUNREI_SERVER_URL"):
        server_url = os.environ["SUNREI_SERVER_URL"]
    elif "--prod" in sys.argv:
        server_url = "https://sunrei-api.yongseongkimm.com"
    else:
        server_url = "http://localhost:3030"

    print(f"Server: {server_url}")

    # Start local callback server
    server = http.server.HTTPServer(("localhost", CALLBACK_PORT), OAuthCallbackHandler)
    server_thread = threading.Thread(target=server.handle_request, daemon=True)
    server_thread.start()

    # Open browser to Google OAuth consent screen
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        + urllib.parse.urlencode(
            {
                "client_id": client_id,
                "redirect_uri": REDIRECT_URI,
                "response_type": "code",
                "scope": SCOPES,
                "access_type": "offline",
                "prompt": "consent",
            }
        )
    )

    print("Opening browser for Google login...")
    webbrowser.open(auth_url)
    print("Waiting for authorization...")

    # Wait for callback
    server_thread.join(timeout=120)
    server.server_close()

    if OAuthCallbackHandler.error:
        print(f"Error: {OAuthCallbackHandler.error}")
        sys.exit(1)

    if not OAuthCallbackHandler.auth_code:
        print("Error: Timed out waiting for authorization.")
        sys.exit(1)

    print("Authorization code received. Exchanging for token...")

    # Exchange code for JWT via server
    try:
        resp = requests.post(
            f"{server_url}/api/auth/google/code",
            json={"code": OAuthCallbackHandler.auth_code, "redirectUri": REDIRECT_URI},
            timeout=30,
        )
    except requests.ConnectionError:
        print(f"Error: Could not connect to server at {server_url}")
        sys.exit(1)

    if resp.status_code != 200:
        print(f"Error: Server returned {resp.status_code}")
        try:
            print(resp.json())
        except Exception:
            print(resp.text)
        sys.exit(1)

    data = resp.json()
    token = data["token"]
    user = data["user"]

    # Save token to .claude/.env
    _set_env_var("SUNREI_ADMIN_TOKEN", token)

    print(f"\nLogged in as: {user.get('name', '')} ({user.get('email', '')})")
    print(f"Token saved to: {ENV_FILE} as SUNREI_ADMIN_TOKEN")


if __name__ == "__main__":
    main()
