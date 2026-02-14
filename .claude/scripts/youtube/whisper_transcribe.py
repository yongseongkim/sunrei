"""Transcribe YouTube video audio using yt-dlp + whisper.

Usage:
    python whisper_transcribe.py "<video_url>" [model]

Default whisper model: base
Outputs JSON to stdout.
"""

import json
import os
import re
import sys
import tempfile

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


def transcribe(video_url: str, model_name: str = "base"):
    """Download audio and transcribe with whisper."""
    video_id = extract_video_id(video_url)
    if not video_id:
        return {"error": f"Could not extract video ID from: {video_url}"}

    audio_path = None
    try:
        # Download audio with yt-dlp
        import yt_dlp

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            audio_path = tmp.name

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": audio_path.replace(".wav", ".%(ext)s"),
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "wav",
                    "preferredquality": "192",
                }
            ],
            "quiet": True,
            "no_warnings": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])

        # Transcribe with whisper
        import whisper

        model = whisper.load_model(model_name)
        result = model.transcribe(audio_path, language=None)

        segments = []
        full_text_parts = []

        for seg in result.get("segments", []):
            segment = {
                "text": seg["text"].strip(),
                "start": seg["start"],
                "end": seg["end"],
            }
            segments.append(segment)
            full_text_parts.append(seg["text"].strip())

        return {
            "videoId": video_id,
            "language": result.get("language", "unknown"),
            "segments": segments,
            "fullText": " ".join(full_text_parts),
        }

    except Exception as e:
        return {"videoId": video_id, "error": str(e)}

    finally:
        # Clean up temp audio file
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
        # Also try removing the pre-conversion file
        base = audio_path.rsplit(".", 1)[0] if audio_path else None
        if base:
            for ext in [".webm", ".m4a", ".mp3", ".opus"]:
                p = base + ext
                if os.path.exists(p):
                    os.remove(p)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python whisper_transcribe.py <video_url> [model]"}))
        sys.exit(1)

    video_url = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "base"

    result = transcribe(video_url, model_name)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
