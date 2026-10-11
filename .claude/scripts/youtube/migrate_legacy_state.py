"""Move the legacy file-based collection state into the collection DB (one-off).

The previous collector kept its playlist list in ``youtube-renewal.json`` and
each playlist's handled videos in S3 baselines. This registers those playlists
through the admin API, records videos the baselines already handled as
``SKIPPED``, and queues the rest as ``PENDING``. Videos whose old run stopped at
review are queued again so their candidates reach the admin review screen.

It also imports the committed workspace files under ``.claude/workspace/youtube``:

- ``locations.json`` becomes one extraction run per video. A location that is
  already a spot of the playlist's Sunrei is linked to that spot as
  ``APPROVED``; the rest wait for review as ``PENDING``. Spots of the video
  without a matching location are recorded as approved candidates too, so every
  spot keeps its source video.
- ``transcripts_raw.json`` and ``transcripts.json`` become source and reviewed
  texts, also for the single-video workspaces in ``LEGACY_VIDEO_WORKSPACES``.

The command is a dry run unless ``--commit`` is supplied. It skips playlists
that are already registered and synced, and videos that already have an
extraction run or text, so it can be run again after a failure.

Usage:
    uv run python .claude/scripts/youtube/migrate_legacy_state.py [--commit]
"""

import argparse
import gzip
import json
import sys
import urllib.parse
import urllib.request

from pathlib import Path

from _common import WS_ROOT, load_google_api_key
from collection_api import CollectionApi, CollectionApiError, json_string
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
# Workspaces of single videos that belong to one of the playlists above.
LEGACY_VIDEO_WORKSPACES = ["Bn75Zi-RidE"]
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


def read_workspace(playlist_id, name, root=WS_ROOT):
    path = Path(root) / playlist_id / name
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("videos", [])


def link_video_id(link):
    query = urllib.parse.urlparse(link or "").query
    return urllib.parse.parse_qs(query).get("v", [None])[0]


def link_timestamp(link):
    value = urllib.parse.parse_qs(urllib.parse.urlparse(link or "").query).get("t", [None])[0]
    try:
        return int(str(value).rstrip("s")) if value else None
    except ValueError:
        return None


def spots_by_video(sunrei):
    grouped = {}
    for spot in (sunrei or {}).get("spots", []):
        video_id = link_video_id(spot.get("youtubeLink"))
        if video_id:
            grouped.setdefault(video_id, []).append(spot)
    return grouped


def take_matching_spot(location, spots):
    """Remove and return the spot for a location, matched by Google Maps ID, then name."""
    for key in ("googleMapsId", "name"):
        value = location.get(key)
        if not value:
            continue
        for index, spot in enumerate(spots):
            if spot.get("place", {}).get(key) == value:
                return spots.pop(index)
    return None


def location_place(location, spot):
    timestamp = location.get("timestamp")
    if timestamp is None:
        timestamp = link_timestamp(location.get("videoUrlWithTimestamp"))
    place = None
    if location.get("latitude") is not None and location.get("longitude") is not None:
        place = {
            "name": location["name"][:128],
            "address": location.get("address") or "",
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "googleMapsId": location.get("googleMapsId"),
        }
    return {
        "name": location["name"][:255],
        "description": location.get("description"),
        "reason": location.get("source"),
        "timestampSeconds": timestamp,
        "place": place,
        "geocodeWarning": location.get("geocodeWarning"),
        "sunreiSpotId": spot["id"] if spot else None,
    }


def spot_place(spot):
    place = spot["place"]
    return {
        "name": place["name"][:255],
        "description": spot.get("context"),
        "timestampSeconds": link_timestamp(spot.get("youtubeLink")),
        "place": {
            "name": place["name"][:128],
            "address": place.get("address") or "",
            "latitude": place["latitude"],
            "longitude": place["longitude"],
            "googleMapsId": place.get("googleMapsId"),
        },
        "sunreiSpotId": spot["id"],
    }


def legacy_runs(locations, sunrei, video_ids):
    """Build one extraction run per video from locations.json and the Sunrei's spots."""
    spots = spots_by_video(sunrei)
    runs = {}
    for entry in locations:
        video_id = entry["videoId"]
        if video_id not in video_ids:
            continue
        video_spots = spots.get(video_id, [])
        places = [location_place(location, take_matching_spot(location, video_spots)) for location in entry.get("locations", [])]
        runs[video_id] = {"rawOutput": entry, "places": places}
    for video_id, remaining in spots.items():
        if video_id not in video_ids or not remaining:
            continue
        run = runs.setdefault(video_id, {"rawOutput": None, "places": []})
        run["places"].extend(spot_place(spot) for spot in remaining)
    return runs


def legacy_segments(segments):
    return [
        {
            "start": segment["start"],
            "end": segment["start"] + segment["duration"] if segment.get("duration") is not None else None,
            "text": segment["text"],
        }
        for segment in segments
    ]


