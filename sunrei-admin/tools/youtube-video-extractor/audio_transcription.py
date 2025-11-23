"""Audio transcription using Google Cloud Speech-to-Text as fallback."""

import os
import tempfile
import subprocess
from typing import Optional
from dataclasses import dataclass

from video_transcript import TranscriptEntry


@dataclass
class AudioTranscriptionResult:
    """Result of audio transcription."""
    success: bool
    transcript: list[TranscriptEntry]
    language: Optional[str]
    error: Optional[str] = None


def download_audio(video_id: str, output_dir: str) -> Optional[str]:
    """
    Download audio from YouTube video using yt-dlp.

    Args:
        video_id: YouTube video ID
        output_dir: Directory to save audio file

    Returns:
        Path to downloaded audio file or None if failed
    """
    output_path = os.path.join(output_dir, f"{video_id}.wav")

    # Skip if already exists
    if os.path.exists(output_path):
        print(f"  Using cached audio: {output_path}")
        return output_path

    print(f"  Downloading audio for {video_id}...")

    try:
        # Use yt-dlp to download audio as WAV (required by Google Cloud STT)
        cmd = [
            'yt-dlp',
            '-x',  # Extract audio
            '--audio-format', 'wav',
            '--audio-quality', '0',
            '-o', output_path,
            '--no-playlist',
            '--quiet',
            f'https://www.youtube.com/watch?v={video_id}'
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"  yt-dlp error: {result.stderr}")
            return None

        # yt-dlp might add extension, check for the file
        if not os.path.exists(output_path):
            # Try with .wav extension added by yt-dlp
            alt_path = output_path.replace('.wav', '.wav.wav')
            if os.path.exists(alt_path):
                os.rename(alt_path, output_path)

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


def transcribe_with_google_stt(
    audio_path: str,
    language_code: str = "ko-KR"
) -> AudioTranscriptionResult:
    """
    Transcribe audio using Google Cloud Speech-to-Text.

    Requires GOOGLE_APPLICATION_CREDENTIALS environment variable
    to be set with path to service account JSON file.

    Args:
        audio_path: Path to audio file (WAV format recommended)
        language_code: BCP-47 language code (e.g., "ko-KR", "ja-JP", "en-US")

    Returns:
        AudioTranscriptionResult with transcript entries
    """
    try:
        from google.cloud import speech

        # Check credentials
        if not os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            return AudioTranscriptionResult(
                success=False,
                transcript=[],
                language=None,
                error="GOOGLE_APPLICATION_CREDENTIALS not set"
            )

        print(f"  Transcribing with Google Cloud STT ({language_code})...")

        client = speech.SpeechClient()

        # Read audio file
        with open(audio_path, 'rb') as f:
            audio_content = f.read()

        audio = speech.RecognitionAudio(content=audio_content)

        # Configure recognition
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=16000,
            language_code=language_code,
            enable_word_time_offsets=True,
            enable_automatic_punctuation=True,
            model="latest_long",  # Better for long-form content
        )

        # For long audio files, use long_running_recognize
        file_size = os.path.getsize(audio_path)
        if file_size > 10 * 1024 * 1024:  # > 10MB
            print(f"  Using long-running recognition (file size: {file_size / 1024 / 1024:.1f}MB)")
            operation = client.long_running_recognize(config=config, audio=audio)
            response = operation.result(timeout=600)  # 10 min timeout
        else:
            response = client.recognize(config=config, audio=audio)

        # Convert to TranscriptEntry format
        entries = []
        for result in response.results:
            if not result.alternatives:
                continue

            alternative = result.alternatives[0]
            text = alternative.transcript

            # Get timing from first word
            if alternative.words:
                start_time = alternative.words[0].start_time.total_seconds()
                end_time = alternative.words[-1].end_time.total_seconds()
                duration = end_time - start_time
            else:
                start_time = 0
                duration = 0

            entries.append(TranscriptEntry(
                text=text,
                start=start_time,
                duration=duration
            ))

        if entries:
            print(f"  Transcription complete: {len(entries)} segments")
            return AudioTranscriptionResult(
                success=True,
                transcript=entries,
                language=language_code
            )
        else:
            return AudioTranscriptionResult(
                success=False,
                transcript=[],
                language=None,
                error="No transcription results"
            )

    except ImportError:
        return AudioTranscriptionResult(
            success=False,
            transcript=[],
            language=None,
            error="google-cloud-speech not installed"
        )
    except Exception as e:
        return AudioTranscriptionResult(
            success=False,
            transcript=[],
            language=None,
            error=str(e)
        )


def transcribe_video_audio(
    video_id: str,
    language_code: str = "ko-KR",
    cache_dir: Optional[str] = None
) -> AudioTranscriptionResult:
    """
    Download and transcribe audio from a YouTube video.

    Args:
        video_id: YouTube video ID
        language_code: BCP-47 language code for transcription
        cache_dir: Directory to cache downloaded audio (uses temp dir if not provided)

    Returns:
        AudioTranscriptionResult with transcript entries
    """
    # Use cache dir or create temp directory
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        audio_dir = cache_dir
        cleanup = False
    else:
        audio_dir = tempfile.mkdtemp()
        cleanup = True

    try:
        # Download audio
        audio_path = download_audio(video_id, audio_dir)
        if not audio_path:
            return AudioTranscriptionResult(
                success=False,
                transcript=[],
                language=None,
                error="Failed to download audio"
            )

        # Transcribe
        result = transcribe_with_google_stt(audio_path, language_code)

        return result

    finally:
        # Cleanup temp directory if we created one
        if cleanup and os.path.exists(audio_dir):
            import shutil
            shutil.rmtree(audio_dir, ignore_errors=True)


# Language code mapping for common languages
LANGUAGE_CODES = {
    'ko': 'ko-KR',  # Korean
    'ja': 'ja-JP',  # Japanese
    'en': 'en-US',  # English
    'zh': 'zh-CN',  # Chinese (Simplified)
    'zh-tw': 'zh-TW',  # Chinese (Traditional)
    'es': 'es-ES',  # Spanish
    'fr': 'fr-FR',  # French
    'de': 'de-DE',  # German
    'pt': 'pt-BR',  # Portuguese
    'it': 'it-IT',  # Italian
    'ru': 'ru-RU',  # Russian
    'vi': 'vi-VN',  # Vietnamese
    'th': 'th-TH',  # Thai
}


def get_language_code(lang: str) -> str:
    """Convert short language code to BCP-47 format."""
    return LANGUAGE_CODES.get(lang, lang)


if __name__ == '__main__':
    import sys
    from dotenv import load_dotenv

    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python audio_transcription.py <VIDEO_ID> [LANGUAGE_CODE]")
        print("Example: python audio_transcription.py dQw4w9WgXcQ ko-KR")
        sys.exit(1)

    video_id = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "ko-KR"

    result = transcribe_video_audio(video_id, lang, cache_dir="./audio_cache")

    print(f"\nSuccess: {result.success}")
    if result.success:
        print(f"Language: {result.language}")
        print(f"Segments: {len(result.transcript)}")
        full_text = ' '.join(e.text for e in result.transcript)
        print(f"Full text preview: {full_text[:200]}...")
    else:
        print(f"Error: {result.error}")
