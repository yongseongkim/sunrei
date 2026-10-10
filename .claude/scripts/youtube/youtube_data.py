"""YouTube Data API helpers for playlist collection (stdlib only).

The Data API uses an API key and works from datacenter IPs, unlike captions
and media downloads.
"""

import re
import urllib.parse

from _common import http_json

YOUTUBE_API = "https://www.googleapis.com/youtube/v3"
ISO_DURATION = re.compile(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?")


def youtube_get(api_key, resource, params):
    query = dict(params)
    query["key"] = api_key
    url = f"{YOUTUBE_API}/{resource}?{urllib.parse.urlencode(query)}"
    status, body = http_json("GET", url, timeout=60)
    if status != 200:
        raise RuntimeError(f"YouTube API {resource} failed ({status}): {str(body)[:500]}")
    return body or {}


def fetch_playlist(api_key, playlist_id):
    metadata = youtube_get(
        api_key,
        "playlists",
        {"id": playlist_id, "part": "snippet,contentDetails"},
    ).get("items", [])
    if not metadata:
        raise RuntimeError(f"Playlist not found: {playlist_id}")
    playlist_snippet = metadata[0].get("snippet", {})
    videos = []
    page_token = None
    while True:
        params = {
            "playlistId": playlist_id,
            "part": "snippet,contentDetails",
            "maxResults": 50,
        }
        if page_token:
            params["pageToken"] = page_token
        body = youtube_get(api_key, "playlistItems", params)
        for item in body.get("items", []):
            snippet = item.get("snippet", {})
            video_id = (
                item.get("contentDetails", {}).get("videoId")
                or snippet.get("resourceId", {}).get("videoId")
            )
            title = snippet.get("title", "")
            if not video_id or title in {"Deleted video", "Private video"}:
                continue
            videos.append(
                {
                    "videoId": video_id,
                    "title": title,
                    "channelName": snippet.get("videoOwnerChannelTitle")
                    or playlist_snippet.get("channelTitle", ""),
                    "position": snippet.get("position", len(videos)),
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                }
            )
        page_token = body.get("nextPageToken")
        if not page_token:
            break
    return {
        "id": playlist_id,
        "title": playlist_snippet.get("title", ""),
        "description": playlist_snippet.get("description", ""),
        "channelId": playlist_snippet.get("channelId", ""),
        "channelName": playlist_snippet.get("channelTitle", ""),
        "videos": videos,
    }


def best_thumbnail(thumbnails):
    for key in ("maxres", "standard", "high", "medium", "default"):
        if thumbnails.get(key, {}).get("url"):
            return thumbnails[key]["url"]
    return None


def duration_seconds(value):
    match = ISO_DURATION.fullmatch(value or "")
    if not match or not any(match.groups()):
        return None
    days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
    return ((days * 24 + hours) * 60 + minutes) * 60 + seconds


def fetch_video_details(api_key, video_ids):
    output = {}
    for offset in range(0, len(video_ids), 50):
        chunk = video_ids[offset : offset + 50]
        body = youtube_get(
            api_key,
            "videos",
            {"id": ",".join(chunk), "part": "snippet,contentDetails"},
        )
        for item in body.get("items", []):
            snippet = item.get("snippet", {})
            output[item["id"]] = {
                "description": snippet.get("description", ""),
                "publishedAt": snippet.get("publishedAt"),
                "duration": item.get("contentDetails", {}).get("duration"),
                "thumbnailUrl": best_thumbnail(snippet.get("thumbnails", {})),
                "channelId": snippet.get("channelId"),
                "channelName": snippet.get("channelTitle"),
            }
    return output


def video_inputs(remote_playlist, details):
    """Map playlist items and video details to the sync API's video inputs."""
    inputs = []
    for item in remote_playlist["videos"]:
        detail = details.get(item["videoId"], {})
        inputs.append(
            {
                "id": item["videoId"],
                "title": item["title"][:255],
                "description": detail.get("description"),
                "channelId": detail.get("channelId"),
                "channelTitle": detail.get("channelName") or item.get("channelName") or None,
                "publishedAt": detail.get("publishedAt"),
                "durationSeconds": duration_seconds(detail.get("duration")),
                "thumbnailUrl": detail.get("thumbnailUrl"),
                "position": item.get("position"),
            }
        )
    return inputs


def playlist_input(remote_playlist, sunrei_id=None, sync_enabled=None):
    body = {
        "title": remote_playlist["title"][:255] or remote_playlist["id"],
        "description": remote_playlist.get("description") or None,
        "channelId": remote_playlist.get("channelId") or None,
        "channelTitle": remote_playlist.get("channelName") or None,
    }
    if sunrei_id:
        body["sunreiId"] = sunrei_id
    if sync_enabled is not None:
        body["syncEnabled"] = sync_enabled
    return body