def legacy_texts(raw, reviewed, video_ids):
    """Map legacy transcripts to texts: captions or OCR, plus the cleaned transcript.

    Raw captions carry ``source: youtube_captions``; raw OCR output has no source.
    A cleaned transcript is either ``cleanedText`` or the cleaned segments.
    """
    texts = {}
    for entry in raw:
        if entry["videoId"] in video_ids:
            kind = "CAPTIONS" if entry.get("source") == "youtube_captions" else "OCR"
            texts.setdefault(entry["videoId"], []).append(
                {"kind": kind, "language": entry.get("language"), "segments": legacy_segments(entry.get("segments", [])), "full_text": entry.get("fullText")}
            )
    for entry in reviewed:
        if entry["videoId"] not in video_ids:
            continue
        if entry.get("cleanedText"):
            segments, full_text = [], entry["cleanedText"]
        else:
            segments, full_text = legacy_segments(entry.get("segments", [])), entry.get("fullText")
        texts.setdefault(entry["videoId"], []).append(
            {"kind": "TRANSCRIPT_REVIEWED", "language": entry.get("language"), "segments": segments, "full_text": full_text}
        )
    return texts


def import_video(api, video_id, run, texts):
    try:
        detail = api.request("GET", f"/admin/youtube/videos/{video_id}")
    except CollectionApiError as error:
        if error.status == 404:
            print(f"  {video_id}: not registered, skipped")
            return False
        raise
    # Texts and runs are checked separately because a video can appear in two workspaces.
    text_ids = []
    if texts and not detail.get("texts"):
        text_ids = [
            api.create_text(video_id, text["kind"], text["segments"], text["language"], text["full_text"], params={"legacy": True})["id"]
            for text in texts
        ]
    if run is not None and not detail.get("runs"):
        api.create_extraction_run(
            video_id,
            {
                "agent": "skill",
                "inputTextIds": text_ids,
                "status": "SUCCEEDED",
                "rawOutput": json_string(run["rawOutput"]),
                "places": run["places"],
            },
        )
        pending = any(not place.get("sunreiSpotId") for place in run["places"])
        api.update_video(video_id, status="REVIEW_PENDING" if pending else "COMPLETED", stage="review" if pending else "done")
    elif not text_ids:
        return False
    return True


def import_workspace(api, playlist_id, sunrei_id, video_ids, commit):
    """Import committed workspace files of a playlist; returns the video IDs with a run."""
    locations = read_workspace(playlist_id, "locations.json")
    texts_by_video = legacy_texts(
        read_workspace(playlist_id, "transcripts_raw.json"),
        read_workspace(playlist_id, "transcripts.json"),
        video_ids,
    )
    sunrei = None
    if sunrei_id and locations:
        try:
            sunrei = api.request("GET", f"/admin/sunreis/{sunrei_id}")
        except CollectionApiError as error:
            if error.status != 404:
                raise
    runs = legacy_runs(locations, sunrei, video_ids)
    places = [place for run in runs.values() for place in run["places"]]
    linked = sum(1 for place in places if place.get("sunreiSpotId"))
    print(
        f"  workspace: runs={len(runs)} places={len(places)} approved={linked} "
        f"pending={len(places) - linked} texts={sum(len(texts) for texts in texts_by_video.values())}"
    )
    if commit:
        imported = 0
        for video_id in sorted(set(runs) | set(texts_by_video)):
            imported += import_video(api, video_id, runs.get(video_id), texts_by_video.get(video_id, []))
        print(f"  imported {imported} videos")
    return set(runs)


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
        remote = fetch_playlist(api_key, playlist_id)
        video_ids = {item["videoId"] for item in remote["videos"]}
        if playlist_id in registered:
            print(f"{remote['title']}: already registered")
            import_workspace(api, playlist_id, legacy["sunreiId"], video_ids, args.commit)
            continue

        handled = handled_video_ids(legacy_baseline(playlist_id))
        queued = [item for item in remote["videos"] if item["videoId"] not in handled]
        if args.commit:
            details = fetch_video_details(api_key, sorted(video_ids))
            api.upsert_playlist(playlist_id, playlist_input(remote, legacy["sunreiId"], legacy["enabled"]))
            api.sync_playlist_videos(playlist_id, video_inputs(remote, details), initial_status="SKIPPED")
        print(f"{remote['title']} [{'sync' if legacy['enabled'] else 'off'}]: remote={len(remote['videos'])}")
        # A video with an imported run already has its candidates and is not processed again.
        imported = import_workspace(api, playlist_id, legacy["sunreiId"], video_ids, args.commit)
        queued = [item for item in queued if item["videoId"] not in imported]
        print(f"  pending={len(queued)}")
        for item in queued:
            print(f"  [pending] {item['videoId']} {item['title']}")
            if args.commit:
                api.update_video(item["videoId"], status="PENDING")

    for video_id in LEGACY_VIDEO_WORKSPACES:
        print(f"{video_id}:")
        import_workspace(api, video_id, None, {video_id}, args.commit)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
