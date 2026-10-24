"""Collect new videos from registered YouTube playlists into the Sunrei DB.

Playlists, videos, and their processing status live behind the admin YouTube
API, so the collector runs anywhere that reaches it (``SUNREI_API_URL``).
The command is a dry run unless ``--commit`` is supplied. A committed run syncs
each playlist's videos, collects captions, a Whisper transcript, and video OCR
for pending videos, runs the transcript and location agents, and stores every
text and extraction run through the API. Candidates wait for admin review, so
no Sunrei is changed here. A video whose audio and video downloads are refused
as members-only is stored as ``SKIPPED`` and never retried.

Usage:
    uv run python .claude/scripts/youtube/renew_playlists.py
    uv run python .claude/scripts/youtube/renew_playlists.py --commit [--max-videos N] [--playlist ID]
"""

import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import geocode
from _common import ROOT, WS_ROOT, load_env, load_google_api_key
from collection_api import CollectionApi, json_string
from youtube_data import fetch_playlist, fetch_video_details, video_inputs

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG = ROOT / ".claude" / "config" / "youtube-renewal.json"
AUTOMATION_ROOT = Path(
    os.environ.get("SUNREI_YOUTUBE_AUTOMATION_ROOT", WS_ROOT / "automation")
)
RUNS_ROOT = AUTOMATION_ROOT / "runs"
PROCESSABLE = {"PENDING", "FAILED"}
EVIDENCE_TEXTS = (
    ("captions", "CAPTIONS"),
    ("audio", "WHISPER"),
    ("onscreen", "OCR"),
)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--playlist", action="append", dest="playlist_ids")
    parser.add_argument("--max-videos", type=int)
    parser.add_argument(
        "--stale-hours",
        type=float,
        default=24,
        help="Treat PROCESSING videos untouched this long as interrupted",
    )
    parser.add_argument("--commit", action="store_true", help="Sync playlists and process pending videos")
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


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


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


# yt-dlp는 멤버십 전용 영상을 "Join this channel to get access to members-only content"로 거부한다.
MEMBERS_ONLY_MARKER = "members-only"


class MembersOnlyVideo(RuntimeError):
    """멤버십 전용 영상은 수집하지 않기로 해서 FAILED가 아니라 SKIPPED로 끝낸다."""


def is_members_only_error(value):
    error = value.get("error") if isinstance(value, dict) else None
    return bool(error) and MEMBERS_ONLY_MARKER in str(error).lower()


def is_members_only(evidence):
    # 자막 실패는 판정에 넣지 않는다.
    # youtube-transcript-api는 같은 사유를 다른 문구로 감싼다.
    # 자막만 실패한 경우는 IP 차단이나 자막 없음과 구분되지 않는다.
    if any(has_segments(value) for value in evidence.values()):
        return False
    downloads = [
        evidence.get(source)
        for source in ("audio", "onscreen")
        if not (isinstance(evidence.get(source), dict) and evidence[source].get("error") == "disabled")
    ]
    return bool(downloads) and all(is_members_only_error(value) for value in downloads)


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


CODEX_SDK = "openai-codex==0.160.0"


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


def text_segments(segments):
    return [
        {
            "start": segment["start"],
            "end": segment["start"] + segment["duration"],
            "text": segment["text"],
        }
        for segment in segments
    ]


def evidence_params(source, evidence_config):
    if source == "captions":
        return {"tool": "youtube-transcript-api"}
    if source == "audio":
        return {"tool": "openai-whisper", "model": evidence_config.get("whisperModel", "base")}
    return {
        "tool": "easyocr",
        "languages": evidence_config.get("ocrLanguages", ["ko", "en"]),
        "intervalSeconds": evidence_config.get("ocrIntervalSeconds", 1.0),
    }


def store_evidence_texts(api, video_id, evidence, evidence_config):
    """Store each usable evidence source and record failed ones as attempts."""
    text_ids = []
    for source, kind in EVIDENCE_TEXTS:
        value = evidence[source]
        if not has_segments(value):
            error = value.get("error") if isinstance(value, dict) else None
            if error and error != "disabled":
                api.update_video(video_id, stage=source, error=str(error)[-2000:])
            continue
        segments = normalized_segments(value)
        created = api.create_text(
            video_id,
            kind,
            segments=text_segments(segments),
            language=value.get("language"),
            full_text=" ".join(segment["text"] for segment in segments),
            payload={key: item for key, item in value.items() if key != "segments"} or None,
            params=evidence_params(source, evidence_config),
        )
        text_ids.append(created["id"])
    return text_ids


