"""Discover and prepare new videos from configured YouTube playlists.

The command is a dry run unless ``--commit`` is supplied. A committed run
collects captions, a Whisper transcript, and video OCR; runs the isolated Codex
transcript and location reviewers; and stops at ``review_pending``. Add
``--upload`` to store the JSON artifacts in S3. It reads production Sunrei spots
to avoid duplicate processing, but never changes the Admin API or a Sunrei.

Usage:
    uv run python .claude/scripts/youtube/renew_playlists.py
    uv run python .claude/scripts/youtube/renew_playlists.py --commit [--upload]
"""

import argparse
import copy
import gzip
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from _common import (
    ROOT,
    WS_ROOT,
    admin_api,
    admin_token,
    http_json,
    load_env,
    load_google_api_key,
)

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG = ROOT / ".claude" / "config" / "youtube-renewal.json"
AUTOMATION_ROOT = Path(
    os.environ.get("SUNREI_YOUTUBE_AUTOMATION_ROOT", WS_ROOT / "automation")
)
STATE_FILE = AUTOMATION_ROOT / "state.json"
RUNS_ROOT = AUTOMATION_ROOT / "runs"
YOUTUBE_API = "https://www.googleapis.com/youtube/v3"
YOUTUBE_VIDEO_ID = re.compile(
    r"(?:[?&]v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})"
)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--state", type=Path, default=STATE_FILE)
    parser.add_argument("--playlist", action="append", dest="playlist_ids")
    parser.add_argument("--max-videos", type=int)
    parser.add_argument("--bootstrap", action="store_true", help="Mark current remote videos as known")
    parser.add_argument("--commit", action="store_true", help="Write state and process new videos")
    parser.add_argument("--upload", action="store_true", help="Upload review-pending JSON artifacts")
    return parser.parse_args()


def read_json(path):
    with Path(path).open(encoding="utf-8") as file:
        return json.load(file)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write("\n")
    temporary.replace(path)


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_run_id():
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


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
                    "playlistAddedAt": snippet.get("publishedAt"),
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                }
            )
        page_token = body.get("nextPageToken")
        if not page_token:
            break
    return {
        "id": playlist_id,
        "title": playlist_snippet.get("title", ""),
        "channelId": playlist_snippet.get("channelId", ""),
        "channelName": playlist_snippet.get("channelTitle", ""),
        "videos": videos,
    }


def best_thumbnail(thumbnails):
    for key in ("maxres", "standard", "high", "medium", "default"):
        if thumbnails.get(key, {}).get("url"):
            return thumbnails[key]["url"]
    return None


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


def existing_video_ids(playlist_id):
    path = WS_ROOT / playlist_id / "video_info.json"
    if not path.is_file():
        return []
    value = read_json(path)
    return [
        video.get("videoId")
        for video in value.get("selectedVideos", [])
        if video.get("videoId")
    ]


def youtube_video_id(link):
    if not isinstance(link, str):
        return None
    value = link.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        return value
    match = YOUTUBE_VIDEO_ID.search(value)
    return match.group(1) if match else None


def production_video_ids(sunrei_id, token):
    status, body = admin_api(
        "GET", f"/admin/sunreis/{sunrei_id}", token, prod=True
    )
    if status != 200 or not isinstance(body, dict):
        raise RuntimeError(
            f"Production Sunrei baseline GET failed for {sunrei_id} "
            f"(HTTP {status}): {str(body)[:500]}"
        )
    spots = body.get("spots")
    if not isinstance(spots, list):
        raise RuntimeError(f"Production Sunrei {sunrei_id} has no spots array")
    return sorted(
        {
            video_id
            for spot in spots
            if isinstance(spot, dict)
            for video_id in [youtube_video_id(spot.get("youtubeLink"))]
            if video_id
        }
    )


def load_state(path):
    if not path.is_file():
        return {"schemaVersion": 1, "updatedAt": None, "playlists": {}}
    value = read_json(path)
    if value.get("schemaVersion") != 1:
        raise ValueError(f"Unsupported state schema in {path}")
    return value


def public_object_url(bucket, region, key):
    encoded = urllib.parse.quote(key, safe="/")
    return f"https://{bucket}.s3.{region}.amazonaws.com/{encoded}"


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


