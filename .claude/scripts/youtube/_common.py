"""Shared helpers for the YouTube→Sunrei scripts (stdlib only, no external deps).

- Google API key is read from the server's application-local.conf.
- Admin token is minted locally (no login flow) — see auth/mint_token.py.
- All HTTP sets a real User-Agent (prod Cloudflare 403s urllib's default).
"""
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT / ".claude" / ".env"
CONF = ROOT / "sunrei-server" / "src" / "main" / "resources" / "application-local.conf"
WS_ROOT = ROOT / ".claude" / "workspace" / "youtube"

LOCAL_SERVER = "http://localhost:3030"
PROD_SERVER = "https://sunrei-api.yongseongkimm.com"
UA = "sunrei-ingest/1.0"


def workspace(id_or_path):
    p = Path(id_or_path)
    return p if p.is_dir() else WS_ROOT / id_or_path


def load_google_api_key():
    if not CONF.is_file():
        return None
    m = re.search(r'youtubeApiKey\s*=\s*"?([^"\s]+)"?', CONF.read_text())
    return m.group(1) if m else None


def load_env():
    env = {}
    if ENV_FILE.is_file():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export "):]
            k, _, v = line.partition("=")
            if k:
                env[k.strip()] = v.strip().strip('"')
    return env


def jwt_is_usable(token, minimum_seconds=60):
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        value = json.loads(base64.urlsafe_b64decode(payload))
        return int(value["exp"]) > int(time.time()) + minimum_seconds
    except (IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return False


def admin_token():
    """Resolve an admin JWT: env var, then .claude/.env, then mint one locally.

    The login-less flow signs a short-lived admin JWT with auth-jwt-secret
    (see auth/mint_token.py), so no SUNREI_ADMIN_TOKEN needs to be pre-set.
    """
    tok = os.environ.get("SUNREI_ADMIN_TOKEN") or load_env().get("SUNREI_ADMIN_TOKEN")
    if tok and jwt_is_usable(tok):
        return tok
    mint = ROOT / ".claude" / "scripts" / "auth" / "mint_token.py"
    if mint.is_file():
        out = subprocess.run([sys.executable, str(mint)], capture_output=True, text=True)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip().splitlines()[0]
    return None


def server_url(prod=False):
    return PROD_SERVER if prod else LOCAL_SERVER


def http_json(method, url, headers=None, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    h = {"User-Agent": UA}
    if data is not None:
        h["Content-Type"] = "application/json"
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, (json.loads(raw) if raw else None)
        except Exception:
            return e.code, {"raw": raw.decode("utf-8", "replace")}
    except (urllib.error.URLError, OSError) as e:
        return 0, {"error": str(e)}


def admin_api(method, path, token, body=None, prod=False):
    return http_json(method, server_url(prod) + path,
                     headers={"Authorization": f"Bearer {token}"}, body=body)