def store_review_texts(api, video_id, run_dir):
    text_ids = []
    reviewed_path = run_dir / "transcripts.reviewed.json"
    if reviewed_path.is_file():
        video = read_json(reviewed_path)["videos"][0]
        segments = normalized_segments(video)
        created = api.create_text(
            video_id,
            "TRANSCRIPT_REVIEWED",
            segments=text_segments(segments),
            language=video.get("language"),
            full_text=video.get("cleanedText") or video.get("fullText"),
            payload={"source": video.get("source")},
        )
        text_ids.append(created["id"])
    review_path = run_dir / "transcript_review.json"
    if review_path.is_file():
        created = api.create_text(video_id, "TRANSCRIPT_REVIEW", payload=read_json(review_path))
        text_ids.append(created["id"])
    return text_ids


def store_timeline_text(api, video_id, run_dir):
    timeline = read_json(run_dir / "evidence_timeline.json")
    created = api.create_text(
        video_id,
        "TIMELINE",
        segments=[
            {
                "start": event["startSeconds"],
                "end": event["endSeconds"],
                "text": event["text"],
                "source": event["source"],
            }
            for event in timeline.get("events", [])
        ],
        payload={key: value for key, value in timeline.items() if key != "events"},
    )
    return created["id"]


def suggested_place(api_key, location):
    """Return a geocoded place suggestion and a warning for the reviewer."""
    name = location.get("name", "")
    if not api_key:
        return None, "geocode skipped: no Google API key"
    if geocode.looks_like_non_name(name):
        return None, "name looks like hours/phone/address; needs a real venue name"
    # 상호 없이 메뉴와 지역으로 검색하면 근처 아무 가게나 돌아오므로, 검토자가 웹 리서치로 장소를 정하게 둔다.
    if geocode.looks_unnamed(name):
        return None, geocode.UNNAMED_WARNING
    result, error = geocode.search(api_key, f"{name} {location.get('area', '')}".strip())
    if error:
        return None, f"geocode failed: {error}"
    if result.get("latitude") is None or result.get("longitude") is None:
        return None, "geocode returned no coordinates"
    place = {
        "name": (result.get("displayName") or name)[:128],
        "address": (result.get("address") or "")[:255],
        "latitude": result["latitude"],
        "longitude": result["longitude"],
        "googleMapsId": result.get("googleMapsId"),
    }
    warning = geocode.venue_warning(
        name, result.get("displayName"), location.get("area") or "", result.get("address") or "", location.get("aliases") or ()
    )
    return place, warning


def first_timestamp(evidence):
    timed = [
        item["startSeconds"]
        for item in evidence
        if item.get("source") not in {"title", "description"} and item.get("startSeconds", 0) > 0
    ]
    return int(min(timed)) if timed else None


def place_inputs(candidates, api_key):
    places = []
    for location in candidates.get("locations", []):
        evidence = [
            {
                "source": item["source"],
                "quote": item["quote"],
                "startSeconds": float(item.get("startSeconds") or 0),
            }
            for item in location.get("evidence", [])
        ]
        place, warning = suggested_place(api_key, location)
        places.append(
            {
                "name": location["name"][:255],
                "aliases": location.get("aliases", []),
                "category": location.get("category") or None,
                "area": location.get("area") or None,
                "description": location.get("description") or None,
                "evidence": evidence,
                "confidence": (location.get("confidence") or "").upper() or None,
                "needsVerification": bool(location.get("needsVerification")),
                "reason": location.get("reason") or None,
                "timestampSeconds": first_timestamp(evidence),
                "place": place,
                "geocodeWarning": warning,
            }
        )
    return places


def run_agents(candidates):
    agents = []
    for window in candidates.get("windows", []):
        if window.get("agent") and window["agent"] not in agents:
            agents.append(window["agent"])
    return ",".join(agents) or "unknown"


def configured_agents():
    return os.environ.get("STRUCTURED_AGENTS", "codex,claude")


def run_metadata(playlist, video, item):
    return {
        "type": "video",
        "id": video["id"],
        "videoId": video["id"],
        "title": video["title"],
        "description": video.get("description") or "",
        "channelId": video.get("channelId") or "",
        "channelName": video.get("channelTitle") or item.get("channelName", ""),
        "publishedAt": video.get("publishedAt"),
        "position": item.get("position"),
        "playlistId": playlist["id"],
        "playlistTitle": playlist["title"],
        "url": f"https://www.youtube.com/watch?v={video['id']}",
    }


