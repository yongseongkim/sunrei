"""Build a timestamped transcript, Whisper, and OCR evidence timeline.

The input JSON files remain unchanged. The resulting
``evidence_timeline.json`` is the normalized source passed to location
extraction and stored as the video's ``TIMELINE`` text by ``renew_playlists.py``.

Usage:
    uv run python .claude/scripts/youtube/evidence_timeline.py RUN_DIR
"""

import argparse
import importlib.util
import json
import sys
from functools import lru_cache
from pathlib import Path

from _common import workspace
from stage_store import StageStore
from video_analysis_plugin import skill_directory


@lru_cache(maxsize=1)
def evidence_builder():
    script = skill_directory() / "scripts/video_evidence.py"
    spec = importlib.util.spec_from_file_location("video_analysis_evidence", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_timeline(run_dir, video_id):
    return evidence_builder().build_timeline(run_dir, video_id)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", help="Workspace ID or run directory")
    parser.add_argument("--video-id")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def ensure_timeline(run_dir, video_id, force=False):
    run_dir = Path(run_dir)
    builder = evidence_builder()
    output = run_dir / builder.OUTPUT_FILE
    fingerprint = builder.input_fingerprint(builder.input_records(run_dir), video_id)
    store = StageStore(run_dir, video_id)
    code = [Path(__file__), Path(builder.__file__)]
    value = store.run("timeline", {"inputFingerprint": fingerprint}, code,
                      lambda: builder.build_timeline(run_dir, video_id), force=force)
    builder.write_json(output, value)
    return value, output


def main():
    args = parse_args()
    run_dir = workspace(args.workspace)
    metadata_path = run_dir / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.is_file() else {}
    video_id = args.video_id or metadata.get("videoId") or metadata.get("id")
    if args.video_id and (metadata.get("videoId") or metadata.get("id")) not in (None, args.video_id):
        raise ValueError("Requested video ID differs from metadata")
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
    except (FileNotFoundError, ValueError, RuntimeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
