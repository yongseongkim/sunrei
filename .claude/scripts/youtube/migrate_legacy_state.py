"""Move the legacy file-based renewal state into the collection DB (one-off).

The previous collector kept its playlist list in ``youtube-renewal.json`` and
each playlist's handled videos in S3 baselines. This registers those playlists
through the admin API, records videos the baselines already handled as
``SKIPPED``, and queues the rest as ``PENDING``. Videos whose old run stopped at
review are queued again so their candidates reach the admin review screen.

The command is a dry run unless ``--commit`` is supplied, and skips playlists
that are already registered and synced.

Usage:
    uv run python .claude/scripts/youtube/migrate_legacy_state.py [--commit]
"""

import argparse
import gzip
import json
import sys
import urllib.parse
import urllib.request

from _common import load_google_api_key
from collection_api import CollectionApi
from youtube_data import fetch_playlist, fetch_video_details, playlist_input, video_inputs

ARTIFACT_STORE = {
    "bucket": "sunrei-resources",
    "prefix": "youtube/artifacts/v1",
    "region": "ap-northeast-2",
}
LEGACY_PLAYLISTS = [
    {"id": "PLRLht13xoCf6Y9WiydRPHK8ks_FZG8rdC", "sunreiId": "SR01kymcw7rt33057gxjmcmqcqm2", "enabled": True},
    {"id": "PLDarQlAimXcFD3CqCK8TGGDLeUOGJDj6z", "sunreiId": "SR01kyhwcyy5f1tf40nvhhxgc17x", "enabled": True},
    {"id": "PLkmBZE3qxSdH0bvPK3Fn4pY7jrcWKIX5J", "sunreiId": "SR01kyhw8vv345x6ywas7my5p8te", "enabled": True},
    {"id": "PLkmBZE3qxSdHktyll4GHSDVTsPfOpPvoI", "sunreiId": "SR01kyhwcxvhhbhftbxtq7h252zw", "enabled": True},
    {"id": "PLkmBZE3qxSdHQQwUr8yTLgk3IauZQAeDi", "sunreiId": "SR01kyj3jcwveajd0dyy9a7ktcsp", "enabled": True},
    {"id": "PLMorkLyAs-imjd7Ra23jioyXg37ywAHhv", "sunreiId": "SR01kz0c3w1ax9fz01wnpdn2a824", "enabled": True},
    {"id": "PLgbB1gJhmG7DWksYdc3AKRjRuzc4TMd5c", "sunreiId": "SR01kyhxp2gwq2nfkqw9nt0na55y", "enabled": False},
    {"id": "PLgbB1gJhmG7AbFF7O-kA2lQXYt1eRDFM2", "sunreiId": "SR01kyhxp3f4201e3v8k5h1tg47v", "enabled": False},
    {"id": "PLkmBZE3qxSdGkIxhowBQ3WfsHNPoErCNF", "sunreiId": "SR01kyhxg7bhjyxt4xj9semgvbhv", "enabled": False},
    {"id": "PLkmBZE3qxSdE1XFNY0NiK_-MY4eUtkHJs", "sunreiId": "SR01kyhwcx1w4n61ds2k99gc8ekt", "enabled": False},
]
HANDLED_STATUSES = {"approved"}


def public_object_url(key):
    encoded = urllib.parse.quote(key, safe="/")
    return f"https://{ARTIFACT_STORE['bucket']}.s3.{ARTIFACT_STORE['region']}.amazonaws.com/{encoded}"


def read_remote_json(url, compressed=False):
    request = urllib.request.Request(url, headers={"User-Agent": "sunrei-youtube-renewal/1"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
        if compressed:
            body = gzip.decompress(body)
        return json.loads(body.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, gzip.BadGzipFile) as error:
        raise RuntimeError(f"Could not read playlist baseline {url}: {error}") from error


def legacy_baseline(playlist_id, reader=read_remote_json):
    owner_prefix = f"{ARTIFACT_STORE['prefix']}/playlists/{playlist_id}/"
    latest = reader(public_object_url(f"{owner_prefix}latest.json"))
    state_key = latest.get("stateKey", "")
    if latest.get("playlistId") != playlist_id or not state_key.startswith(owner_prefix):
        raise RuntimeError(f"Invalid S3 baseline pointer for playlist {playlist_id}")
    baseline = reader(public_object_url(state_key), compressed=True)
    if (
        baseline.get("schemaVersion") != 1
        or baseline.get("playlistId") != playlist_id
        or not isinstance(baseline.get("knownVideoIds"), list)
    ):
        raise RuntimeError(f"Invalid S3 baseline state for playlist {playlist_id}")
    return baseline


def handled_video_ids(baseline):
    """Videos the old collector finished; a run that stopped at review is not finished."""
    videos = baseline.get("videos", {})
    unfinished = {video_id for video_id, value in videos.items() if value.get("status") not in HANDLED_STATUSES}
    handled = set(baseline["knownVideoIds"]) - unfinished
    handled.update(video_id for video_id, value in videos.items() if value.get("status") in HANDLED_STATUSES)
    return handled


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    api_key = load_google_api_key()
    if not api_key:
        raise RuntimeError("No YouTube API key found in YOUTUBE_API_KEY or application-local.conf")
    api = CollectionApi()
    # A playlist whose first sync failed has no lastSyncedAt and is migrated again.
    registered = {playlist["id"] for playlist in api.list_playlists() if playlist.get("lastSyncedAt")}
    print(f"mode={'commit' if args.commit else 'dry-run'} api={api.base_url}")

    for legacy in LEGACY_PLAYLISTS:
        playlist_id = legacy["id"]
        if playlist_id in registered:
            print(f"{playlist_id}: already registered, skipped")
            continue
        handled = handled_video_ids(legacy_baseline(playlist_id))
        remote = fetch_playlist(api_key, playlist_id)
        queued = [item for item in remote["videos"] if item["videoId"] not in handled]
        print(
            f"{remote['title']} [{'sync' if legacy['enabled'] else 'off'}]: "
            f"remote={len(remote['videos'])} skipped={len(remote['videos']) - len(queued)} pending={len(queued)}"
        )
        for item in queued:
            print(f"  [pending] {item['videoId']} {item['title']}")
        if not args.commit:
            continue

        details = fetch_video_details(api_key, [item["videoId"] for item in remote["videos"]])
        api.upsert_playlist(playlist_id, playlist_input(remote, legacy["sunreiId"], legacy["enabled"]))
        api.sync_playlist_videos(playlist_id, video_inputs(remote, details), initial_status="SKIPPED")
        for item in queued:
            api.update_video(item["videoId"], status="PENDING")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
