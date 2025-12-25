import re
from urllib.parse import urlparse, parse_qs
from typing import Optional


def extract_playlist_id(url: str) -> Optional[str]:
    if not url:
        return None
    parsed = urlparse(url)
    if 'youtube.com' in parsed.netloc or 'youtu.be' in parsed.netloc:
        query_params = parse_qs(parsed.query)
        playlist_id = query_params.get('list', [None])[0]
        if playlist_id:
            return playlist_id
    return None


def is_playlist_url(url: str) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    if 'youtube.com' in parsed.netloc:
        if parsed.path == '/playlist':
            query_params = parse_qs(parsed.query)
            return 'list' in query_params
    return False


def extract_video_id(url: str) -> Optional[str]:
    if not url:
        return None
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
    parsed = urlparse(url)
    if 'youtube.com' in parsed.netloc:
        if parsed.path == '/watch':
            query_params = parse_qs(parsed.query)
            return query_params.get('v', [None])[0]
        match = re.match(r'^/(embed|v|shorts)/([a-zA-Z0-9_-]{11})', parsed.path)
        if match:
            return match.group(2)
    if 'youtu.be' in parsed.netloc:
        return parsed.path.lstrip('/')[:11]
    return None


def sanitize_channel_name(channel_name: str) -> str:
    if not channel_name:
        return "unknown_channel"
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', channel_name)
    sanitized = re.sub(r'[\s_]+', '_', sanitized)
    sanitized = sanitized.strip('_')
    sanitized = sanitized[:100]
    return sanitized or "unknown_channel"


def clean_description(description: str) -> str:
    if not description:
        return ""

    lines = description.split('\n')
    cleaned_lines = []
    skip_section = False

    skip_patterns = [
        r'(instagram|twitter|tiktok|facebook|x\.com|threads)\.com',
        r'@\w+\s*(instagram|twitter|tiktok|facebook|x|threads)',
        r'follow\s+(me|us)\s+(on|at)',
        r'(music|song|track|bgm|soundtrack)\s*[:\-]',
        r'(provided|licensed)\s+by',
        r'(spotify|apple\s*music|soundcloud)\.com',
        r'\u266a|\u266b|\u266c',
        r'(affiliate|sponsored|ad|promo)\s*(link|code|discount)',
        r'use\s+code\s+[A-Z0-9]+',
        r'discount\s+code',
        r'subscribe\s+(to\s+)?(my|our|the)\s+channel',
        r'like\s+and\s+subscribe',
        r'don\'t\s+forget\s+to\s+(like|subscribe)',
        r'hit\s+the\s+(bell|notification)',
        r'(camera|lens|gear|equipment)\s*[:\-]',
        r'shot\s+(on|with)\s+[A-Za-z]+\s+\d+',
        r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+',
    ]

    section_skip_headers = [
        r'^#?\s*(music|credits|social|links|gear|equipment|contact)',
        r'^#?\s*(follow\s+me|connect\s+with)',
        r'^\-{3,}$',
    ]

    for line in lines:
        line_lower = line.lower().strip()

        for pattern in section_skip_headers:
            if re.search(pattern, line_lower, re.IGNORECASE):
                skip_section = True
                break

        if re.match(r'^#?\s*\d{1,2}:\d{2}', line):
            skip_section = False

        if skip_section:
            continue

        should_skip = False
        for pattern in skip_patterns:
            if re.search(pattern, line_lower, re.IGNORECASE):
                should_skip = True
                break

        if re.match(r'^https?://\S+$', line.strip()):
            should_skip = True

        if not should_skip and line.strip():
            cleaned_lines.append(line)

    return '\n'.join(cleaned_lines).strip()


def extract_timeline_from_description(description: str) -> list[dict]:
    if not description:
        return []

    timeline = []
    pattern = r'[\[\(]?(\d{1,2}):(\d{2})(?::(\d{2}))?[\]\)]?\s*[-:\s]*(.+?)(?=\n|$)'

    for match in re.finditer(pattern, description):
        hours_or_mins = int(match.group(1))
        mins_or_secs = int(match.group(2))
        secs = int(match.group(3)) if match.group(3) else 0

        if match.group(3):
            total_seconds = hours_or_mins * 3600 + mins_or_secs * 60 + secs
        else:
            total_seconds = hours_or_mins * 60 + mins_or_secs

        title = match.group(4).strip()
        if title:
            timeline.append({'timestamp': total_seconds, 'title': title})

    return timeline


def format_timestamp(seconds: int) -> str:
    if seconds < 0:
        seconds = 0
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def parse_iso8601_duration(duration: str) -> int:
    """Parse ISO 8601 duration (e.g., PT18M, PT1H30M45S) to seconds."""
    if not duration:
        return 0
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration)
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def validate_transcript_quality(
    transcript: list[dict],
    video_duration_iso: str,
    min_coverage_ratio: float = 0.3,
    min_chars_per_minute: float = 50
) -> tuple[bool, str]:
    """
    Validate transcript quality based on coverage and text density.

    Returns:
        (is_valid, reason)
    """
    if not transcript:
        return False, "No transcript"

    video_duration = parse_iso8601_duration(video_duration_iso)
    if video_duration == 0:
        return True, "Unknown video duration"

    # Calculate transcript coverage
    transcript_duration = sum(t.get('duration', 0) for t in transcript)
    coverage_ratio = transcript_duration / video_duration

    # Calculate text density (chars per minute)
    total_chars = sum(len(t.get('text', '')) for t in transcript)
    video_minutes = video_duration / 60
    chars_per_minute = total_chars / video_minutes if video_minutes > 0 else 0

    # Check for repetitive content (hallucination detection)
    texts = [t.get('text', '').strip() for t in transcript]
    unique_texts = set(texts)
    repetition_ratio = len(unique_texts) / len(texts) if texts else 1

    if coverage_ratio < min_coverage_ratio:
        return False, f"Low coverage ({coverage_ratio:.1%} < {min_coverage_ratio:.0%})"

    if chars_per_minute < min_chars_per_minute:
        return False, f"Low text density ({chars_per_minute:.0f} chars/min < {min_chars_per_minute:.0f})"

    if repetition_ratio < 0.5:
        return False, f"High repetition ({repetition_ratio:.1%} unique)"

    return True, "OK"
