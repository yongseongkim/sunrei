"""Copy YouTube playlist covers into Sunrei's resized image storage.

Preserves custom covers, spots and publication. An empty cover or matching
YouTube cover is replaced with the image upload API's stored size variants.
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
    variants = []
    thumbnails = metadata.get("thumbnails") or {}
    if isinstance(thumbnails, dict):
        for name in ("maxres", "standard", "high", "medium", "default"):
            image = thumbnails.get(name) or {}
            if isinstance(image, dict):
                parsed = thumbnail_variant(image)
                if parsed and parsed["url"] not in {item["url"] for item in variants}:
                    variants.append(parsed)
    fallback = thumbnail_variant({"url": metadata.get("thumbnailUrl")})
    if fallback and fallback["url"] not in {item["url"] for item in variants}:
        variants.append(fallback)
    variants.sort(key=lambda image: image.get("width", 0), reverse=True)
    return [{"images": variants}] if variants else []


def thumbnail_variant(image):
    url = image.get("url")
    if not isinstance(url, str) or not url.strip():
        return None
    url = url.strip()
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return None
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        return None
    variant = {"url": url}
    for field in ("width", "height"):
        value = image.get(field)
        if isinstance(value, int) and not isinstance(value, bool) and value > 0:
            variant[field] = value
    return variant


def upload_playlist_cover(api, metadata):
    """Upload one playlist cover; the server returns its resized S3 images."""
    images = thumbnail_images(metadata)
    if not images:
        return []
    original = thumbnail_variant({"url": metadata.get("thumbnailUrl")}) or images[0]["images"][0]
    uploaded = api.request("POST", "/admin/images/upload-url", {"url": original["url"]}, timeout=180)
    variants = uploaded.get("images") if isinstance(uploaded, dict) else None
    if not isinstance(variants, list) or not variants or any(
        not isinstance(image, dict) or thumbnail_variant(image) is None
        for image in variants
    ):
        raise RuntimeError("Image upload returned no valid playlist cover")
    return [uploaded]


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
    existing = sunrei.get("images") or []
    existing_urls = {
        image["url"].strip()
        for group in existing
        for image in group.get("images") or []
        if isinstance(image.get("url"), str) and image["url"].strip()
    }
    if existing_urls:
        playlist_urls = {image["url"] for image in images[0]["images"]}
        if len(existing) != 1 or not existing_urls.issubset(playlist_urls):
            return {**result, "status": "kept_existing"}

    if commit:
        images = upload_playlist_cover(api, metadata)
        # Uploading can take a few seconds. Preserve a cover edited in that time.
        current = api.request("GET", f"/admin/sunreis/{playlist['sunreiId']}")
        if current.get("images") != sunrei.get("images") or current.get("link") != sunrei.get("link"):
            return {**result, "status": "kept_changed"}
        # A partial PUT changes only this field; never send a stale spots array.
        api.request("PUT", f"/admin/sunreis/{playlist['sunreiId']}", {"images": images})
    return {**result, "status": "updated" if commit else "would_update"}


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
