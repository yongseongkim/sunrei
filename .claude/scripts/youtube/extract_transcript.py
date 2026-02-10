"""Extract YouTube video transcript using youtube-transcript-api.

Usage:
    python extract_transcript.py "<video_id>" [lang]

Default language order: ko, ja, en
Outputs JSON to stdout.
"""

import json
import sys
import os

# Load env from sunrei-worker/.env if it exists
WORKER_ENV = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "sunrei-worker", ".env"
)
if os.path.exists(WORKER_ENV):
    from dotenv import load_dotenv
    load_dotenv(WORKER_ENV)

from youtube_transcript_api import YouTubeTranscriptApi


def extract_transcript(video_id: str, lang: str | None = None):
    """Extract transcript for a YouTube video."""
    language_order = [lang] if lang else ["ko", "ja", "en"]

    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        # Try to find transcript in preferred language order
        transcript = None
        used_language = None

        for preferred_lang in language_order:
            try:
                transcript = transcript_list.find_transcript([preferred_lang])
                used_language = preferred_lang
                break
            except Exception:
                continue

        # If no preferred language found, try any available transcript
        if transcript is None:
            try:
                # Get first available transcript
                for t in transcript_list:
                    transcript = t
                    used_language = t.language_code
                    break
            except Exception:
                pass

        if transcript is None:
            return {"videoId": video_id, "error": "no_transcript_available"}

        # Fetch the transcript data
        entries = transcript.fetch()

        segments = []
        full_text_parts = []

        for entry in entries:
            segment = {
                "text": entry.text,
                "start": entry.start,
                "duration": entry.duration,
            }
            segments.append(segment)
            full_text_parts.append(entry.text)

        return {
            "videoId": video_id,
            "language": used_language,
            "segments": segments,
            "fullText": " ".join(full_text_parts),
        }

    except Exception as e:
        return {"videoId": video_id, "error": str(e)}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python extract_transcript.py <video_id> [lang]"}))
        sys.exit(1)

    video_id = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else None

    result = extract_transcript(video_id, lang)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
