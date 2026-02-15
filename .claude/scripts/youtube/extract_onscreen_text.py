"""Extract on-screen text from YouTube video frames using OCR.

3rd fallback when YouTube captions and Whisper STT both fail.
Uses yt-dlp + opencv + easyocr to read burned-in subtitles and annotations.

Usage:
    python extract_onscreen_text.py "<video_id_or_url>" [--lang ko,ja,en] [--interval 1.0]

Outputs JSON to stdout.
"""

import json
import os
import re
import sys
import tempfile
from collections import Counter, defaultdict
from difflib import SequenceMatcher

# Load env from sunrei-worker/.env if it exists
WORKER_ENV = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "sunrei-worker", ".env"
)
if os.path.exists(WORKER_ENV):
    from dotenv import load_dotenv
    load_dotenv(WORKER_ENV)


def extract_video_id(url: str) -> str | None:
    """Extract video ID from YouTube URL."""
    patterns = [
        r"(?:v=|/v/|youtu\.be/)([a-zA-Z0-9_-]{11})",
        r"^([a-zA-Z0-9_-]{11})$",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


# Noise patterns to filter out
NOISE_PATTERNS = [
    re.compile(r"구독", re.IGNORECASE),
    re.compile(r"좋아요", re.IGNORECASE),
    re.compile(r"subscribe", re.IGNORECASE),
    re.compile(r"\blike\b", re.IGNORECASE),
    re.compile(r"@\w+"),  # @handles
    re.compile(r"https?://\S+"),  # URLs
    re.compile(r"www\.\S+"),  # URLs without protocol
    re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$"),  # Timecodes like 1:23 or 1:23:45
    re.compile(r"[♪♫♬]+"),  # Music symbols
]


def is_noise(text: str) -> bool:
    """Check if text matches common noise patterns."""
    stripped = text.strip()
    if len(stripped) < 2:
        return True
    for pattern in NOISE_PATTERNS:
        if pattern.search(stripped):
            return True
    return False


def detect_language(text: str) -> str:
    """Detect dominant language by Unicode range analysis."""
    hangul = 0
    kana_kanji = 0
    latin = 0
    for ch in text:
        cp = ord(ch)
        if 0xAC00 <= cp <= 0xD7AF or 0x1100 <= cp <= 0x11FF or 0x3130 <= cp <= 0x318F:
            hangul += 1
        elif 0x3040 <= cp <= 0x309F or 0x30A0 <= cp <= 0x30FF or 0x4E00 <= cp <= 0x9FFF:
            kana_kanji += 1
        elif 0x0041 <= cp <= 0x007A:
            latin += 1
    counts = {"ko": hangul, "ja": kana_kanji, "en": latin}
    if max(counts.values()) == 0:
        return "unknown"
    return max(counts, key=counts.get)


def download_video(video_url: str, video_id: str) -> str:
    """Download video with yt-dlp, return path to temp file."""
    import yt_dlp

    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    video_path = tmp.name
    tmp.close()
    os.remove(video_path)  # yt-dlp skips download if file exists

    ydl_opts = {
        "format": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
        "outtmpl": video_path,
        "quiet": True,
        "no_warnings": True,
        "merge_output_format": "mp4",
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([video_url])

    return video_path


def extract_frames_and_ocr(video_path: str, ocr_langs: list[str], interval: float):
    """Extract frames from video and run OCR on subtitle region.

    Returns list of (timestamp, text, confidence).
    """
    import cv2
    import easyocr

    reader = easyocr.Reader(ocr_langs, gpu=False, verbose=False)
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    raw_detections = []  # (timestamp, text, confidence)
    timestamp = 0.0

    while timestamp <= duration:
        frame_number = int(timestamp * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]
        # Crop to bottom 30% — subtitle region
        crop = frame[int(h * 0.7):h, 0:w]

        # Preprocess: grayscale + CLAHE contrast enhancement
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        results = reader.readtext(enhanced)
        for bbox, text, confidence in results:
            text = text.strip()
            if confidence >= 0.3 and len(text) >= 2 and not is_noise(text):
                raw_detections.append((timestamp, text, confidence))

        timestamp += interval

    cap.release()
    return raw_detections


def filter_persistent_text(detections: list, total_timestamps: int) -> list:
    """Remove text that appears in >80% of frames (watermarks/logos)."""
    if total_timestamps == 0:
        return detections
    text_counts = Counter(text for _, text, _ in detections)
    threshold = total_timestamps * 0.8
    persistent = {text for text, count in text_counts.items() if count > threshold}
    return [(ts, text, conf) for ts, text, conf in detections if text not in persistent]


def deduplicate_segments(detections: list, interval: float):
    """Merge consecutive frames with similar text into segments.

    Returns list of {"text", "start", "duration"}.
    """
    if not detections:
        return []

    segments = []
    current_text = detections[0][1]
    current_conf = detections[0][2]
    current_start = detections[0][0]
    current_end = detections[0][0]

    for ts, text, conf in detections[1:]:
        similarity = SequenceMatcher(None, current_text, text).ratio()
        if similarity >= 0.8:
            # Extend current segment, keep highest confidence version
            current_end = ts
            if conf > current_conf:
                current_text = text
                current_conf = conf
        else:
            # Finalize current segment
            duration = current_end - current_start + interval
            if duration >= 0.5:
                segments.append({
                    "text": current_text,
                    "start": round(current_start, 2),
                    "duration": round(duration, 2),
                })
            # Start new segment
            current_text = text
            current_conf = conf
            current_start = ts
            current_end = ts

    # Finalize last segment
    duration = current_end - current_start + interval
    if duration >= 0.5:
        segments.append({
            "text": current_text,
            "start": round(current_start, 2),
            "duration": round(duration, 2),
        })

    return segments


def extract_onscreen_text(video_url: str, langs: list[str] | None = None, interval: float = 1.0):
    """Main pipeline: download video, extract frames, OCR, deduplicate."""
    video_id = extract_video_id(video_url)
    if not video_id:
        return {"error": f"Could not extract video ID from: {video_url}"}

    ocr_langs = langs or ["ko", "ja", "en"]
    video_path = None

    try:
        # Phase 1: Download video
        video_path = download_video(video_url, video_id)

        # Phase 2: Extract frames + OCR
        raw_detections = extract_frames_and_ocr(video_path, ocr_langs, interval)

        if not raw_detections:
            return {"videoId": video_id, "error": "no_text_detected"}

        # Phase 3: Filter persistent text (watermarks/logos)
        total_timestamps = int((raw_detections[-1][0] - raw_detections[0][0]) / interval) + 1
        filtered = filter_persistent_text(raw_detections, total_timestamps)

        if not filtered:
            return {"videoId": video_id, "error": "no_text_after_filtering"}

        # Phase 4: Merge multiple texts per frame, then deduplicate
        grouped = defaultdict(list)
        for ts, text, conf in filtered:
            grouped[ts].append((text, conf))

        merged = []
        for ts in sorted(grouped):
            texts = grouped[ts]
            combined_text = " ".join(t for t, _ in texts)
            max_conf = max(c for _, c in texts)
            merged.append((ts, combined_text, max_conf))

        segments = deduplicate_segments(merged, interval)

        if not segments:
            return {"videoId": video_id, "error": "no_segments_after_dedup"}

        # Phase 5: Build output
        full_text = " ".join(seg["text"] for seg in segments)
        language = detect_language(full_text)

        return {
            "videoId": video_id,
            "language": language,
            "segments": segments,
            "fullText": full_text,
        }

    except Exception as e:
        return {"videoId": video_id, "error": str(e)}

    finally:
        if video_path and os.path.exists(video_path):
            os.remove(video_path)
        base = video_path.rsplit(".", 1)[0] if video_path else None
        if base:
            for ext in [".webm", ".m4a", ".mp4.part", ".part"]:
                p = base + ext
                if os.path.exists(p):
                    os.remove(p)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python extract_onscreen_text.py <video_id_or_url> [--lang ko,ja,en] [--interval 1.0]"}))
        sys.exit(1)

    video_url = sys.argv[1]
    langs = None
    interval = 1.0

    # Parse optional args
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == "--lang" and i + 1 < len(sys.argv):
            langs = [l.strip() for l in sys.argv[i + 1].split(",")]
            i += 2
        elif sys.argv[i] == "--interval" and i + 1 < len(sys.argv):
            interval = float(sys.argv[i + 1])
            i += 2
        else:
            i += 1

    result = extract_onscreen_text(video_url, langs, interval)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
