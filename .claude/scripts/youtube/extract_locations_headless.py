"""Extract reviewable location candidates from caption, audio, and video OCR.

This script does not geocode, update a Sunrei, or upload data. It writes
``location_candidates.json`` with ``review_pending`` status.

Usage:
    uv run python .claude/scripts/youtube/extract_locations_headless.py WORKSPACE
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from _common import workspace
from codex_headless import run_structured

SCHEMA_FILE = Path(__file__).with_name("location_candidates.schema.json")
EVIDENCE_FILES = {
    "captions": "captions.json",
    "audio": "audio_transcript.json",
    "onscreen": "onscreen_text.json",
}
CONFIDENCE = {"low": 0, "medium": 1, "high": 2}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace")
    parser.add_argument("--window-seconds", type=float, default=1200)
    parser.add_argument("--overlap-seconds", type=float, default=10)
    parser.add_argument("--model")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--restart", action="store_true")
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


def sha256_files(paths):
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda value: value.name):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def unwrap_video(value, video_id=None):
    if not isinstance(value, dict):
        return {}
    if value.get("videoId"):
        return value
    for video in value.get("videos", []):
        if video_id is None or video.get("videoId") == video_id:
            return video
    return {}


def load_metadata(ws):
    for file_name in ("metadata.json", "video_info.json"):
        path = ws / file_name
        if path.is_file():
            value = read_json(path)
            if value.get("type") == "video" or value.get("videoId"):
                return value
    raise FileNotFoundError(f"No single-video metadata found in {ws}")


def load_evidence(ws, video_id):
    evidence = {}
    paths = []
    for source, file_name in EVIDENCE_FILES.items():
        path = ws / file_name
        if not path.is_file():
            continue
        paths.append(path)
        video = unwrap_video(read_json(path), video_id)
        if video.get("segments"):
            evidence[source] = video

    # Prefer the human-reviewed transcript whenever it exists. Pending reviews
    # are content-equivalent to the source; accepted corrections then flow into
    # a restarted location extraction without changing this interface.
    transcript_path = ws / "transcripts.reviewed.json"
    if transcript_path.is_file():
        paths.append(transcript_path)
        video = unwrap_video(read_json(transcript_path), video_id)
        if video.get("segments"):
            evidence["captions"] = video
    return evidence, paths


def segment_end(segment):
    start = float(segment.get("start") or 0)
    if segment.get("end") is not None:
        return float(segment["end"])
    return start + float(segment.get("duration") or 0)


def duration_of(evidence):
    return max(
        (segment_end(segment) for video in evidence.values() for segment in video.get("segments", [])),
        default=0,
    )


def windows(duration, size, overlap):
    if duration <= 0:
        yield 0.0, 0.0
        return
    start = 0.0
    while start < duration:
        end = min(duration, start + size)
        yield start, end
        if end >= duration:
            break
        start = max(start + 1, end - overlap)


def evidence_window(evidence, start, end):
    result = {}
    for source, video in evidence.items():
        segments = []
        for segment in video.get("segments", []):
            segment_start = float(segment.get("start") or 0)
            if segment_end(segment) < start or segment_start > end:
                continue
            segments.append(
                {
                    "text": segment.get("text", ""),
                    "start": segment_start,
                    "end": segment_end(segment),
                }
            )
        if segments:
            result[source] = segments
    return result


def make_prompt(metadata, evidence, start, end):
    payload = {
        "videoId": metadata.get("videoId") or metadata.get("id"),
        "title": metadata.get("title", ""),
        "channelName": metadata.get("channelName", ""),
        "description": metadata.get("description", "")[:12000],
        "window": {"startSeconds": start, "endSeconds": end},
        "evidence": evidence_window(evidence, start, end),
    }
    return """Extract real places that are visited, filmed, or presented as a
destination in this YouTube video. Return only JSON matching the supplied
schema. Do not run commands, inspect files, browse the web, or geocode.

Use the title and description together with all available caption, audio, and
on-screen OCR evidence. A place supported by a creator-provided description or
multiple modalities is stronger than a name inferred from one corrupted ASR
token. Preserve verified Korean and foreign spellings. Do not translate or
normalize a name when that would hide a source conflict.

Include restaurants, shops, attractions, buildings, viewpoints, and other
specific destinations central to the video. Exclude places mentioned only as a
comparison, generic streets or neighborhoods without a specific destination,
the creator's home, sponsors, and locations inferred only from background
scenery. Do not invent a venue name from an address, dish, or generic category.

