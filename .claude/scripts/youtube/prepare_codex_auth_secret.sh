#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)
AUTH_FILE=${1:-"${CODEX_HOME:-$HOME/.codex}/auth.json"}
OUTPUT=${2:-"$ROOT/deploy/secrets/youtube-renewal-auth.enc.yaml"}

if [ ! -s "$AUTH_FILE" ]; then
  echo "Codex auth file not found: $AUTH_FILE" >&2
  echo "Run 'codex login -c cli_auth_credentials_store=\"file\" --device-auth' first." >&2
  exit 1
fi

command -v kubectl >/dev/null 2>&1 || {
  echo "kubectl is required" >&2
  exit 1
}
command -v sops >/dev/null 2>&1 || {
  echo "sops is required" >&2
  exit 1
}

umask 077
plain=$(mktemp)
encrypted=$(mktemp)
claude_token=$(mktemp)
trap 'rm -f "$plain" "$encrypted" "$claude_token"' EXIT HUP INT TERM

cd "$ROOT"

# The Claude fallback token from `claude setup-token` is optional.
set -- --from-file="auth.json=$AUTH_FILE"
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  printf '%s' "$CLAUDE_CODE_OAUTH_TOKEN" > "$claude_token"
  set -- "$@" --from-file="claude-code-oauth-token=$claude_token"
else
  echo "CLAUDE_CODE_OAUTH_TOKEN is not set; the secret will not include the Claude fallback." >&2
fi

kubectl create secret generic sunrei-youtube-renewal-auth \
  --namespace sunrei \
  "$@" \
  --dry-run=client \
  --output yaml > "$plain"

sops --encrypt --filename-override "$OUTPUT" "$plain" > "$encrypted"
mv "$encrypted" "$OUTPUT"
chmod 600 "$OUTPUT"

echo "Encrypted Codex/Claude auth secret -> $OUTPUT"
