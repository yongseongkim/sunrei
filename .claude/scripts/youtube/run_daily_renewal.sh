#!/bin/zsh
set -eu

ROOT="/Users/yongseongkim/Documents/workspace.nosync/sunrei"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$ROOT/.claude/workspace/youtube/automation/logs"
cd "$ROOT"

exec /opt/homebrew/bin/uv run python \
  .claude/scripts/youtube/renew_playlists.py --commit --upload