def restore_state_from_baselines(config, playlists, reader=read_remote_json):
    store = config["artifactStore"]
    bucket = store["bucket"]
    region = store["region"]
    root_prefix = store["prefix"].strip("/")
    state = {
        "schemaVersion": 1,
        "updatedAt": utc_now(),
        "restoredFrom": "s3_playlist_baselines",
        "playlists": {},
    }
    for playlist in playlists:
        playlist_id = playlist["id"]
        owner_prefix = f"{root_prefix}/playlists/{playlist_id}/"
        latest_key = f"{owner_prefix}latest.json"
        latest = reader(public_object_url(bucket, region, latest_key))
        state_key = latest.get("stateKey", "")
        if latest.get("playlistId") != playlist_id or not state_key.startswith(owner_prefix):
            raise RuntimeError(f"Invalid S3 baseline pointer for playlist {playlist_id}")
        playlist_baseline = reader(
            public_object_url(bucket, region, state_key), compressed=True
        )
        if (
            playlist_baseline.get("schemaVersion") != 1
            or playlist_baseline.get("playlistId") != playlist_id
            or not isinstance(playlist_baseline.get("knownVideoIds"), list)
        ):
            raise RuntimeError(f"Invalid S3 baseline state for playlist {playlist_id}")
        state["playlists"][playlist_id] = {
            key: value
            for key, value in playlist_baseline.items()
            if key not in {"schemaVersion", "playlistId"}
        }
    return state


def playlist_state(state, playlist_id):
    return state["playlists"].setdefault(
        playlist_id,
        {
            "knownVideoIds": existing_video_ids(playlist_id),
            "videos": {},
            "lastCheckedAt": None,
            "remoteVideoCount": None,
        },
    )


def discover(remote_videos, current_state, external_known=None):
    known = set(current_state.get("knownVideoIds", []))
    known.update(external_known or [])
    known.update(
        video_id
        for video_id, value in current_state.get("videos", {}).items()
        if value.get("status") in {"review_pending", "approved"}
    )
    pending_ids = {
        video_id
        for video_id, value in current_state.get("videos", {}).items()
        if value.get("status") not in {"review_pending", "approved"}
    }
    by_id = {video["videoId"]: video for video in remote_videos}
    pending = [by_id[video_id] for video_id in pending_ids if video_id in by_id]
    new = [
        video
        for video in remote_videos
        if video["videoId"] not in known and video["videoId"] not in pending_ids
    ]
    return sorted(pending, key=lambda video: video.get("position", 0)) + sorted(
        new, key=lambda video: video.get("position", 0)
    )


