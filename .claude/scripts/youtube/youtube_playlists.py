"""Register and inspect the YouTube playlists the collector syncs.

Registration stores the playlist through the admin API and records its current
videos. ``--baseline all`` marks those videos as already handled (``SKIPPED``)
so only videos added later are processed; ``--baseline none`` queues every
current video.

Usage:
    uv run python .claude/scripts/youtube/youtube_playlists.py list
    uv run python .claude/scripts/youtube/youtube_playlists.py add PLAYLIST_ID --sunrei SUNREI_ID [--baseline all|none] [--disabled]
    uv run python .claude/scripts/youtube/youtube_playlists.py update PLAYLIST_ID [--sunrei SUNREI_ID] [--enable | --disable]
"""

import argparse
import sys

from _common import load_google_api_key
from collection_api import CollectionApi
from youtube_data import fetch_playlist, fetch_video_details, playlist_input, video_inputs


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list")

    add = commands.add_parser("add")
    add.add_argument("playlist_id")
    add.add_argument("--sunrei", dest="sunrei_id", help="Sunrei that approved places are added to")
    add.add_argument("--baseline", choices=["all", "none"], default="all")
    add.add_argument("--disabled", action="store_true", help="Register without periodic sync")

    update = commands.add_parser("update")
    update.add_argument("playlist_id")
    update.add_argument("--sunrei", dest="sunrei_id")
    toggle = update.add_mutually_exclusive_group()
    toggle.add_argument("--enable", dest="sync_enabled", action="store_true", default=None)
    toggle.add_argument("--disable", dest="sync_enabled", action="store_false")
    return parser.parse_args()


def require_api_key():
    api_key = load_google_api_key()
    if not api_key:
        raise RuntimeError("No YouTube API key found in YOUTUBE_API_KEY or application-local.conf")
    return api_key


def print_playlists(api):
    for playlist in api.list_playlists():
        state = "sync" if playlist["syncEnabled"] else "off"
        print(
            f"{playlist['id']}  [{state}] {playlist['title']}  "
            f"sunrei={playlist.get('sunreiId') or '-'} videos={playlist['videoCount']} "
            f"pending={playlist['pendingVideoCount']} lastSynced={playlist.get('lastSyncedAt') or '-'}"
        )


def register(api, api_key, playlist_id, sunrei_id, baseline, sync_enabled):
    if api.get_playlist(playlist_id):
        raise ValueError(f"Playlist {playlist_id} is already registered; use update")
    remote = fetch_playlist(api_key, playlist_id)
    details = fetch_video_details(api_key, [item["videoId"] for item in remote["videos"]])
    api.upsert_playlist(playlist_id, playlist_input(remote, sunrei_id, sync_enabled))
    result = api.sync_playlist_videos(
        playlist_id,
        video_inputs(remote, details),
        initial_status="SKIPPED" if baseline == "all" else None,
    )
    print(
        f"registered {remote['title']}: videos={len(remote['videos'])} "
        f"pending={len(result['pendingVideos'])}"
    )


def update(api, playlist_id, sunrei_id, sync_enabled):
    playlist = api.get_playlist(playlist_id)
    if not playlist:
        raise ValueError(f"Playlist {playlist_id} is not registered; use add")
    body = {"title": playlist["title"]}
    if sunrei_id:
        body["sunreiId"] = sunrei_id
    if sync_enabled is not None:
        body["syncEnabled"] = sync_enabled
    updated = api.upsert_playlist(playlist_id, body)
    print(
        f"updated {updated['title']}: sync={updated['syncEnabled']} "
        f"sunrei={updated.get('sunreiId') or '-'}"
    )


def main():
    args = parse_args()
    api = CollectionApi()
    if args.command == "list":
        print_playlists(api)
    elif args.command == "add":
        register(api, require_api_key(), args.playlist_id, args.sunrei_id, args.baseline, not args.disabled)
    else:
        update(api, args.playlist_id, args.sunrei_id, args.sync_enabled)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
