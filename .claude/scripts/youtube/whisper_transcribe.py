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
        # SUNREI_YT_COOKIES(Netscape cookies.txt)나 SUNREI_YT_BROWSER(로그인된 브라우저 프로필)가 있으면 로그인 상태로 받는다.
        # 봇 확인이나 연령 제한 같은 로그인 요구를 넘기기 위한 것이다.
        # 멤버십 전용 영상은 수집하지 않기로 했으므로, 쿠키로 받아지면 renew_playlists의 SKIPPED 판정은 일어나지 않는다.
        cf = os.environ.get("SUNREI_YT_COOKIES")
        cb = os.environ.get("SUNREI_YT_BROWSER")
        if cf:
            ydl_opts["cookiefile"] = cf
        elif cb:
            ydl_opts["cookiesfrombrowser"] = (cb,)

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])

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
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
        # yt-dlp가 변환 전 원본도 같은 이름으로 남긴다.
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
