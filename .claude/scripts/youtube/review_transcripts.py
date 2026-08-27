"""Review transcript segments with Codex headless mode.

The source transcript is never changed. Every proposal is recorded in
``transcript_review.json`` for human approval, and only accepted corrections
are applied to ``transcripts.reviewed.json``.

Usage:
    uv run python .claude/scripts/youtube/review_transcripts.py {ID} \
      --video-id VIDEO_ID
    uv run python .claude/scripts/youtube/review_transcripts.py {ID} --all
"""
import argparse
import copy
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from _common import workspace
from codex_headless import run_structured

SCHEMA_VERSION = 1
SCHEMA_FILE = Path(__file__).with_name("transcript_review.schema.json")
CONFIDENCE_RANK = {"none": 0, "high": 1, "medium": 2}
AUXILIARY_FILES = {
    "audio": "audio_transcript.json",
    "onscreen": "onscreen_text.json",
}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", help="Workspace ID or directory")
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--video-id", action="append", dest="video_ids")
    selection.add_argument("--all", action="store_true", help="Review every non-empty transcript")
    parser.add_argument("--source", default="transcripts.json")
    parser.add_argument("--hints", default="transcript_review_hints.json")
    parser.add_argument("--chunk-size", type=int, default=600)
    parser.add_argument("--max-chars", type=int, default=50000)
    parser.add_argument("--context", type=int, default=3)
    parser.add_argument("--model", help="Codex model; defaults to the configured model")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument(
        "--max-new-chunks",
        type=int,
        help="Stop after this many uncached chunks; useful for staged reviews",
    )
    parser.add_argument(
        "--apply-confidence",
        choices=CONFIDENCE_RANK,
        default="none",
        help="Bulk-apply pending corrections at this confidence (default: none)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print the planned chunks only")
    parser.add_argument("--restart", action="store_true", help="Discard a stale or partial review")
    return parser.parse_args()


def read_json(path):
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write("\n")
    temporary.replace(path)


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_descriptions(ws):
    path = ws / "descriptions.json"
    if not path.is_file():
        return {}
    data = read_json(path)
    if isinstance(data, dict):
        return {
            video_id: value.get("description", "") if isinstance(value, dict) else ""
            for video_id, value in data.items()
        }
    return {}


def load_hints(path):
    if not path.is_file():
        return {"global": [], "videos": {}}
    data = read_json(path)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return {
        "global": data.get("global", []),
        "videos": data.get("videos", {}),
    }


def video_hints(hints, video_id):
    values = list(hints.get("global", []))
    specific = hints.get("videos", {}).get(video_id, [])
    if isinstance(specific, dict):
        specific = specific.get("canonicalEntities", [])
    values.extend(specific)
    return [value for value in values if isinstance(value, str) and value.strip()]


def load_auxiliary_evidence(ws):
    evidence = {}
    for source, file_name in AUXILIARY_FILES.items():
        path = ws / file_name
        if not path.is_file():
            continue
        value = read_json(path)
        videos = value.get("videos", []) if isinstance(value, dict) else []
        if isinstance(value, dict) and value.get("videoId"):
            videos = [value]
        for video in videos:
            video_id = video.get("videoId")
            if video_id:
                evidence.setdefault(video_id, {})[source] = video
    return evidence


def segment_end(segment):
    start = float(segment.get("start") or 0)
    if segment.get("end") is not None:
        return float(segment["end"])
    return start + float(segment.get("duration") or 0)


def auxiliary_excerpt(evidence, window_start, window_end, max_chars=20000):
    output = {}
    for source, video in evidence.items():
        selected = []
        characters = 0
        for segment in video.get("segments", []):
            start = float(segment.get("start") or 0)
            if segment_end(segment) < window_start or start > window_end:
                continue
            text = segment.get("text", "")
            if selected and characters + len(text) > max_chars:
                break
            selected.append({"text": text, "start": start, "end": segment_end(segment)})
            characters += len(text)
        if selected:
            output[source] = selected
    return output


