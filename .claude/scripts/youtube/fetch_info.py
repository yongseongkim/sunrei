"""Fetch YouTube video/playlist + channel metadata into a workspace video_info.json.

Usage:
    uv run python .claude/scripts/youtube/fetch_info.py <URL> [--videos all|1,3,5|first:N] [--video]

<URL> may be a video (watch?v=, youtu.be/, /shorts/) or playlist (list=) URL. If the
URL has both v= and list=, the playlist is used; pass --video to force the single video.
--videos selects which playlist entries to keep (1-based indices or first:N; default all).
Writes .claude/workspace/youtube/{ID}/video_info.json in the schema the other skills expect.
"""
import json
import sys
import urllib.parse

from _common import WS_ROOT, http_json, load_google_api_key

API = "https://www.googleapis.com/youtube/v3"


def get(path, params):
    status, body = http_json("GET", f"{API}/{path}?" + urllib.parse.urlencode(params))
    if status != 200:
        print(f"YouTube API {status}: {str(body)[:300]}")
        sys.exit(1)
    return body


def parse_url(url):
    u = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(u.query)
    pl = qs.get("list", [None])[0]
    vid = None
    if "youtu.be" in u.netloc:
        vid = u.path.lstrip("/") or None
    elif qs.get("v"):
        vid = qs["v"][0]
    elif "/shorts/" in u.path:
        vid = u.path.split("/shorts/")[1].split("/")[0]
    return vid, pl


def best_thumb(thumbs):
    t = thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}
    return t.get("url")


def channel_obj(key, channel_id):
    items = get("channels", {"id": channel_id, "part": "snippet", "key": key}).get("items") or []
    if not items:
        return None
    sn = items[0]["snippet"]
    custom = sn.get("customUrl")
    url = f"https://www.youtube.com/{custom}" if custom else f"https://www.youtube.com/channel/{channel_id}"
    return {
        "id": channel_id, "title": sn.get("title"), "handle": custom, "url": url,
        "description": sn.get("description"), "thumbnailUrl": best_thumb(sn.get("thumbnails", {})),
    }


def select(videos, spec):
    if not spec or spec == "all":
        return videos
    if spec.startswith("first:"):
        return videos[:int(spec.split(":", 1)[1])]
    idx = {int(x) for x in spec.split(",") if x.strip()}
    return [v for i, v in enumerate(videos, 1) if i in idx]


def fetch_playlist(key, pl, videos_spec):
    items = get("playlists", {"id": pl, "part": "snippet,contentDetails", "key": key}).get("items") or []
    if not items:
        print(f"Playlist {pl} not found.")
        sys.exit(1)
    sn = items[0]["snippet"]
    vids = []
    page = None
    while True:
        params = {"playlistId": pl, "part": "snippet", "maxResults": 50, "key": key}
        if page:
            params["pageToken"] = page
        resp = get("playlistItems", params)
        for it in resp.get("items", []):
            s = it["snippet"]
            rid = s.get("resourceId", {}).get("videoId")
            if not rid:
                continue
            vids.append({
                "videoId": rid, "title": s.get("title"),
                "channelName": s.get("videoOwnerChannelTitle") or sn.get("channelTitle"),
                "position": s.get("position"),
                "url": f"https://www.youtube.com/watch?v={rid}",
            })
        page = resp.get("nextPageToken")
        if not page:
            break
    selected = select(vids, videos_spec)
    print(f"playlist: {sn.get('title')} — {len(vids)} videos, {len(selected)} selected")
    return pl, {
        "type": "playlist", "id": pl, "title": sn.get("title"),
        "description": sn.get("description"),
        "url": f"https://www.youtube.com/playlist?list={pl}",
        "channelName": sn.get("channelTitle"),
        "channel": channel_obj(key, sn["channelId"]),
        "selectedVideos": selected,
    }


def fetch_video(key, vid):
    items = get("videos", {"id": vid, "part": "snippet,contentDetails", "key": key}).get("items") or []
    if not items:
        print(f"Video {vid} not found.")
        sys.exit(1)
    it = items[0]
    sn = it["snippet"]
    print(f"video: {sn.get('title')} ({sn.get('channelTitle')})")
    return vid, {
        "type": "video", "id": vid, "title": sn.get("title"),
        "description": sn.get("description"), "channelName": sn.get("channelTitle"),
        "channelId": sn["channelId"], "publishedAt": sn.get("publishedAt"),
        "duration": it.get("contentDetails", {}).get("duration"),
        "thumbnailUrl": best_thumb(sn.get("thumbnails", {})),
        "url": f"https://www.youtube.com/watch?v={vid}",
        "channel": channel_obj(key, sn["channelId"]),
    }


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    url = args[0]
    videos_spec = args[args.index("--videos") + 1] if "--videos" in args else None
    force_video = "--video" in args

    key = load_google_api_key()
    if not key:
        print("No Google API key found in application-local.conf.")
        sys.exit(1)

    vid, pl = parse_url(url)
    if pl and not force_video:
        out_id, info = fetch_playlist(key, pl, videos_spec)
    elif vid:
        out_id, info = fetch_video(key, vid)
    else:
        print("Could not find a video or playlist id in the URL.")
        sys.exit(1)

    ws = WS_ROOT / out_id
    ws.mkdir(parents=True, exist_ok=True)
    out = ws / "video_info.json"
    json.dump(info, open(out, "w"), ensure_ascii=False, indent=2)
    print(f"saved -> {out}")


if __name__ == "__main__":
    main()
