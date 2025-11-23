"""Utility functions for YouTube video extraction."""

import re
from urllib.parse import urlparse, parse_qs
from typing import Optional


def extract_video_id(url: str) -> Optional[str]:
    """
    Extract video ID from various YouTube URL formats.

    Supported formats:
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - https://www.youtube.com/embed/VIDEO_ID
    - https://www.youtube.com/v/VIDEO_ID
    - https://www.youtube.com/shorts/VIDEO_ID

    Args:
        url: YouTube video URL

    Returns:
        Video ID or None if not found
    """
    if not url:
        return None

    # Handle direct video ID input (11 characters)
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url

    parsed = urlparse(url)

    # youtube.com/watch?v=VIDEO_ID
    if 'youtube.com' in parsed.netloc:
        if parsed.path == '/watch':
            query_params = parse_qs(parsed.query)
            return query_params.get('v', [None])[0]
        # youtube.com/embed/VIDEO_ID or /v/VIDEO_ID or /shorts/VIDEO_ID
        match = re.match(r'^/(embed|v|shorts)/([a-zA-Z0-9_-]{11})', parsed.path)
        if match:
            return match.group(2)

    # youtu.be/VIDEO_ID
    if 'youtu.be' in parsed.netloc:
        return parsed.path.lstrip('/')[:11]

    return None


def sanitize_channel_name(channel_name: str) -> str:
    """
    Sanitize channel name for use as directory name.

    Args:
        channel_name: Original channel name

    Returns:
        Sanitized channel name safe for filesystem
    """
    if not channel_name:
        return "unknown_channel"

    # Replace problematic characters with underscore
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', channel_name)
    # Replace multiple spaces/underscores with single underscore
    sanitized = re.sub(r'[\s_]+', '_', sanitized)
    # Remove leading/trailing underscores
    sanitized = sanitized.strip('_')
    # Limit length
    sanitized = sanitized[:100]

    return sanitized or "unknown_channel"


def clean_description(description: str) -> str:
    """
    Clean YouTube video description by removing irrelevant content.

    Removes:
    - Music credits and song information
    - Social media links
    - Generic promotional text
    - Affiliate links
    - Sponsor sections

    Keeps:
    - Location information
    - Timeline/chapter markers
    - Video theme description

    Args:
        description: Raw video description

    Returns:
        Cleaned description focused on location-related content
    """
    if not description:
        return ""

    lines = description.split('\n')
    cleaned_lines = []
    skip_section = False

    # Patterns to skip entire lines
    skip_patterns = [
        # Social media links
        r'(instagram|twitter|tiktok|facebook|x\.com|threads)\.com',
        r'@\w+\s*(instagram|twitter|tiktok|facebook|x|threads)',
        r'follow\s+(me|us)\s+(on|at)',
        # Music credits
        r'(music|song|track|bgm|soundtrack)\s*[:\-]',
        r'(provided|licensed)\s+by',
        r'(spotify|apple\s*music|soundcloud)\.com',
        r'\u266a|\u266b|\u266c',  # Music notes
        # Affiliate/sponsor
        r'(affiliate|sponsored|ad|promo)\s*(link|code|discount)',
        r'use\s+code\s+[A-Z0-9]+',
        r'discount\s+code',
        # Generic promotional
        r'subscribe\s+(to\s+)?(my|our|the)\s+channel',
        r'like\s+and\s+subscribe',
        r'don\'t\s+forget\s+to\s+(like|subscribe)',
        r'hit\s+the\s+(bell|notification)',
        # Equipment/gear lists (usually not locations)
        r'(camera|lens|gear|equipment)\s*[:\-]',
        r'shot\s+(on|with)\s+[A-Za-z]+\s+\d+',
        # Email
        r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+',
    ]

    # Section headers to skip everything after
    section_skip_headers = [
        r'^#?\s*(music|credits|social|links|gear|equipment|contact)',
        r'^#?\s*(follow\s+me|connect\s+with)',
        r'^\-{3,}$',  # Separator lines often precede credits
    ]

    for line in lines:
        line_lower = line.lower().strip()

        # Check if we should start skipping a section
        for pattern in section_skip_headers:
            if re.search(pattern, line_lower, re.IGNORECASE):
                skip_section = True
                break

        # Reset skip if we hit a new meaningful section
        if re.match(r'^#?\s*\d{1,2}:\d{2}', line):  # Timestamp pattern
            skip_section = False

        if skip_section:
            continue

        # Check individual line skip patterns
        should_skip = False
        for pattern in skip_patterns:
            if re.search(pattern, line_lower, re.IGNORECASE):
                should_skip = True
                break

        # Skip lines that are just URLs
        if re.match(r'^https?://\S+$', line.strip()):
            should_skip = True

        if not should_skip and line.strip():
            cleaned_lines.append(line)

    return '\n'.join(cleaned_lines).strip()


def extract_timeline_from_description(description: str) -> list[dict]:
    """
    Extract timeline/chapter markers from description.

    Looks for patterns like:
    - 0:00 Introduction
    - 1:30 - Tokyo Tower
    - [2:45] Shibuya Crossing

    Args:
        description: Video description

    Returns:
        List of dicts with 'timestamp' (seconds) and 'title'
    """
    if not description:
        return []

    timeline = []
    # Match various timestamp formats
    pattern = r'[\[\(]?(\d{1,2}):(\d{2})(?::(\d{2}))?[\]\)]?\s*[-:\s]*(.+?)(?=\n|$)'

    for match in re.finditer(pattern, description):
        hours_or_mins = int(match.group(1))
        mins_or_secs = int(match.group(2))
        secs = int(match.group(3)) if match.group(3) else 0

        # Determine if format is H:MM:SS or M:SS
        if match.group(3):
            # H:MM:SS format
            total_seconds = hours_or_mins * 3600 + mins_or_secs * 60 + secs
        else:
            # M:SS format
            total_seconds = hours_or_mins * 60 + mins_or_secs

        title = match.group(4).strip()
        if title:
            timeline.append({
                'timestamp': total_seconds,
                'title': title
            })

    return timeline


def format_timestamp(seconds: int) -> str:
    """
    Format seconds as MM:SS or H:MM:SS.

    Args:
        seconds: Time in seconds

    Returns:
        Formatted time string
    """
    if seconds < 0:
        seconds = 0

    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60

    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"