def make_chunks(segments, chunk_size, max_chars):
    start = 0
    while start < len(segments):
        end = start
        characters = 0
        while end < len(segments) and end - start < chunk_size:
            size = len(segments[end].get("text", ""))
            if end > start and characters + size > max_chars:
                break
            characters += size
            end += 1
        yield start, end
        start = end


def make_prompt(video, description, hints, start, end, context, auxiliary=None):
    segments = video["segments"]
    context_start = max(0, start - context)
    context_end = min(len(segments), end + context)
    excerpt = [
        {
            "segmentIndex": index,
            "text": segments[index].get("text", ""),
            "start": segments[index].get("start"),
            "target": start <= index < end,
        }
        for index in range(context_start, context_end)
    ]
    window_start = max(0, float(segments[context_start].get("start") or 0) - 5)
    window_end = segment_end(segments[context_end - 1]) + 5
    payload = {
        "videoId": video["videoId"],
        "title": video.get("title", ""),
        "language": video.get("language", ""),
        "description": description[:4000],
        "canonicalEntityHints": hints,
        "targetRange": {"startInclusive": start, "endExclusive": end},
        "segments": excerpt,
        "auxiliaryEvidence": auxiliary_excerpt(auxiliary or {}, window_start, window_end),
    }
    return """You are reviewing a Korean YouTube transcript produced by ASR or OCR.

Return only JSON matching the supplied schema. Do not run commands, inspect
files, or use tools.

Review only segments whose target field is true. The other segments are context.
Correct only recognition errors that are clear from the title, description,
canonical entity hints, repetition in the transcript, and neighboring segments.
Prioritize wrong person, place, restaurant, dish, and brand names, malformed
Korean words, omitted syllables, and corrupted Korean/English mixtures.

Rules:
- Preserve the spoken meaning, tone, and segment boundaries.
- Never merge, split, add, or remove segments. Do not change timestamps.
- Do not translate or remove legitimate foreign names, English terms, units,
  acronyms, or Korean particles attached to them.
- Do not rewrite a sentence merely to make the speaker more formal or polished.
- Do not correct ordinary spacing or punctuation unless it is part of a clear
  recognition error. Prefer a flag over reconstructing speech from plausibility.
- Audio and on-screen OCR are corroborating evidence. Prefer wording supported
  by more than one source, but keep a flag when the sources conflict.
- A title spelling such as `나폴리맛피아` can identify a person or brand; do not
  globally replace an ordinary word such as `마피아` when context differs.
- Copy originalText exactly from the input.
- Use corrections for high- or medium-confidence fixes. Put ambiguous passages
  in flags and leave suggestion empty when the intended wording is unknown.
- canonicalEntity is the verified spelling involved in a correction, or an
  empty string when the correction is not an entity.

Input:
""" + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def run_codex(prompt, model, timeout):
    return run_structured(
        prompt,
        SCHEMA_FILE,
        model=model,
        timeout=timeout,
        temp_prefix="sunrei-transcript-review-",
    )


def validate_result(result, video, start, end):
    segments = video["segments"]
    accepted = []
    flags = []
    rejected = []
    seen = set()

    for correction in result.get("corrections", []):
        index = correction.get("segmentIndex")
        reason = None
        if not isinstance(index, int) or not start <= index < end:
            reason = "segmentIndex is outside the target range"
        elif index in seen:
            reason = "duplicate correction for the segment"
        elif correction.get("originalText") != segments[index].get("text", ""):
            reason = "originalText does not match the source segment"
        elif not correction.get("correctedText", "").strip():
            reason = "correctedText is empty"
        elif correction.get("correctedText") == correction.get("originalText"):
            reason = "correctedText is unchanged"
        else:
            original_length = len(correction["originalText"])
            corrected_length = len(correction["correctedText"])
            if corrected_length > max(original_length * 3, original_length + 80):
                reason = "correctedText is unexpectedly long"

        if reason:
            rejected.append({"proposal": correction, "reason": reason})
            continue
        seen.add(index)
        accepted.append(correction)

    for flag in result.get("flags", []):
        index = flag.get("segmentIndex")
        if not isinstance(index, int) or not start <= index < end:
            rejected.append({"proposal": flag, "reason": "flag is outside the target range"})
        elif flag.get("text") != segments[index].get("text", ""):
            rejected.append({"proposal": flag, "reason": "flag text does not match the source"})
        else:
            flags.append(flag)
    return accepted, flags, rejected