def parse_json_output(output):
    decoder = json.JSONDecoder()
    candidates = []
    for index, character in enumerate(output):
        if character != "{":
            continue
        try:
            value, consumed = decoder.raw_decode(output[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            top_level_shape = int(
                bool(value.get("videoId"))
                and (isinstance(value.get("segments"), list) or bool(value.get("error")))
            )
            candidates.append((top_level_shape, consumed, value))
    if not candidates:
        raise RuntimeError(f"Command did not return a JSON object: {output[-1000:]}")
    return max(candidates, key=lambda candidate: (candidate[0], candidate[1]))[2]


def child_environment():
    env = os.environ.copy()
    local = load_env()
    for name in ("SUNREI_YT_COOKIES", "SUNREI_YT_BROWSER"):
        if local.get(name) and not env.get(name):
            env[name] = local[name]
    return env


def run_json_command(command, timeout):
    result = subprocess.run(
        command,
        text=True,
        capture_output=True,
        env=child_environment(),
        timeout=timeout,
    )
    if result.returncode != 0:
        details = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"Command failed ({result.returncode}): {details[-2000:]}")
    return parse_json_output(result.stdout)


def cached_or_run(path, command, timeout):
    if path.is_file():
        cached = read_json(path)
        valid_shape = bool(cached.get("videoId")) and (
            isinstance(cached.get("segments"), list) or bool(cached.get("error"))
        )
        if valid_shape and not cached.get("error"):
            return cached
    value = run_json_command(command, timeout)
    write_json(path, value)
    return value


def attempt_json(path, command, timeout, video_id):
    try:
        return cached_or_run(path, command, timeout)
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        value = {"videoId": video_id, "error": str(error)[-2000:]}
        write_json(path, value)
        return value


def normalized_segments(video):
    segments = []
    for segment in video.get("segments", []):
        start = float(segment.get("start") or 0)
        duration = segment.get("duration")
        if duration is None and segment.get("end") is not None:
            duration = max(0, float(segment["end"]) - start)
        segments.append(
            {
                "text": segment.get("text", ""),
                "start": start,
                "duration": float(duration or 0),
            }
        )
    return segments


def has_segments(value):
    return isinstance(value, dict) and bool(value.get("segments")) and not value.get("error")


def write_primary_transcript(run_dir, metadata, captions, audio, onscreen):
    primary = captions if has_segments(captions) else audio if has_segments(audio) else onscreen
    if not has_segments(primary):
        raise RuntimeError("Captions, audio transcription, and OCR all produced no segments")
    source = (
        "youtube_captions"
        if primary is captions
        else "whisper"
        if primary is audio
        else "ocr_frames"
    )
    segments = normalized_segments(primary)
    full_text = " ".join(segment["text"] for segment in segments)
    value = {
        "videos": [
            {
                "videoId": metadata["videoId"],
                "title": metadata.get("title", ""),
                "language": primary.get("language", "unknown"),
                "source": source,
                "segments": segments,
                "fullText": full_text,
                "cleanedText": full_text,
                "approved": False,
            }
        ]
    }
    write_json(run_dir / "transcripts.json", value)
    return value


def command_uv(*args):
    return ["uv", "run", *args]


def collect_evidence(run_dir, metadata, evidence_config):
    video_id = metadata["videoId"]
    video_url = metadata["url"]
    results = {}
    if evidence_config.get("captions", True):
        results["captions"] = attempt_json(
            run_dir / "captions.json",
            command_uv(
                "--with",
                "youtube-transcript-api",
                "--with",
                "python-dotenv",
                "python",
                str(SCRIPT_DIR / "extract_transcript.py"),
                video_id,
            ),
            600,
            video_id,
        )
    else:
        results["captions"] = {"videoId": video_id, "error": "disabled"}

    if evidence_config.get("audio", True):
        results["audio"] = attempt_json(
            run_dir / "audio_transcript.json",
            command_uv(
                "--python",
                "3.11",
                "--with",
                "yt-dlp",
                "--with",
                "openai-whisper",
                "python",
                str(SCRIPT_DIR / "whisper_transcribe.py"),
                video_url,
                evidence_config.get("whisperModel", "base"),
            ),
            7200,
            video_id,
        )
    else:
        results["audio"] = {"videoId": video_id, "error": "disabled"}

    if evidence_config.get("videoOcr", True):
        languages = ",".join(evidence_config.get("ocrLanguages", ["ko", "en"]))
        results["onscreen"] = attempt_json(
            run_dir / "onscreen_text.json",
            command_uv(
                "--python",
                "3.11",
                "--with",
                "easyocr",
                "--with",
                "opencv-python-headless",
                "--with",
                "yt-dlp",
                "python",
                str(SCRIPT_DIR / "extract_onscreen_text.py"),
                video_url,
                "--lang",
                languages,
                "--interval",
                str(evidence_config.get("ocrIntervalSeconds", 1.0)),
            ),
            7200,
            video_id,
        )
    else:
        results["onscreen"] = {"videoId": video_id, "error": "disabled"}
    return results


def run_checked(command, timeout):
    result = subprocess.run(
        command,
        text=True,
        capture_output=True,
        env=child_environment(),
        timeout=timeout,
    )
    if result.returncode != 0:
        details = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"Command failed ({result.returncode}): {details[-2000:]}")
    if result.stdout.strip():
        print(result.stdout.strip(), flush=True)


def update_run_manifest(run_dir, metadata, status, stages, error=None):
    value = {
        "schemaVersion": 1,
        "playlistId": metadata["playlistId"],
        "videoId": metadata["videoId"],
        "runId": metadata["runId"],
        "status": status,
        "updatedAt": utc_now(),
        "stages": stages,
    }
    if error:
        value["error"] = error
    write_json(run_dir / "run_manifest.json", value)


