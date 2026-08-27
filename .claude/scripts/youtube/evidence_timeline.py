"""Build a timestamped transcript, Whisper, and OCR evidence timeline.

The input JSON files remain unchanged. The resulting
``evidence_timeline.json`` is the normalized source passed to location
extraction and stored in S3 for debugging.

Usage:
    uv run python .claude/scripts/youtube/evidence_timeline.py RUN_DIR
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from _common import workspace

OUTPUT_FILE = "evidence_timeline.json"
RAW_INPUT_FILES = (
    "metadata.json",
    "captions.json",
    "audio_transcript.json",
    "onscreen_text.json",
)
SOURCE_FILES = {
    "transcript": (
        "transcripts.reviewed.json",
        "transcripts.json",
        "captions.json",
    ),
    "whisper": ("audio_transcript.json",),
    "ocr": ("onscreen_text.json",),
}
SOURCE_ORDER = {"transcript": 0, "whisper": 1, "ocr": 2}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", help="Workspace ID or run directory")
    parser.add_argument("--video-id")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def read_json(path):
    with Path(path).open(encoding="utf-8") as file:
        return json.load(file)


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write("\n")
    temporary.replace(path)


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def unwrap_video(value, video_id=None):
    if not isinstance(value, dict):
        return {}
    if value.get("videoId"):
        return value
    for video in value.get("videos", []):
        if video_id is None or video.get("videoId") == video_id:
            return video
    return {}


def segment_end(segment):
    start = float(segment.get("start") or 0)
    if segment.get("end") is not None:
        return float(segment["end"])
    return start + float(segment.get("duration") or 0)


def input_records(run_dir):
    records = []
    input_names = list(RAW_INPUT_FILES)
    for candidates in SOURCE_FILES.values():
        for file_name in candidates:
            if file_name not in input_names:
                input_names.append(file_name)
    for file_name in input_names:
        path = run_dir / file_name
        if not path.is_file():
            continue
        value = read_json(path)
        error = value.get("error") if isinstance(value, dict) else None
        records.append(
            {
                "file": file_name,
                "sha256": sha256_file(path),
                "status": "error" if error else "ready",
                **({"error": str(error)} if error else {}),
            }
        )
    return records


def input_fingerprint(records):
    digest = hashlib.sha256()
    for record in sorted(records, key=lambda value: value["file"]):
        digest.update(record["file"].encode())
        digest.update(record["sha256"].encode())
    return digest.hexdigest()


def selected_source(run_dir, candidates):
    for file_name in candidates:
        path = run_dir / file_name
        if path.is_file():
            return path
    return None


def normalized_segments(video):
    segments = []
    for segment in video.get("segments", []):
        text = str(segment.get("text") or "").strip()
        if not text:
            continue
        start = float(segment.get("start") or 0)
        event = {
            "startSeconds": round(start, 3),
            "endSeconds": round(max(start, segment_end(segment)), 3),
            "text": text,
        }
        if segment.get("confidence") is not None:
            event["confidence"] = float(segment["confidence"])
        segments.append(event)
    return segments


def segments_fingerprint(segments):
    normalized = json.dumps(segments, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode()).hexdigest()


def build_timeline(run_dir, video_id):
    run_dir = Path(run_dir)
    records = input_records(run_dir)
    sources = {}
    events = []
    seen_segments = {}

    for source, candidates in SOURCE_FILES.items():
        path = selected_source(run_dir, candidates)
        if path is None:
            sources[source] = {"status": "missing"}
            continue
        value = read_json(path)
        video = unwrap_video(value, video_id)
        error = video.get("error") or (
            value.get("error") if isinstance(value, dict) else None
        )
        if error:
            sources[source] = {
                "status": "error",
                "file": path.name,
                "sha256": sha256_file(path),
                "error": str(error),
            }
            continue
        segments = normalized_segments(video)
        if not segments:
            sources[source] = {
                "status": "empty",
                "file": path.name,
                "sha256": sha256_file(path),
                "segmentCount": 0,
            }
            continue
        fingerprint = segments_fingerprint(segments)
        summary = {
            "status": "ready",
            "file": path.name,
            "sha256": sha256_file(path),
            "language": video.get("language", "unknown"),
            "segmentCount": len(segments),
        }
        if video.get("source"):
            summary["origin"] = video["source"]
        if fingerprint in seen_segments:
            summary["status"] = "duplicate"
            summary["duplicateOf"] = seen_segments[fingerprint]
            sources[source] = summary
            continue
        seen_segments[fingerprint] = source
        sources[source] = summary
        for segment in segments:
            events.append({"source": source, **segment})

    events.sort(
        key=lambda event: (
            event["startSeconds"],
            SOURCE_ORDER[event["source"]],
            event["endSeconds"],
            event["text"],
        )
    )
    return {
        "schemaVersion": 1,
        "videoId": video_id,
        "generatedAt": utc_now(),
        "inputFingerprint": input_fingerprint(records),
        "inputs": records,
        "sources": sources,
        "durationSeconds": max(
            (event["endSeconds"] for event in events),
            default=0,
        ),
        "events": events,
    }


def ensure_timeline(run_dir, video_id, force=False):
    run_dir = Path(run_dir)
    output = run_dir / OUTPUT_FILE
    records = input_records(run_dir)
    fingerprint = input_fingerprint(records)
    if output.is_file() and not force:
        cached = read_json(output)
        if (
            cached.get("schemaVersion") == 1
            and cached.get("videoId") == video_id
            and cached.get("inputFingerprint") == fingerprint
        ):
            return cached, output
    value = build_timeline(run_dir, video_id)
    write_json(output, value)
    return value, output


def main():
    args = parse_args()
    run_dir = workspace(args.workspace)
    metadata_path = run_dir / "metadata.json"
    metadata = read_json(metadata_path) if metadata_path.is_file() else {}
    video_id = args.video_id or metadata.get("videoId") or metadata.get("id")
    if not video_id:
        raise ValueError("No video ID was supplied or found in metadata.json")
    timeline, output = ensure_timeline(run_dir, video_id, force=args.force)
    ready = sum(1 for source in timeline["sources"].values() if source["status"] == "ready")
    print(
        f"timeline: {len(timeline['events'])} events, {ready} distinct sources -> {output}"
    )


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
