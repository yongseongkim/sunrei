"""Location extraction from video transcript using Claude or Gemini."""

import json
import os
from enum import Enum
from typing import Optional
from dataclasses import dataclass

from video_transcript import VideoTranscript, TranscriptEntry


class AIProvider(Enum):
    CLAUDE = "claude"
    GEMINI = "gemini"


@dataclass
class ExtractedLocation:
    """Extracted location from video."""
    name: str
    query: str  # For geocoding
    description: str
    timestamp: int
    video_url_with_timestamp: str


@dataclass
class ExtractionResult:
    """Result of location extraction."""
    video_summary: str
    locations: list[ExtractedLocation]
    provider: str
    model: str


# System prompt for location extraction
SYSTEM_PROMPT = """You are an expert at extracting location information from YouTube video transcripts.

Your task is to identify SPECIFIC, VISITABLE PLACES that are the main focus of the video content.

## What to Extract
- Restaurants, cafes, bars that are featured/reviewed
- Tourist attractions, landmarks, museums
- Hotels, accommodations that are reviewed
- Shops, markets, specific stores
- Parks, beaches, natural attractions
- Architectural sites, buildings of interest
- Any specific venue that viewers could visit

## What NOT to Extract
- Generic area names (e.g., "Tokyo", "Shibuya") unless it's the only destination
- Background locations or places just passed by
- Places only briefly mentioned but not featured
- The creator's home, studio, or personal locations
- Generic descriptions (e.g., "a restaurant", "some cafe")
- Transportation hubs unless they are destinations (e.g., skip "took the train from Shinjuku")

## Key Rules
1. **Focus on video concept**: If the video is about "restaurants in Shibuya", only extract Shibuya restaurants, not random Tokyo locations mentioned
2. **Quality over quantity**: Better to extract 3-5 highly relevant locations than 10 loosely related ones
3. **First mention timestamp**: Use the timestamp when the location is first meaningfully discussed
4. **Description language**: Write descriptions in the SAME language as the transcript
5. **Geocoding query**: Format as "Place Name, Area/District, City, Country" for accurate geocoding

## Output Format
Return a JSON object with:
- video_summary: 1-2 sentence summary of what the video is about
- locations: Array of location objects with name, query, description, timestamp"""


USER_PROMPT_TEMPLATE_BASE = """## Video Information

**Title**: {title}

**Channel**: {channel_name}

**Description** (cleaned):
{description}
{timeline_section}
## Transcript (grouped by time)
{transcript_chunks}

---

Extract the main locations featured in this video. Focus only on places that match the video's theme and concept.
Return your response as a valid JSON object."""

TIMELINE_SECTION_TEMPLATE = """
**Timeline from description**:
{timeline}
"""


# JSON schema for structured output
LOCATION_SCHEMA = {
    "type": "object",
    "properties": {
        "video_summary": {
            "type": "string",
            "description": "Brief 1-2 sentence summary of the video content"
        },
        "locations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name of the location in English (or original language if no English name)"
                    },
                    "query": {
                        "type": "string",
                        "description": "Search query for geocoding: 'Place Name, District, City, Country'"
                    },
                    "description": {
                        "type": "string",
                        "description": "Brief description of how the location is featured (same language as transcript)"
                    },
                    "timestamp": {
                        "type": "integer",
                        "description": "Timestamp in seconds when location is first discussed"
                    }
                },
                "required": ["name", "query", "description", "timestamp"]
            }
        }
    },
    "required": ["video_summary", "locations"]
}


