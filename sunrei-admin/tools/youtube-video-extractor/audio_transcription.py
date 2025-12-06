import os
import tempfile
import subprocess
from typing import Optional
from dataclasses import dataclass

from video_transcript import TranscriptEntry


@dataclass
class AudioTranscriptionResult:
    success: bool
    transcript: list[TranscriptEntry]
    language: Optional[str]
    source: str = "none"
    error: Optional[str] = None


def download_audio(video_id: str, output_dir: str) -> Optional[str]:
    output_template = os.path.join(output_dir, f"{video_id}.%(ext)s")
    output_path = os.path.join(output_dir, f"{video_id}.mp3")

    if os.path.exists(output_path):
        print(f"  Using cached audio: {output_path}")
        return output_path

    print(f"  Downloading audio for {video_id}...")

    try:
        cmd = [
            'yt-dlp',
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '-o', output_template,
            '--no-playlist',
            '--quiet',
            f'https://www.youtube.com/watch?v={video_id}'
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"  yt-dlp error: {result.stderr}")
            return None

        if os.path.exists(output_path):
            print(f"  Audio downloaded: {output_path}")
            return output_path

        return None

    except FileNotFoundError:
        print("  Error: yt-dlp not found. Install with: pip install yt-dlp")
        return None
    except Exception as e:
        print(f"  Download error: {e}")
        return None


def transcribe_with_gemini(
    audio_path: str,
    language: Optional[str] = None,
    api_key: Optional[str] = None
) -> AudioTranscriptionResult:
    try:
        import google.generativeai as genai

        api_key = api_key or os.getenv('GEMINI_API_KEY')
        if not api_key:
            return AudioTranscriptionResult(
                success=False,
                transcript=[],
                language=None,
                source="none",
                error="GEMINI_API_KEY not found"
            )

        print(f"  Transcribing with Gemini...")

        genai.configure(api_key=api_key)
        audio_file = genai.upload_file(audio_path)
        model = genai.GenerativeModel('gemini-2.0-flash')

        language_hint = f" The audio is in {language} language." if language else ""

        prompt = f"""Transcribe this audio file accurately.{language_hint}

Return the transcription in this exact JSON format:
{{
  "language": "detected language code (e.g., ko, ja, en)",
  "segments": [
    {{"start": 0.0, "end": 2.5, "text": "transcribed text"}},
    {{"start": 2.5, "end": 5.0, "text": "more text"}}
  ]
}}

Rules:
- Segment the transcript into natural speech segments (sentences or phrases)
- Include accurate start and end times in seconds
- Preserve the original language, do not translate
- Return ONLY valid JSON, no other text"""

        response = model.generate_content([prompt, audio_file])

        import json
        import re

        response_text = response.text.strip()

        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
        if json_match:
            response_text = json_match.group(1)

        result = json.loads(response_text)

        detected_language = result.get("language", language)
        segments = result.get("segments", [])

        entries = []
        for segment in segments:
            start = float(segment.get("start", 0))
            end = float(segment.get("end", start))
            text = segment.get("text", "").strip()
            if text:
                entries.append(TranscriptEntry(
                    text=text,
                    start=start,
                    duration=end - start
                ))

        try:
            audio_file.delete()
        except:
            pass

        if entries:
            print(f"  Gemini transcription complete: {len(entries)} segments (language: {detected_language})")
            return AudioTranscriptionResult(
                success=True,
                transcript=entries,
                language=detected_language,
                source="gemini"
            )
        else:
            return AudioTranscriptionResult(
                success=False,
                transcript=[],
                language=None,
                source="none",
                error="No transcription segments returned"
            )

    except ImportError:
        return AudioTranscriptionResult(
            success=False,
            transcript=[],
            language=None,
            source="none",
            error="google-generativeai not installed"
        )
    except Exception as e:
        error_msg = str(e)
        print(f"  Gemini transcription failed: {error_msg}")
        return AudioTranscriptionResult(
            success=False,
            transcript=[],
            language=None,
            source="none",
            error=error_msg
        )


