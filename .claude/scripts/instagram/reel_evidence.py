"""Transcribe and OCR downloaded Instagram reels as evidence for place extraction.

For each {shortcode}.mp4 in VIDEO_DIR, writes EVIDENCE_DIR/{shortcode}.json with
the Whisper transcript and the on-screen text. OCR reads the whole frame,
because reels put shop names and captions anywhere, not only at the bottom like
YouTube subtitles. Each distinct text is kept once with the time range it was
on screen. Existing results are skipped, so a rerun resumes.

Usage:
    uv run --python 3.11 --with openai-whisper --with easyocr --with opencv-python-headless \
        python .claude/scripts/instagram/reel_evidence.py VIDEO_DIR EVIDENCE_DIR \
        [--only CODE ...] [--whisper-model small] [--interval 1.0] [--force]
"""

import argparse
import json
import re
import subprocess
import sys
import time
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "youtube"))
from extract_onscreen_text import is_noise  # noqa: E402

MIN_CONFIDENCE = 0.3
SAME_TEXT_RATIO = 0.85
PERSISTENT_SHARE = 0.8


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video_dir", type=Path)
    parser.add_argument("evidence_dir", type=Path)
    parser.add_argument("--only", nargs="+", default=None)
    parser.add_argument("--whisper-model", default="small")
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--langs", default="ko,en")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def has_audio(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    return bool(result.stdout.strip())


def transcribe(model, path):
    result = model.transcribe(str(path), language="ko", fp16=False)
    segments = [
        {"start": round(s["start"], 1), "end": round(s["end"], 1), "text": s["text"].strip()}
        for s in result.get("segments", []) if s["text"].strip()
    ]
    return {"language": result.get("language"), "segments": segments}


def ocr(reader, path, interval):
    import cv2

    capture = cv2.VideoCapture(str(path))
    fps = capture.get(cv2.CAP_PROP_FPS) or 30
    duration = capture.get(cv2.CAP_PROP_FRAME_COUNT) / fps
    texts, frames, timestamp = [], 0, 0.0
    while timestamp <= duration:
        capture.set(cv2.CAP_PROP_POS_FRAMES, int(timestamp * fps))
        ok, frame = capture.read()
        if not ok:
            break
        frames += 1
        boxes = []
        for box, text, confidence in reader.readtext(frame):
            text = re.sub(r"\s+", " ", text).strip()
            if confidence >= MIN_CONFIDENCE and not is_noise(text):
                top, left = min(p[1] for p in box), min(p[0] for p in box)
                boxes.append((top, left, text, confidence))
        for _, _, text, confidence in sorted(boxes):
            match = next((t for t in texts if SequenceMatcher(None, t["text"], text).ratio() >= SAME_TEXT_RATIO), None)
            if match:
                match["end"] = round(timestamp, 1)
                match["frames"] += 1
                if confidence > match["confidence"]:
                    match["text"], match["confidence"] = text, round(confidence, 2)
            else:
                texts.append({"text": text, "start": round(timestamp, 1), "end": round(timestamp, 1),
                              "frames": 1, "confidence": round(confidence, 2)})
        timestamp += interval
    capture.release()
    # Text on nearly every frame is a watermark or a fixed frame label.
    texts = [t for t in texts if frames < 5 or t["frames"] <= frames * PERSISTENT_SHARE]
    return {"duration": round(duration, 1), "frames": frames, "segments": sorted(texts, key=lambda t: t["start"])}


def main():
    args = parse_args()
    args.evidence_dir.mkdir(parents=True, exist_ok=True)
    videos = sorted(args.video_dir.glob("*.mp4"))
    if args.only:
        videos = [v for v in videos if v.stem in set(args.only)]
    pending = [v for v in videos if args.force or not (args.evidence_dir / f"{v.stem}.json").is_file()]
    print(f"{len(videos)} videos, {len(pending)} to process", flush=True)
    if not pending:
        return

    import easyocr
    import whisper

    model = whisper.load_model(args.whisper_model)
    reader = easyocr.Reader(args.langs.split(","), gpu=False, verbose=False)
    for video in pending:
        started = time.time()
        result = {"shortcode": video.stem, "whisperModel": args.whisper_model, "ocrInterval": args.interval}
        try:
            result["audio"] = transcribe(model, video) if has_audio(video) else {"error": "no audio track"}
        except Exception as error:  # keep OCR even when audio fails
            result["audio"] = {"error": f"{type(error).__name__}: {error}"[:300]}
        try:
            result["onscreen"] = ocr(reader, video, args.interval)
        except Exception as error:
            result["onscreen"] = {"error": f"{type(error).__name__}: {error}"[:300]}
        out = args.evidence_dir / f"{video.stem}.json"
        temporary = out.with_suffix(".tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
        temporary.replace(out)
        audio = result["audio"].get("error") or f"{len(result['audio']['segments'])} speech segments"
        screen = result["onscreen"].get("error") or f"{len(result['onscreen']['segments'])} on-screen texts"
        print(f"{video.stem}: {audio}, {screen} ({time.time() - started:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