def chunk_transcript(
    transcript: list[TranscriptEntry],
    chunk_seconds: int = 30
) -> list[dict]:
    """
    Group transcript entries into time-based chunks.

    Args:
        transcript: List of TranscriptEntry objects
        chunk_seconds: Size of each chunk in seconds

    Returns:
        List of chunks with time_range and text
    """
    if not transcript:
        return []

    chunks = []
    current_chunk_start = 0
    current_chunk_texts = []

    for entry in transcript:
        chunk_index = int(entry.start // chunk_seconds)
        chunk_start = chunk_index * chunk_seconds

        if chunk_start != current_chunk_start and current_chunk_texts:
            start_mm_ss = f"{int(current_chunk_start // 60)}:{int(current_chunk_start % 60):02d}"
            end_mm_ss = f"{int((current_chunk_start + chunk_seconds) // 60)}:{int((current_chunk_start + chunk_seconds) % 60):02d}"

            chunks.append({
                'time_range': f"{start_mm_ss}-{end_mm_ss}",
                'start': current_chunk_start,
                'text': ' '.join(current_chunk_texts)
            })
            current_chunk_texts = []
            current_chunk_start = chunk_start

        current_chunk_texts.append(entry.text)

    # Add last chunk
    if current_chunk_texts:
        start_mm_ss = f"{int(current_chunk_start // 60)}:{int(current_chunk_start % 60):02d}"
        end_mm_ss = f"{int((current_chunk_start + chunk_seconds) // 60)}:{int((current_chunk_start + chunk_seconds) % 60):02d}"

        chunks.append({
            'time_range': f"{start_mm_ss}-{end_mm_ss}",
            'start': current_chunk_start,
            'text': ' '.join(current_chunk_texts)
        })

    return chunks


def format_timeline(timeline: list[dict] | None) -> str:
    """Format timeline markers for prompt."""
    if not timeline:
        return ""

    lines = []
    for item in timeline:
        mins = item['timestamp'] // 60
        secs = item['timestamp'] % 60
        lines.append(f"- {mins}:{secs:02d} {item['title']}")

    return '\n'.join(lines)


def build_user_prompt(
    title: str,
    channel_name: str,
    description: str,
    timeline: list[dict] | None,
    transcript_chunks: str
) -> str:
    """
    Build user prompt with optional timeline section.

    Args:
        title: Video title
        channel_name: Channel name
        description: Cleaned description
        timeline: Timeline markers (can be None or empty)
        transcript_chunks: Formatted transcript chunks

    Returns:
        Formatted user prompt string
    """
    # Only include timeline section if there's actual timeline data
    timeline_section = ""
    if timeline:
        formatted_timeline = format_timeline(timeline)
        if formatted_timeline:
            timeline_section = TIMELINE_SECTION_TEMPLATE.format(timeline=formatted_timeline)

    return USER_PROMPT_TEMPLATE_BASE.format(
        title=title,
        channel_name=channel_name,
        description=description or "(No description)",
        timeline_section=timeline_section,
        transcript_chunks=transcript_chunks
    )


def extract_with_claude(
    video_data: VideoTranscript,
    api_key: str,
    model: str = "claude-sonnet-4-5-20250929"
) -> ExtractionResult:
    """
    Extract locations using Anthropic Claude API.

    Args:
        video_data: VideoTranscript with metadata and transcript
        api_key: Anthropic API key
        model: Claude model to use

    Returns:
        ExtractionResult with extracted locations
    """
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    # Prepare transcript chunks
    chunks = chunk_transcript(video_data.transcript)
    if chunks:
        transcript_text = '\n'.join([
            f"[{c['time_range']}] {c['text']}"
            for c in chunks
        ])
    else:
        transcript_text = "(No transcript available - extract from description only)"

    # Build user prompt
    user_prompt = build_user_prompt(
        title=video_data.metadata.title,
        channel_name=video_data.metadata.channel_name,
        description=video_data.metadata.cleaned_description,
        timeline=video_data.metadata.timeline,
        transcript_chunks=transcript_text
    )

    print(f"  Extracting with Claude ({model})...")

    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": user_prompt}
        ]
    )

    # Parse response
    response_text = response.content[0].text

    # Extract JSON from response (Claude might wrap it in markdown)
    if "```json" in response_text:
        json_start = response_text.find("```json") + 7
        json_end = response_text.find("```", json_start)
        response_text = response_text[json_start:json_end].strip()
    elif "```" in response_text:
        json_start = response_text.find("```") + 3
        json_end = response_text.find("```", json_start)
        response_text = response_text[json_start:json_end].strip()

    result = json.loads(response_text)

    # Convert to ExtractionResult
    locations = []
    for loc in result.get('locations', []):
        locations.append(ExtractedLocation(
            name=loc['name'],
            query=loc['query'],
            description=loc['description'],
            timestamp=loc['timestamp'],
            video_url_with_timestamp=f"https://youtube.com/watch?v={video_data.metadata.video_id}&t={loc['timestamp']}s"
        ))

    print(f"  Extracted {len(locations)} location(s)")

    return ExtractionResult(
        video_summary=result.get('video_summary', ''),
        locations=locations,
        provider='claude',
        model=model
    )