def new_review(ws, source_path, source_sha):
    return {
        "schemaVersion": SCHEMA_VERSION,
        "workspaceId": ws.name,
        "source": {"file": source_path.name, "sha256": source_sha},
        "updatedAt": utc_now(),
        "videos": {},
    }


def load_review(path, ws, source_path, source_sha, restart):
    if restart or not path.is_file():
        return new_review(ws, source_path, source_sha)
    review = read_json(path)
    if review.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path} uses a different schema version; rerun with --restart")
    if review.get("source", {}).get("sha256") != source_sha:
        raise ValueError(f"{source_path} changed after the review began; rerun with --restart")
    return review


def update_cleaned_text(video, corrections):
    full_text = video.get("fullText") or " ".join(
        segment.get("text", "") for segment in video["segments"]
    )
    cleaned = video.get("cleanedText") or full_text
    segment_offsets = []
    offset = 0
    for segment in video["segments"]:
        segment_offsets.append(offset)
        offset += len(segment.get("text", "")) + 1

    replacements = []
    claimed = []
    for correction in corrections:
        original = correction["originalText"]
        candidates = [
            match.start()
            for match in re.finditer(re.escape(original), cleaned)
            if not any(match.start() < end and match.end() > start for start, end in claimed)
        ]
        if not candidates:
            correction["cleanedTextWarning"] = "original text was not found in cleanedText"
            continue
        expected = int(
            segment_offsets[correction["segmentIndex"]]
            * len(cleaned)
            / max(len(full_text), 1)
        )
        position = min(candidates, key=lambda candidate: abs(candidate - expected))
        end = position + len(original)
        claimed.append((position, end))
        replacements.append((position, end, correction["correctedText"]))
        correction.pop("cleanedTextWarning", None)

    for start, end, corrected in sorted(replacements, reverse=True):
        cleaned = cleaned[:start] + corrected + cleaned[end:]
    return cleaned


def update_reviewed_transcript(source, review, apply_confidence):
    reviewed = copy.deepcopy(source)
    video_by_id = {video["videoId"]: video for video in reviewed.get("videos", [])}
    threshold = CONFIDENCE_RANK[apply_confidence]

    for video_id, video_review in review.get("videos", {}).items():
        video = video_by_id.get(video_id)
        if not video:
            continue
        applied = []
        for correction in video_review.get("corrections", []):
            decision = correction.setdefault("decision", "pending")
            should_apply = decision == "accept" or (
                decision == "pending"
                and CONFIDENCE_RANK.get(correction.get("confidence"), 99) <= threshold
            )
            correction["applied"] = should_apply
            if not should_apply:
                continue
            index = correction["segmentIndex"]
            segment = video["segments"][index]
            if segment.get("text", "") != correction["originalText"]:
                correction["applied"] = False
                correction["applyError"] = "source segment no longer matches"
                continue
            applied.append(correction)
            correction.pop("applyError", None)

        if not applied:
            continue
        cleaned = update_cleaned_text(video, applied)
        for correction in applied:
            video["segments"][correction["segmentIndex"]]["text"] = correction["correctedText"]
        video["fullText"] = " ".join(segment.get("text", "") for segment in video["segments"])
        video["cleanedText"] = cleaned
    return reviewed