Every location must include at least one verbatim evidence quote. Use
startSeconds 0 for title or description evidence. Mark needsVerification when
sources disagree, the exact business name is uncertain, or only weak OCR/ASR
supports the candidate. Put unresolved conflicts in issues.

Write description as two to five Korean sentences suitable for a Sunrei spot.
Describe why the video visits the place, its relevant atmosphere or geographic
context, and the dishes, preparation, taste, texture, or creator assessment
actually supported by the evidence. Include useful timestamps in parentheses.
Do not turn uncertain ASR wording into a factual claim. Keep reason separate as
a concise explanation of why the place identity is accepted or flagged.

Input:
""" + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def norm_name(value):
    return re.sub(r"[^0-9a-z가-힣ぁ-んァ-ン一-龥]", "", (value or "").lower())


def merge_unique(values):
    output = []
    seen = set()
    for value in values:
        key = json.dumps(value, ensure_ascii=False, sort_keys=True)
        if key not in seen:
            seen.add(key)
            output.append(value)
    return output


def merge_location(existing, incoming):
    existing["aliases"] = merge_unique(existing.get("aliases", []) + incoming.get("aliases", []))
    existing["evidence"] = merge_unique(existing.get("evidence", []) + incoming.get("evidence", []))
    existing["needsVerification"] = bool(
        existing.get("needsVerification") or incoming.get("needsVerification")
    )
    if CONFIDENCE.get(incoming.get("confidence"), -1) > CONFIDENCE.get(existing.get("confidence"), -1):
        existing["confidence"] = incoming["confidence"]
    for field in ("area", "category"):
        if not existing.get(field) and incoming.get(field):
            existing[field] = incoming[field]
    if len(incoming.get("description", "")) > len(existing.get("description", "")):
        existing["description"] = incoming["description"]
    if incoming.get("reason") and incoming["reason"] not in existing.get("reason", ""):
        existing["reason"] = (existing.get("reason", "") + " " + incoming["reason"]).strip()


def extract(metadata, evidence, model, timeout, window_seconds, overlap_seconds):
    results = []
    for start, end in windows(duration_of(evidence), window_seconds, overlap_seconds):
        print(f"location extraction [{start:.0f}:{end:.0f}]", flush=True)
        result = run_structured(
            make_prompt(metadata, evidence, start, end),
            SCHEMA_FILE,
            model=model,
            timeout=timeout,
            temp_prefix="sunrei-location-extract-",
        )
        result["window"] = {"startSeconds": start, "endSeconds": end}
        results.append(result)
    return results


def merge_results(metadata, source_sha, results):
    locations = {}
    issues = []
    concepts = []
    scopes = []
    for result in results:
        if result.get("concept") and result["concept"] not in concepts:
            concepts.append(result["concept"])
        if result.get("geographicScope") and result["geographicScope"] not in scopes:
            scopes.append(result["geographicScope"])
        issues.extend(result.get("issues", []))
        for location in result.get("locations", []):
            key = norm_name(location.get("name"))
            if not key:
                continue
            if key in locations:
                merge_location(locations[key], location)
            else:
                location["decision"] = "pending"
                locations[key] = location
    return {
        "schemaVersion": 1,
        "status": "review_pending",
        "videoId": metadata.get("videoId") or metadata.get("id"),
        "title": metadata.get("title", ""),
        "sourceSha256": source_sha,
        "generatedAt": utc_now(),
        "concept": " / ".join(concepts),
        "geographicScope": " / ".join(scopes),
        "locations": list(locations.values()),
        "issues": merge_unique(issues),
        "windows": [result["window"] for result in results],
    }


def main():
    args = parse_args()
    if args.window_seconds <= 0 or args.overlap_seconds < 0:
        raise ValueError("window-seconds must be positive and overlap-seconds cannot be negative")
    ws = workspace(args.workspace)
    output = ws / "location_candidates.json"
    if output.is_file() and not args.restart:
        print(f"cached -> {output}")
        return

    metadata = load_metadata(ws)
    video_id = metadata.get("videoId") or metadata.get("id")
    evidence, evidence_paths = load_evidence(ws, video_id)
    if not evidence:
        raise ValueError(f"No timed transcript, audio, or OCR evidence found in {ws}")
    metadata_path = ws / ("metadata.json" if (ws / "metadata.json").is_file() else "video_info.json")
    source_sha = sha256_files([metadata_path] + evidence_paths)
    results = extract(
        metadata,
        evidence,
        args.model,
        args.timeout,
        args.window_seconds,
        args.overlap_seconds,
    )
    write_json(output, merge_results(metadata, source_sha, results))
    print(f"review pending -> {output}")


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
