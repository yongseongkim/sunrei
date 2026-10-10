#!/bin/sh
set -eu

umask 077

: "${CODEX_HOME:=/var/lib/sunrei/codex}"
: "${SUNREI_YOUTUBE_AUTOMATION_ROOT:=/var/lib/sunrei/automation}"
: "${UV_CACHE_DIR:=/var/lib/sunrei/uv-cache}"

export CODEX_HOME SUNREI_YOUTUBE_AUTOMATION_ROOT UV_CACHE_DIR

mkdir -p \
  "$CODEX_HOME" \
  "$SUNREI_YOUTUBE_AUTOMATION_ROOT" \
  "$UV_CACHE_DIR"

# Codex runs first and Claude is the fallback, so one usable login is enough.
codex_ready=false
if [ -s "$CODEX_HOME/auth.json" ] && codex login status >/dev/null 2>&1; then
  codex_ready=true
else
  echo "Codex login is unavailable at $CODEX_HOME/auth.json" >&2
fi

if [ "$codex_ready" = false ] && [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "Neither Codex nor Claude credentials are available" >&2
  exit 1
fi

cd /app
exec uv run python .claude/scripts/youtube/renew_playlists.py --commit
