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

if [ ! -s "$CODEX_HOME/auth.json" ]; then
  echo "Codex auth is missing at $CODEX_HOME/auth.json" >&2
  exit 1
fi

codex login status >/dev/null

cd /app
exec uv run python .claude/scripts/youtube/renew_playlists.py --commit --upload
