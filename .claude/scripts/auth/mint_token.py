"""
Sunrei Admin JWT Minting (no login flow)

Signs a short-lived admin JWT with the server's auth-jwt-secret so automation
can call /admin endpoints without the Google OAuth browser flow. The server
validates admin JWTs statelessly (HS256, issuer "sunrei", non-blank
userId/email, role == "admin"), so a locally signed token is accepted exactly
like one issued by POST /api/auth/google.

The token is printed to stdout and nothing else, so it can be captured inline
and kept out of files:

    TOKEN=$(python3 .claude/scripts/auth/mint_token.py)

Ability to mint is gated by KMS access: the signing secret is resolved from
AUTH_JWT_SECRET, or by decrypting deploy/secrets/secrets.enc.yaml with SOPS
(needs GCP credentials with decrypt permission on the homelab-secrets key).

Because this secret also signs real user sessions, keep the lifetime short and
do not persist the token. To revoke, rotate auth-jwt-secret (costs one
re-login per user).

Usage:
    python3 .claude/scripts/auth/mint_token.py [--minutes 60]
"""

import argparse
import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SECRETS_FILE = REPO_ROOT / "deploy" / "secrets" / "secrets.enc.yaml"

ISSUER = "sunrei"  # must equal auth.jwt.issuer in sunrei-server/application.conf
ADMIN_USER_ID = "U00000000000000000000000000"  # admin seeded by V1__init.sql
ADMIN_EMAIL = "nelson@vcnc.co.kr"


def resolve_secret() -> str:
    secret = os.environ.get("AUTH_JWT_SECRET")
    if secret:
        return secret

    result = subprocess.run(
        ["sops", "-d", "--extract", '["stringData"]["auth-jwt-secret"]', str(SECRETS_FILE)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not result.stdout.strip():
        sys.exit(
            "auth-jwt-secret 복호화 실패. KMS decrypt 권한이 있는 계정으로 "
            "gcloud 인증이 되어 있는지 확인하세요.\n"
            f"{result.stderr.strip()}"
        )
    return result.stdout.strip()


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def mint(secret: str, minutes: int, user_id: str, email: str) -> tuple[str, int]:
    issued_at = int(time.time())
    expires_at = issued_at + minutes * 60

    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(
        json.dumps(
            {
                "iss": ISSUER,
                "sub": user_id,
                "userId": user_id,
                "email": email,
                "role": "admin",
                "iat": issued_at,
                "exp": expires_at,
            },
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    signature = b64url(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())

    return f"{header}.{payload}.{signature}", expires_at


def main() -> None:
    parser = argparse.ArgumentParser(description="Mint a short-lived Sunrei admin JWT")
    parser.add_argument("--minutes", type=int, default=60, help="lifetime in minutes (default 60)")
    parser.add_argument("--user-id", default=ADMIN_USER_ID)
    parser.add_argument("--email", default=ADMIN_EMAIL)
    args = parser.parse_args()

    if args.minutes < 1:
        sys.exit("--minutes must be at least 1")

    token, expires_at = mint(resolve_secret(), args.minutes, args.user_id, args.email)

    print(token)
    expires = time.strftime("%H:%M:%S", time.localtime(expires_at))
    print(f"admin JWT for {args.email}, expires {expires}", file=sys.stderr)


if __name__ == "__main__":
    main()
