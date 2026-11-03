"""Fill missing Sunrei covers with the actual YouTube playlist thumbnail.

Metadata only: never downloads videos or changes spots, publication or existing covers.
Dry-run by default. SUNREI_API_URL selects the API (default: production).

    uv run python .claude/scripts/youtube/playlist_covers.py [--playlist ID] [--commit]
"""

import argparse
import json
import sys
import urllib.parse

from _common import load_google_api_key
from collection_api import CollectionApi
from youtube_data import fetch_playlist_metadata


def thumbnail_images(metadata):
    url = metadata.get("thumbnailUrl")
    if not isinstance(url, str) or not url.strip():
        return []
    url = url.strip()
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return []
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        return []
    return [{"images": [{"url": url}]}]


def playlist_id(url):
    try:
        parsed = urllib.parse.urlparse(url or "")
        if parsed.scheme not in {"https", "http"} or parsed.hostname not in {
            "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"
        }:
            return None
        return urllib.parse.parse_qs(parsed.query).get("list", [None])[0]
    except ValueError:
        return None


def ensure_playlist_cover(api, playlist, metadata, commit=False):
    result = {"playlistId": playlist["id"], "sunreiId": playlist.get("sunreiId")}
    images = thumbnail_images(metadata)
    if metadata.get("id") != playlist["id"]:
        raise ValueError("Playlist metadata does not match the registered playlist")
    if not playlist.get("sunreiId"):
        return {**result, "status": "unlinked"}
    if not images:
        return {**result, "status": "no_thumbnail"}

    sunrei = api.request("GET", f"/admin/sunreis/{playlist['sunreiId']}")
    if sunrei.get("source", {}).get("type") != "YOUTUBE" or playlist_id(sunrei.get("link")) != playlist["id"]:
        return {**result, "status": "link_mismatch"}
    if any(
        isinstance(image.get("url"), str) and image["url"].strip()
        for group in sunrei.get("images") or []
        for image in group.get("images") or []
    ):
        return {**result, "status": "kept_existing"}

    if commit:
        # A partial PUT changes only this field; never send a stale spots array.
        api.request("PUT", f"/admin/sunreis/{playlist['sunreiId']}", {"images": images})
    return {**result, "status": "updated" if commit else "would_update", "thumbnailUrl": metadata["thumbnailUrl"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--playlist", action="append", dest="playlist_ids")
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args()
    key = load_google_api_key()
    if not key:
        raise RuntimeError("Configure YOUTUBE_API_KEY or google.youtubeApiKey locally")
    api = CollectionApi()
    playlists = api.list_playlists()
    if args.playlist_ids:
        unknown = set(args.playlist_ids) - {item["id"] for item in playlists}
        if unknown:
            raise ValueError(f"Unregistered playlists: {', '.join(sorted(unknown))}")
        playlists = [item for item in playlists if item["id"] in args.playlist_ids]

    for playlist in playlists:
        if not playlist.get("sunreiId"):
            print(json.dumps({"playlistId": playlist["id"], "status": "unlinked"}))
            continue
        metadata = fetch_playlist_metadata(key, playlist["id"])
        print(json.dumps(ensure_playlist_cover(api, playlist, metadata, commit=args.commit), ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