def process_video(api, config, playlist, video, item, api_key, progress):
    """Collect evidence and candidates for one video and store them through the API.

    Returns the number of stored place candidates. Local files under
    ``RUNS_ROOT`` cache finished steps until the video is stored.
    """
    video_id = video["id"]
    run_dir = RUNS_ROOT / video_id
    run_dir.mkdir(parents=True, exist_ok=True)
    metadata = run_metadata(playlist, video, item)
    write_json(run_dir / "metadata.json", metadata)
    write_json(
        run_dir / "descriptions.json",
        {video_id: {"videoId": video_id, "title": metadata["title"], "description": metadata["description"]}},
    )
    evidence_config = config["defaults"]["evidence"]

    def advance(stage, **fields):
        progress["stage"] = stage
        api.update_video(video_id, stage=stage, **fields)

    advance("evidence", status="PROCESSING", error="")
    evidence = collect_evidence(run_dir, metadata, evidence_config)
    text_ids = store_evidence_texts(api, video_id, evidence, evidence_config)
    if is_members_only(evidence):
        raise MembersOnlyVideo("members-only video: captions, audio, and video are not accessible")
    write_primary_transcript(
        run_dir,
        metadata,
        evidence["captions"],
        evidence["audio"],
        evidence["onscreen"],
    )

    advance("transcript_review")
    run_checked(
        command_uv(
            "--with",
            CODEX_SDK,
            "python",
            str(SCRIPT_DIR / "review_transcripts.py"),
            str(run_dir),
            "--all",
            "--chunk-size",
            str(config["defaults"].get("transcriptReviewChunkSize", 600)),
        ),
        7200,
    )
    text_ids += store_review_texts(api, video_id, run_dir)

    advance("timeline")
    run_checked(
        command_uv("python", str(SCRIPT_DIR / "evidence_timeline.py"), str(run_dir)),
        120,
    )
    text_ids.insert(0, store_timeline_text(api, video_id, run_dir))

    advance("extraction")
    started_at = utc_now()
    try:
        run_checked(
            command_uv(
                "--with",
                CODEX_SDK,
                "python",
                str(SCRIPT_DIR / "extract_locations_headless.py"),
                str(run_dir),
            ),
            7200,
        )
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        api.create_extraction_run(
            video_id,
            {
                "agent": configured_agents(),
                "inputTextIds": text_ids,
                "status": "FAILED",
                "error": str(error)[-2000:],
                "startedAt": started_at,
                "finishedAt": utc_now(),
            },
        )
        raise
    candidates = read_json(run_dir / "location_candidates.json")

    advance("geocode")
    places = place_inputs(candidates, api_key)
    api.create_extraction_run(
        video_id,
        {
            "agent": run_agents(candidates),
            "promptSha256": candidates.get("promptSha256"),
            "inputTextIds": text_ids,
            "status": "SUCCEEDED",
            "rawOutput": json_string(candidates),
            "startedAt": started_at,
            "finishedAt": candidates.get("generatedAt") or utc_now(),
            "places": places,
        },
    )
    api.update_video(
        video_id,
        status="REVIEW_PENDING" if places else "COMPLETED",
        stage="review" if places else "done",
        error="",
    )
    shutil.rmtree(run_dir, ignore_errors=True)
    return len(places)


def record_outcome(api, video_id, **fields):
    try:
        api.update_video(video_id, **fields)
    except RuntimeError as error:
        print(f"  could not record the outcome of {video_id}: {error}", file=sys.stderr)


def run_video(api, config, playlist, video, item, api_key):
    # FAILED는 다음 실행이 다시 집어 가지만 SKIPPED는 그대로 남는다.
    # 멤버십 전용은 실패로 세지 않는다.
    progress = {"stage": "evidence"}
    try:
        count = process_video(api, config, playlist, video, item, api_key, progress)
    except MembersOnlyVideo as error:
        print(f"  skipped: {video['id']}: {error}")
        record_outcome(api, video["id"], status="SKIPPED", stage=progress["stage"], error=str(error))
        # 실패한 영상의 run dir은 다음 실행이 이어서 쓰도록 남기고, 끝난 영상은 지운다.
        shutil.rmtree(RUNS_ROOT / video["id"], ignore_errors=True)
        return "skipped"
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"  failed: {video['id']}: {error}", file=sys.stderr)
        record_outcome(
            api,
            video["id"],
            status="FAILED",
            stage=progress["stage"],
            error=str(error)[-2000:] or "failed",
        )
        return "failed"
    print(f"  stored {count} candidates: {video['id']}")
    return "stored"