def process_video(
    config,
    config_path,
    playlist,
    remote_playlist,
    item,
    details,
    record,
    state,
    state_path,
    upload,
):
    run_id = record.get("runId") or new_run_id()
    run_dir = RUNS_ROOT / playlist["id"] / item["videoId"] / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    metadata = {
        "type": "video",
        "id": item["videoId"],
        "videoId": item["videoId"],
        "playlistId": playlist["id"],
        "playlistTitle": remote_playlist["title"],
        "locationStrategy": playlist.get("locationStrategy", "multimodal"),
        "runId": run_id,
        **item,
        **details,
    }
    write_json(run_dir / "metadata.json", metadata)
    write_json(
        run_dir / "descriptions.json",
        {item["videoId"]: {"videoId": item["videoId"], "title": item["title"], "description": metadata.get("description", "")}},
    )
    record.update(
        {
            "runId": run_id,
            "status": "collecting",
            "title": item.get("title", ""),
            "position": item.get("position"),
            "runDirectory": str(run_dir.relative_to(AUTOMATION_ROOT)),
            "updatedAt": utc_now(),
        }
    )
    state["updatedAt"] = utc_now()
    write_json(state_path, state)
    stages = {"metadata": "completed", "evidence": "running"}
    update_run_manifest(run_dir, metadata, "collecting", stages)

    evidence = collect_evidence(run_dir, metadata, config["defaults"]["evidence"])
    write_primary_transcript(
        run_dir,
        metadata,
        evidence["captions"],
        evidence["audio"],
        evidence["onscreen"],
    )
    stages["evidence"] = "completed"
    record["status"] = "reviewing"
    record["updatedAt"] = utc_now()
    write_json(state_path, state)
    update_run_manifest(run_dir, metadata, "reviewing", stages)

    run_checked(
        command_uv(
            "python",
            str(SCRIPT_DIR / "review_transcripts.py"),
            str(run_dir),
            "--all",
            "--chunk-size",
            str(config["defaults"].get("transcriptReviewChunkSize", 600)),
        ),
        7200,
    )
    stages["transcriptReview"] = "completed"
    run_checked(
        command_uv(
            "python",
            str(SCRIPT_DIR / "evidence_timeline.py"),
            str(run_dir),
        ),
        120,
    )
    stages["evidenceTimeline"] = "completed"
    record["status"] = "extracting_locations"
    record["updatedAt"] = utc_now()
    write_json(state_path, state)
    update_run_manifest(run_dir, metadata, "extracting_locations", stages)

    run_checked(
        command_uv(
            "python",
            str(SCRIPT_DIR / "extract_locations_headless.py"),
            str(run_dir),
        ),
        7200,
    )
    stages["locationCandidates"] = "completed"

    if upload:
        record["status"] = "uploading"
        record["updatedAt"] = utc_now()
        write_json(state_path, state)
        update_run_manifest(run_dir, metadata, "uploading", stages)
        run_checked(
            command_uv(
                "--with",
                "boto3",
                "python",
                str(SCRIPT_DIR / "upload_artifacts.py"),
                str(run_dir),
                "--playlist-id",
                playlist["id"],
                "--video-id",
                item["videoId"],
                "--run-id",
                run_id,
                "--config",
                str(config_path),
                "--commit",
            ),
            900,
        )
        stages["artifactUpload"] = "completed"

    record["status"] = "review_pending"
    record["updatedAt"] = utc_now()
    record.pop("error", None)
    update_run_manifest(run_dir, metadata, "review_pending", stages)