def transcribe_with_whisper(
    audio_path: str,
    language: Optional[str] = None,
    model_name: str = "base"
) -> AudioTranscriptionResult:
    try:
        import torch
        import whisper

        # Use CUDA or CPU (MPS has known issues with Whisper)
        if torch.cuda.is_available():
            device = "cuda"
            fp16 = True
        else:
            device = "cpu"
            fp16 = False

        print(f"  Transcribing with Whisper ({model_name} model, {device})...")

        model = whisper.load_model(model_name, device=device)

        transcribe_options = {"verbose": False, "fp16": fp16}
        if language:
            transcribe_options["language"] = language

        result = model.transcribe(audio_path, **transcribe_options)

        detected_language = result.get("language", language)

        entries = []
        for segment in result.get("segments", []):
            entries.append(TranscriptEntry(
                text=segment["text"].strip(),
                start=segment["start"],
                duration=segment["end"] - segment["start"]
            ))

        if entries:
            print(f"  Whisper transcription complete: {len(entries)} segments (language: {detected_language})")
            return AudioTranscriptionResult(
                success=True,
                transcript=entries,
                language=detected_language,
                source="whisper"
            )
        else:
            return AudioTranscriptionResult(
                success=False,
                transcript=[],
                language=None,
                source="none",
                error="No transcription results"
            )

    except ImportError:
        return AudioTranscriptionResult(
            success=False,
            transcript=[],
            language=None,
            source="none",
            error="openai-whisper not installed. Install with: pip install openai-whisper"
        )
    except Exception as e:
        return AudioTranscriptionResult(
            success=False,
            transcript=[],
            language=None,
            source="none",
            error=str(e)
        )


def transcribe_video_audio(
    video_id: str,
    language: Optional[str] = None,
    whisper_model: str = "medium",
    cache_dir: Optional[str] = None,
    use_gemini: bool = False
) -> AudioTranscriptionResult:
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        audio_dir = cache_dir
        cleanup = False
    else:
        audio_dir = tempfile.mkdtemp()
        cleanup = True

    try:
        audio_path = download_audio(video_id, audio_dir)
        if not audio_path:
            return AudioTranscriptionResult(
                success=False,
                transcript=[],
                language=None,
                source="none",
                error="Failed to download audio"
            )

        if use_gemini:
            result = transcribe_with_gemini(audio_path, language)
            if result.success:
                return result
            print(f"  Gemini failed, falling back to Whisper...")

        result = transcribe_with_whisper(audio_path, language, whisper_model)
        return result

    finally:
        if cleanup and os.path.exists(audio_dir):
            import shutil
            shutil.rmtree(audio_dir, ignore_errors=True)


LANGUAGE_CODES = {
    'ko-KR': 'ko', 'ko': 'ko',
    'en-US': 'en', 'en': 'en',
}


def get_language_code(lang: str) -> Optional[str]:
    if lang == 'auto':
        return None
    return LANGUAGE_CODES.get(lang, lang)


if __name__ == '__main__':
    import sys
    from dotenv import load_dotenv

    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python audio_transcription.py <VIDEO_ID> [LANGUAGE] [WHISPER_MODEL]")
        print("Example: python audio_transcription.py dQw4w9WgXcQ ko base")
        print("\nWhisper models: tiny, base, small, medium, large")
        print("Languages: ko, en (or 'auto' for auto-detect)")
        sys.exit(1)

    video_id = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else None
    if lang == 'auto':
        lang = None
    model = sys.argv[3] if len(sys.argv) > 3 else "medium"

    result = transcribe_video_audio(video_id, lang, model, cache_dir="./audio_cache")

    print(f"\nSuccess: {result.success}")
    print(f"Source: {result.source}")
    if result.success:
        print(f"Language: {result.language}")
        print(f"Segments: {len(result.transcript)}")
        full_text = ' '.join(e.text for e in result.transcript)
        print(f"Full text preview: {full_text[:300]}...")
    else:
        print(f"Error: {result.error}")