def selected_playlists(api, selected_ids):
    playlists = api.list_playlists()
    if not selected_ids:
        return [playlist for playlist in playlists if playlist["syncEnabled"]]
    by_id = {playlist["id"]: playlist for playlist in playlists}
    missing = [playlist_id for playlist_id in selected_ids if playlist_id not in by_id]
    if missing:
        raise ValueError(
            f"Unregistered playlists: {', '.join(missing)}; add them with youtube_playlists.py add"
        )
    return [by_id[playlist_id] for playlist_id in selected_ids]


def reset_stale_processing(api, playlist_id, stale_hours):
    """Mark videos left PROCESSING by an interrupted run as FAILED so they are retried."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=stale_hours)
    for video in api.list_videos(playlist_id=playlist_id, status="PROCESSING"):
        if parse_time(video["updatedAt"]) < cutoff:
            api.update_video(
                video["id"],
                status="FAILED",
                error=f"interrupted during {video.get('stage') or 'processing'}",
            )
            print(f"  [stale] {video['id']} -> FAILED")


def processing_order(videos):
    """Process new videos before retrying failures, each in playlist order."""
    return sorted(videos, key=lambda video: video["status"] == "FAILED")


def dry_run_playlist(api, playlist, remote):
    stored = {video["id"]: video for video in api.list_videos(playlist_id=playlist["id"])}
    new = [item for item in remote["videos"] if item["videoId"] not in stored]
    pending = [
        video
        for item in remote["videos"]
        for video in [stored.get(item["videoId"])]
        if video and video["status"] in PROCESSABLE
    ]
    remote_ids = {item["videoId"] for item in remote["videos"]}
    removed = [video_id for video_id in stored if video_id not in remote_ids]
    print(
        f"{playlist['title']}: remote={len(remote['videos'])} stored={len(stored)} "
        f"new={len(new)} pending={len(pending)} removed={len(removed)}"
    )
    for item in new:
        print(f"  [new] {item['videoId']} {item['title']}")
    for video in pending:
        print(f"  [{video['status'].lower()}] {video['id']} {video['title']}")


def main():
    args = parse_args()
    config = read_json(args.config)
    if config.get("schemaVersion") != 2:
        raise ValueError(f"Unsupported config schema in {args.config}")
    api_key = load_google_api_key()
    if not api_key:
        raise RuntimeError(
            "No YouTube API key found in YOUTUBE_API_KEY, GOOGLE_MAPS_API_KEY, "
            "or application-local.conf"
        )
    max_videos = args.max_videos or config["defaults"].get("maxNewVideosPerRun", 2)
    if max_videos < 1:
        raise ValueError("max-videos must be positive")
    api = CollectionApi()
    playlists = selected_playlists(api, args.playlist_ids)
    remaining = max_videos
    had_failures = False
    print(
        f"mode={'commit' if args.commit else 'dry-run'} api={api.base_url} "
        f"playlists={len(playlists)} maxVideos={max_videos}"
    )

    for playlist in playlists:
        try:
            remote = fetch_playlist(api_key, playlist["id"])
        except RuntimeError as error:
            had_failures = True
            print(f"{playlist['title']}: blocked: {error}", file=sys.stderr)
            continue
        if not args.commit:
            dry_run_playlist(api, playlist, remote)
            continue

        details = fetch_video_details(api_key, [item["videoId"] for item in remote["videos"]])
        reset_stale_processing(api, playlist["id"], args.stale_hours)
        result = api.sync_playlist_videos(playlist["id"], video_inputs(remote, details))
        pending = processing_order(result["pendingVideos"])
        print(
            f"{playlist['title']}: remote={len(remote['videos'])} "
            f"added={len(result['addedVideoIds'])} removed={len(result['removedVideoIds'])} "
            f"pending={len(pending)}"
        )
        items = {item["videoId"]: item for item in remote["videos"]}
        chosen = pending[:remaining]
        for index, video in enumerate(chosen):
            if index:
                delay = config["defaults"].get("captionDelaySeconds", {})
                time.sleep(random.uniform(delay.get("min", 60), delay.get("max", 90)))
            print(f"  [{video['status'].lower()}] {video['id']} {video['title']}", flush=True)
            outcome = run_video(api, config, playlist, video, items.get(video["id"], {}), api_key)
            had_failures = had_failures or outcome == "failed"
        remaining -= len(chosen)

    if had_failures:
        raise RuntimeError("One or more playlists could not be collected; see the errors above")


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, KeyError, ValueError, RuntimeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