def main():
    args = parse_args()
    if args.upload and not args.commit:
        raise ValueError("--upload requires --commit")
    config = read_json(args.config)
    if config.get("schemaVersion") != 1:
        raise ValueError(f"Unsupported config schema in {args.config}")
    selected = set(args.playlist_ids or [])
    playlists = [
        playlist
        for playlist in config.get("playlists", [])
        if (playlist.get("enabled") or playlist["id"] in selected)
        and (not selected or playlist["id"] in selected)
    ]
    missing = selected - {playlist["id"] for playlist in config.get("playlists", [])}
    if missing:
        raise ValueError(f"Unknown playlists: {', '.join(sorted(missing))}")
    state = load_state(args.state)
    missing_baselines = [
        playlist
        for playlist in playlists
        if playlist["id"] not in state["playlists"]
    ]
    if missing_baselines and not args.bootstrap:
        restored = restore_state_from_baselines(config, missing_baselines)
        state["playlists"].update(restored["playlists"])
        state["restoredFrom"] = restored["restoredFrom"]
        state["updatedAt"] = restored["updatedAt"]
        print(f"restored {len(missing_baselines)} playlist baselines from S3")
    working_state = state if args.commit else copy.deepcopy(state)
    api_key = load_google_api_key()
    if not api_key:
        raise RuntimeError(
            "No YouTube API key found in YOUTUBE_API_KEY, GOOGLE_MAPS_API_KEY, "
            "or application-local.conf"
        )
    max_videos = args.max_videos or config["defaults"].get("maxNewVideosPerRun", 2)
    if max_videos < 1:
        raise ValueError("max-videos must be positive")
    remaining = max_videos
    had_failures = False
    print(f"mode={'commit' if args.commit else 'dry-run'} playlists={len(playlists)} maxVideos={max_videos}")

    for playlist in playlists:
        current = playlist_state(working_state, playlist["id"])
        remote = fetch_playlist(api_key, playlist["id"])
        current["lastCheckedAt"] = utc_now()
        current["remoteVideoCount"] = len(remote["videos"])
        production_ids = []
        if playlist.get("sunreiId"):
            try:
                token = admin_token()
                if not token:
                    raise RuntimeError(
                        "Could not resolve an Admin API token for the production baseline"
                    )
                production_ids = production_video_ids(playlist["sunreiId"], token)
            except RuntimeError as error:
                had_failures = True
                current["productionBaselineError"] = str(error)
                print(f"{playlist['name']}: blocked: {error}", file=sys.stderr)
                continue
            current["productionVideoIds"] = production_ids
            current["productionCheckedAt"] = utc_now()
            current.pop("productionBaselineError", None)
        if args.bootstrap:
            current["knownVideoIds"] = [video["videoId"] for video in remote["videos"]]
            current["videos"] = {}
            print(
                f"{playlist['name']}: bootstrap {len(remote['videos'])} known videos "
                f"production={len(production_ids)}"
            )
            continue

        candidates = discover(remote["videos"], current, production_ids)
        remote_ids = {video["videoId"] for video in remote["videos"]}
        removed_count = sum(
            1 for video_id in current.get("knownVideoIds", []) if video_id not in remote_ids
        )
        print(
            f"{playlist['name']}: remote={len(remote['videos'])} "
            f"known={len(current.get('knownVideoIds', []))} "
            f"production={len(production_ids)} "
            f"pending/new={len(candidates)} removed={removed_count}"
        )
        for item in candidates:
            marker = "retry" if item["videoId"] in current.get("videos", {}) else "new"
            print(f"  [{marker}] {item['videoId']} {item['title']}")
        if not args.commit or remaining <= 0:
            continue

        chosen = candidates[:remaining]
        details = fetch_video_details(api_key, [item["videoId"] for item in chosen])
        for item in chosen:
            video_id = item["videoId"]
            record = current["videos"].setdefault(video_id, {"status": "discovered"})
            try:
                process_video(
                    config,
                    args.config,
                    playlist,
                    remote,
                    item,
                    details.get(video_id, {}),
                    record,
                    working_state,
                    args.state,
                    args.upload,
                )
                if video_id not in current["knownVideoIds"]:
                    current["knownVideoIds"].append(video_id)
                print(f"  review pending: {video_id}")
            except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
                had_failures = True
                record["status"] = "failed"
                record["error"] = str(error)[-2000:]
                record["updatedAt"] = utc_now()
                print(f"  failed: {video_id}: {error}", file=sys.stderr)
            working_state["updatedAt"] = utc_now()
            write_json(args.state, working_state)
            remaining -= 1
            if remaining <= 0:
                break

        delay = config["defaults"].get("captionDelaySeconds", {})
        if remaining > 0 and chosen:
            time.sleep(random.uniform(delay.get("min", 60), delay.get("max", 90)))

    if args.commit:
        working_state["updatedAt"] = utc_now()
        write_json(args.state, working_state)
        print(f"state -> {args.state}")
    if had_failures:
        raise RuntimeError("One or more playlists could not be renewed; see the errors above")


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, KeyError, ValueError, RuntimeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