def main():
    args = parse_args()
    if args.chunk_size < 1 or args.max_chars < 1 or args.context < 0:
        raise ValueError("chunk-size and max-chars must be positive; context cannot be negative")
    if not SCHEMA_FILE.is_file():
        raise FileNotFoundError(SCHEMA_FILE)

    ws = workspace(args.workspace)
    source_path = ws / args.source
    if not source_path.is_file():
        raise FileNotFoundError(source_path)
    source = read_json(source_path)
    source_sha = sha256_file(source_path)
    descriptions = load_descriptions(ws)
    hints = load_hints(ws / args.hints)
    auxiliary = load_auxiliary_evidence(ws)
    review_path = ws / "transcript_review.json"
    reviewed_path = ws / "transcripts.reviewed.json"
    review = load_review(review_path, ws, source_path, source_sha, args.restart)

    requested = set(args.video_ids or [])
    videos = []
    for video in source.get("videos", []):
        if not video.get("segments"):
            continue
        if args.all or video.get("videoId") in requested:
            videos.append(video)
            requested.discard(video.get("videoId"))
    if requested:
        raise ValueError(f"video IDs not found or empty: {', '.join(sorted(requested))}")

    planned = sum(1 for video in videos for _ in make_chunks(video["segments"], args.chunk_size, args.max_chars))
    print(f"reviewing {len(videos)} videos in {planned} chunks", flush=True)
    if args.dry_run:
        for video in videos:
            chunks = list(make_chunks(video["segments"], args.chunk_size, args.max_chars))
            print(f"{video['videoId']}: {len(video['segments'])} segments -> {chunks}")
        return

    completed_now = 0
    limit_reached = False
    for video in videos:
        video_id = video["videoId"]
        entry = review["videos"].setdefault(
            video_id,
            {
                "title": video.get("title", ""),
                "segmentCount": len(video["segments"]),
                "processedChunks": [],
                "corrections": [],
                "flags": [],
                "rejected": [],
            },
        )
        completed = {
            (chunk["startInclusive"], chunk["endExclusive"])
            for chunk in entry.get("processedChunks", [])
        }
        for start, end in make_chunks(video["segments"], args.chunk_size, args.max_chars):
            if (start, end) in completed:
                print(f"{video_id} [{start}:{end}] cached", flush=True)
                continue
            if args.max_new_chunks is not None and completed_now >= args.max_new_chunks:
                limit_reached = True
                break
            prompt = make_prompt(
                video,
                descriptions.get(video_id, ""),
                video_hints(hints, video_id),
                start,
                end,
                args.context,
                auxiliary.get(video_id, {}),
            )
            print(f"{video_id} [{start}:{end}] running Codex", flush=True)
            result = run_codex(prompt, args.model, args.timeout)
            corrections, flags, rejected = validate_result(result, video, start, end)
            completed_at = utc_now()
            for item in corrections:
                item.update(
                    {
                        "decision": "pending",
                        "chunkStart": start,
                        "chunkEnd": end,
                        "reviewedAt": completed_at,
                    }
                )
            for item in flags:
                item.update({"chunkStart": start, "chunkEnd": end, "reviewedAt": completed_at})
            for item in rejected:
                item.update({"chunkStart": start, "chunkEnd": end, "reviewedAt": completed_at})
            entry["corrections"].extend(corrections)
            entry["flags"].extend(flags)
            entry["rejected"].extend(rejected)
            entry["processedChunks"].append(
                {
                    "startInclusive": start,
                    "endExclusive": end,
                    "completedAt": completed_at,
                    "promptSha256": hashlib.sha256(prompt.encode()).hexdigest(),
                }
            )
            review["updatedAt"] = completed_at
            reviewed = update_reviewed_transcript(source, review, args.apply_confidence)
            write_json(review_path, review)
            write_json(reviewed_path, reviewed)
            completed_now += 1
            print(
                f"{video_id} [{start}:{end}] {len(corrections)} corrections, "
                f"{len(flags)} flags, {len(rejected)} rejected",
                flush=True,
            )
        if limit_reached:
            break

    reviewed = update_reviewed_transcript(source, review, args.apply_confidence)
    write_json(review_path, review)
    write_json(reviewed_path, reviewed)
    correction_count = sum(len(value.get("corrections", [])) for value in review["videos"].values())
    flag_count = sum(len(value.get("flags", [])) for value in review["videos"].values())
    print(
        f"done: {completed_now} new chunks, {correction_count} corrections, "
        f"{flag_count} flags -> {reviewed_path}",
        flush=True,
    )


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