def extract_with_gemini(
    video_data: VideoTranscript,
    api_key: str,
    model: str = "gemini-2.5-flash"
) -> ExtractionResult:
    """
    Extract locations using Google Gemini API.

    Args:
        video_data: VideoTranscript with metadata and transcript
        api_key: Gemini API key
        model: Gemini model to use

    Returns:
        ExtractionResult with extracted locations
    """
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    client = genai.GenerativeModel(model)

    # Prepare transcript chunks
    chunks = chunk_transcript(video_data.transcript)
    if chunks:
        transcript_text = '\n'.join([
            f"[{c['time_range']}] {c['text']}"
            for c in chunks
        ])
    else:
        transcript_text = "(No transcript available - extract from description only)"

    # Build prompt (Gemini combines system + user)
    user_prompt = build_user_prompt(
        title=video_data.metadata.title,
        channel_name=video_data.metadata.channel_name,
        description=video_data.metadata.cleaned_description,
        timeline=video_data.metadata.timeline,
        transcript_chunks=transcript_text
    )

    full_prompt = f"{SYSTEM_PROMPT}\n\n{user_prompt}"

    print(f"  Extracting with Gemini ({model})...")

    response = client.generate_content(
        full_prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            response_mime_type="application/json",
            response_schema=LOCATION_SCHEMA
        )
    )

    result = json.loads(response.text)

    # Convert to ExtractionResult
    locations = []
    for loc in result.get('locations', []):
        locations.append(ExtractedLocation(
            name=loc['name'],
            query=loc['query'],
            description=loc['description'],
            timestamp=loc['timestamp'],
            video_url_with_timestamp=f"https://youtube.com/watch?v={video_data.metadata.video_id}&t={loc['timestamp']}s"
        ))

    print(f"  Extracted {len(locations)} location(s)")

    return ExtractionResult(
        video_summary=result.get('video_summary', ''),
        locations=locations,
        provider='gemini',
        model=model
    )


def extract_locations(
    video_data: VideoTranscript,
    provider: AIProvider = AIProvider.CLAUDE,
    api_key: Optional[str] = None,
    model: Optional[str] = None
) -> ExtractionResult:
    """
    Extract locations from video data using specified AI provider.

    Args:
        video_data: VideoTranscript with metadata and transcript
        provider: AI provider to use (claude or gemini)
        api_key: API key (uses env var if not provided)
        model: Model name (uses default if not provided)

    Returns:
        ExtractionResult with extracted locations
    """
    # Get API key from environment if not provided
    env_keys = {
        AIProvider.CLAUDE: 'ANTHROPIC_API_KEY',
        AIProvider.GEMINI: 'GEMINI_API_KEY'
    }

    api_key = api_key or os.getenv(env_keys[provider])
    if not api_key:
        raise ValueError(f"{env_keys[provider]} not found in environment")

    # Default models
    default_models = {
        AIProvider.CLAUDE: "claude-sonnet-4-5-20250929",
        AIProvider.GEMINI: "gemini-2.5-flash"
    }
    model = model or default_models[provider]

    # Extract based on provider
    if provider == AIProvider.CLAUDE:
        return extract_with_claude(video_data, api_key, model)
    elif provider == AIProvider.GEMINI:
        return extract_with_gemini(video_data, api_key, model)
    else:
        raise ValueError(f"Unknown provider: {provider}")


def result_to_dict(
    video_data: VideoTranscript,
    extraction: ExtractionResult
) -> dict:
    """
    Convert extraction result to output dictionary format.

    Args:
        video_data: Original video data
        extraction: Extraction result

    Returns:
        Dictionary ready for JSON output
    """
    return {
        'channel_name': video_data.metadata.channel_name,
        'channel_id': video_data.metadata.channel_id,
        'video_id': video_data.metadata.video_id,
        'video_title': video_data.metadata.title,
        'video_url': video_data.metadata.url,
        'video_summary': extraction.video_summary,
        'locations': [
            {
                'name': loc.name,
                'query': loc.query,
                'description': loc.description,
                'timestamp': loc.timestamp,
                'video_url_with_timestamp': loc.video_url_with_timestamp
            }
            for loc in extraction.locations
        ],
        'metadata': {
            'provider': extraction.provider,
            'model': extraction.model,
            'transcript_source': video_data.transcript_source,
            'transcript_language': video_data.language
        }
    }


if __name__ == '__main__':
    import sys
    from dotenv import load_dotenv
    from video_transcript import extract_video_transcript

    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python extract_locations.py <VIDEO_URL_OR_ID> [provider] [model]")
        print("Providers: claude (default), gemini")
        sys.exit(1)

    video_url = sys.argv[1]
    provider = AIProvider(sys.argv[2]) if len(sys.argv) > 2 else AIProvider.CLAUDE
    model = sys.argv[3] if len(sys.argv) > 3 else None

    # Extract transcript
    video_data = extract_video_transcript(video_url)

    # Extract locations
    result = extract_locations(video_data, provider, model=model)

    # Print result
    output = result_to_dict(video_data, result)
    print(json.dumps(output, ensure_ascii=False, indent=2))
