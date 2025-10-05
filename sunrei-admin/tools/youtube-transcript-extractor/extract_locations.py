import json
import os
from typing import Dict, List, Optional
from enum import Enum


CLEAN_DESCRIPTION_PROMPT = """Remove irrelevant information from this YouTube video description.

Keep only:
- Video content summary
- Location information
- Timeline/chapters if relevant to locations

Remove:
- Music credits and links
- Social media links
- Channel promotion
- Generic information not related to video content

Description:
{description}

Return only the cleaned description, nothing else."""


def clean_description_with_openai(description: str, api_key: str) -> str:
    """Clean description using OpenAI Responses API with the cheapest model."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    # Always use the cheapest model for description cleaning
    model = "gpt-4o-mini"

    params = {
        "model": model,
        "input": CLEAN_DESCRIPTION_PROMPT.format(description=description),
        "temperature": 0.3
    }

    response = client.responses.create(**params)

    return response.output_text.strip()


def clean_description_with_gemini(description: str, api_key: str) -> str:
    """Clean description using Gemini API with the cheapest model."""
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    # Always use the cheapest model for description cleaning
    client = genai.GenerativeModel("gemini-1.5-flash")

    response = client.generate_content(
        CLEAN_DESCRIPTION_PROMPT.format(description=description),
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            max_output_tokens=500
        )
    )

    return response.text.strip()


def chunk_transcript_by_time(transcript: List[Dict], chunk_seconds: int = 30) -> List[Dict]:
    """
    Group transcript entries into time-based chunks.

    Args:
        transcript: List of transcript entries with 'text', 'start', 'duration'
        chunk_seconds: Size of each chunk in seconds (default: 30)

    Returns:
        List of chunks with time_range, start, end, and text
    """
    if not transcript:
        return []

    chunks = []
    current_chunk_start = 0
    current_chunk_texts = []

    for entry in transcript:
        entry_start = entry.get('start', 0)
        entry_text = entry.get('text', '')

        # Determine which chunk this entry belongs to
        chunk_index = int(entry_start // chunk_seconds)
        chunk_start = chunk_index * chunk_seconds
        chunk_end = chunk_start + chunk_seconds

        # If we've moved to a new chunk, save the previous one
        if chunk_start != current_chunk_start and current_chunk_texts:
            # Format time as MM:SS
            start_mm_ss = f"{int(current_chunk_start // 60)}:{int(current_chunk_start % 60):02d}"
            end_mm_ss = f"{int((current_chunk_start + chunk_seconds) // 60)}:{int((current_chunk_start + chunk_seconds) % 60):02d}"

            chunks.append({
                'time_range': f"{start_mm_ss}-{end_mm_ss}",
                'start': current_chunk_start,
                'end': current_chunk_start + chunk_seconds,
                'text': ' '.join(current_chunk_texts)
            })
            current_chunk_texts = []
            current_chunk_start = chunk_start

        current_chunk_texts.append(entry_text)

    # Add the last chunk
    if current_chunk_texts:
        start_mm_ss = f"{int(current_chunk_start // 60)}:{int(current_chunk_start % 60):02d}"
        end_mm_ss = f"{int((current_chunk_start + chunk_seconds) // 60)}:{int((current_chunk_start + chunk_seconds) % 60):02d}"

        chunks.append({
            'time_range': f"{start_mm_ss}-{end_mm_ss}",
            'start': current_chunk_start,
            'end': current_chunk_start + chunk_seconds,
            'text': ' '.join(current_chunk_texts)
        })

    return chunks


class AIProvider(Enum):
    OPENAI = "openai"
    GEMINI = "gemini"


SYSTEM_PROMPT = """
You are an expert at analyzing YouTube video transcripts to identify and extract SPECIFIC PLACES featured in the video.

First, understand the video's main topic from the title and description.
Then, extract SPECIFIC LOCATIONS that are the focus of the video content - NOT generic area names.

Analyze the transcript and extract:

1. video_summary: Brief summary of the video (1-2 sentences)

2. locations: Array of SPECIFIC PLACES that match the video's theme
   Extract ONLY:
   - Specific buildings (e.g., "Tokyo Tower", "Senso-ji Temple")
   - Specific restaurants/cafes (e.g., "Ichiran Ramen Shibuya", "Blue Bottle Coffee")
   - Specific landmarks (e.g., "Shibuya Scramble Crossing", "Meiji Shrine")
   - Specific stores/shops (e.g., "Don Quijote Shibuya", "Tsukiji Fish Market")
   - Other specific venues that align with the video's theme

   DO NOT extract:
   - Generic city/area names alone (e.g., "Tokyo", "Shibuya", "Kyoto") unless they are the specific destination being introduced
   - Generic descriptive locations (e.g., "a cafe", "the station", "the park")

   For each location, extract:
   - location_name: Name of the specific place in English (e.g., "Tokyo Skytree", "Tsutaya Daikanyama")
   - location_query: Search query for geocoding based on information available in the video
     - Include: Place name, district/area, city, country (use only available parts)
     - Format: "Place Name, District/Area, City, Country"
     - Examples: "Tokyo Skytree, Sumida, Tokyo, Japan" or "Tsutaya Daikanyama, Shibuya, Tokyo"
   - description: Summary of how the location is introduced in the video (what the narrator says about it). Write in the SAME LANGUAGE as the transcript (e.g., if transcript is in Korean, write description in Korean)
   - timestamp: Time in seconds when the location is FIRST mentioned (use the start time of the time chunk where it first appears)

Important:
- The transcript is provided in 30-second time chunks (e.g., [0:00-0:30], [0:30-1:00])
- Each chunk shows a time range. Extract the start time in seconds for the timestamp field.
- Extract each unique location only ONCE, even if mentioned multiple times
- Use the timestamp of the FIRST mention of each location
- If a location is mentioned multiple times, combine the information in the description
- Sort locations by timestamp in ascending order (earliest first)
- For location_query, use ONLY information explicitly mentioned in the video - don't infer or add details
- Focus on QUALITY over QUANTITY - only extract places that are specifically featured/introduced
- If the video is about general travel tips without specific places, the locations array can be empty
- Keep descriptions concise (1-3 sentences)

Return ONLY valid JSON format with no additional text."""


USER_PROMPT_TEMPLATE = """
Video Title: {title}
Video Description: {description}

Transcript (grouped by time):
{transcript_chunks}

Extract all locations mentioned in this video."""

# JSON Schema for Structured Outputs
LOCATION_EXTRACTION_SCHEMA = {
    "name": "location_extraction",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "video_summary": {
                "type": "string",
                "description": "Brief summary of the video (1-2 sentences)"
            },
            "locations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "location_name": {
                            "type": "string",
                            "description": "Name of the location in English"
                        },
                        "location_query": {
                            "type": "string",
                            "description": "Search query for geocoding"
                        },
                        "description": {
                            "type": "string",
                            "description": "Summary of how the location is introduced in the video"
                        },
                        "timestamp": {
                            "type": "number",
                            "description": "Time in seconds when the location is first mentioned"
                        }
                    },
                    "required": ["location_name", "location_query", "description", "timestamp"],
                    "additionalProperties": False
                }
            }
        },
        "required": ["video_summary", "locations"],
        "additionalProperties": False
    }
}


def extract_with_openai(
    transcript_data: Dict,
    api_key: str,
    model: str = "gpt-4o"
) -> tuple[Dict, Dict]:
    """
    Extract location data using OpenAI Responses API.

    Returns:
        Tuple of (extracted_data, prompt_info)
    """
    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    # Clean description
    raw_description = transcript_data.get('description', '')
    description = raw_description

    if raw_description:
        try:
            print(f"🧹 Cleaning description with gpt-4o-mini ({len(raw_description)} chars)...")
            description = clean_description_with_openai(raw_description, api_key)
            print(f"✓ Description cleaned ({len(description)} chars)")
        except Exception as e:
            print(f"⚠️  Failed to clean description: {e}")
            description = raw_description

    # Chunk transcript by time
    chunks = chunk_transcript_by_time(transcript_data.get('transcript', []))
    transcript_chunks_text = '\n'.join([
        f"[{chunk['time_range']}] {chunk['text']}"
        for chunk in chunks
    ])

    user_prompt = USER_PROMPT_TEMPLATE.format(
        title=transcript_data.get('title', 'Unknown'),
        description=description,
        transcript_chunks=transcript_chunks_text
    )

    # gpt-5 and o1 models don't support temperature parameter
    supports_temperature = not (model.startswith('gpt-5') or model.startswith('o1-'))

    # Check if model supports Structured Outputs (json_schema)
    # Supported: gpt-4o-mini, gpt-4o-2024-08-06 and later
    supports_structured_outputs = (
        'gpt-4o-mini' in model or
        model in ['gpt-4o-2024-08-06', 'gpt-4o'] or
        model.startswith('gpt-4o-2024-') and model >= 'gpt-4o-2024-08-06'
    )

    # For json_object mode, we need to explicitly mention JSON in the prompt
    if not supports_structured_outputs:
        user_prompt += " Return the result in JSON format."

    # Build text format configuration
    if supports_structured_outputs:
        text_format = {
            "format": {
                "type": "json_schema",
                "json_schema": LOCATION_EXTRACTION_SCHEMA
            }
        }
    else:
        text_format = {
            "format": {
                "type": "json_object"
            }
        }

    # Build request parameters
    params = {
        "model": model,
        "instructions": SYSTEM_PROMPT,
        "input": user_prompt,
        "text": text_format,
        "store": True
    }

    if supports_temperature:
        params["temperature"] = 0.3

    # Show prompt preview
    title = transcript_data.get('title', 'Unknown')
    print(f"📝 Extracting locations from '{title[:60]}...'")
    print(f"   Chunks: {len(chunks)} | Model: {model}")

    response = client.responses.create(**params)

    # Parse and show result
    result = json.loads(response.output_text)
    location_count = len(result.get('locations', []))
    print(f"✓ Extracted {location_count} location(s)")

    # Save prompt information for debugging
    prompt_info = {
        "system_prompt": SYSTEM_PROMPT,
        "user_prompt": user_prompt,
        "model": model,
        "supports_structured_outputs": supports_structured_outputs
    }

    return result, prompt_info


def extract_with_gemini(transcript_data: Dict, api_key: str, model: str = "gemini-2.0-flash-exp") -> tuple[Dict, Dict]:
    """
    Extract location data using Google Gemini API.

    Returns:
        Tuple of (extracted_data, prompt_info)
    """
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    client = genai.GenerativeModel(model)

    # Clean description
    raw_description = transcript_data.get('description', '')
    description = raw_description

    if raw_description:
        try:
            print(f"🧹 Cleaning description with gemini-1.5-flash ({len(raw_description)} chars)...")
            description = clean_description_with_gemini(raw_description, api_key)
            print(f"✓ Description cleaned ({len(description)} chars)")
        except Exception as e:
            print(f"⚠️  Failed to clean description: {e}")
            description = raw_description

    # Chunk transcript by time
    chunks = chunk_transcript_by_time(transcript_data.get('transcript', []))
    transcript_chunks_text = '\n'.join([
        f"[{chunk['time_range']}] {chunk['text']}"
        for chunk in chunks
    ])

    user_prompt = USER_PROMPT_TEMPLATE.format(
        title=transcript_data.get('title', 'Unknown'),
        description=description,
        transcript_chunks=transcript_chunks_text
    )

    full_prompt = f"{SYSTEM_PROMPT}\n\n{user_prompt}"

    # Show prompt preview
    title = transcript_data.get('title', 'Unknown')
    print(f"📝 Extracting locations from '{title[:60]}...'")
    print(f"   Chunks: {len(chunks)} | Model: {model}")

    response = client.generate_content(
        full_prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            response_mime_type="application/json"
        )
    )

    # Parse and show result
    result = json.loads(response.text)
    location_count = len(result.get('locations', []))
    print(f"✓ Extracted {location_count} location(s)")

    # Save prompt information for debugging
    prompt_info = {
        "system_prompt": SYSTEM_PROMPT,
        "user_prompt": user_prompt,
        "full_prompt": full_prompt,
        "model": model
    }

    return result, prompt_info


def deduplicate_locations(locations: List[Dict]) -> List[Dict]:
    """
    Remove duplicate locations based on location_name.
    Keeps the first occurrence (earliest timestamp) and sorts by timestamp.

    Args:
        locations: List of location dicts

    Returns:
        Deduplicated and sorted list of locations
    """
    seen = {}
    deduplicated = []

    for location in locations:
        name = location.get('location_name', '').strip().lower()
        if not name:
            continue

        # If this location hasn't been seen, add it
        if name not in seen:
            seen[name] = True
            deduplicated.append(location)

    # Sort by timestamp in ascending order
    deduplicated.sort(key=lambda x: x.get('timestamp', 0))

    return deduplicated


def extract_locations(
    transcript_file: str,
    provider: AIProvider = AIProvider.OPENAI,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    output_dir: str = 'output'
) -> Dict:
    """
    Extract location data from a transcript file using AI.

    Args:
        transcript_file: Path to transcript JSON file (e.g., transcripts/PLAYLIST_ID/VIDEO_ID.json)
        provider: AI provider to use (openai, anthropic, or gemini)
        api_key: API key (if not provided, will use env var)
        model: Model name (if not provided, will use default for provider)
        output_dir: Base directory to save output JSON (will be saved to output_dir/PLAYLIST_ID/)

    Returns:
        Extracted location data
    """
    # Load transcript
    with open(transcript_file, 'r', encoding='utf-8') as f:
        transcript_data = json.load(f)

    if not transcript_data.get('success'):
        raise ValueError(f"Transcript extraction failed: {transcript_data.get('error')}")

    # Extract playlist_id from file path (transcripts/PLAYLIST_ID/VIDEO_ID.json)
    path_parts = os.path.normpath(transcript_file).split(os.sep)
    playlist_id = None
    if len(path_parts) >= 2:
        playlist_id = path_parts[-2]  # Get parent directory name

    # Create playlist-specific output directory
    if playlist_id:
        playlist_output_dir = os.path.join(output_dir, playlist_id)
    else:
        playlist_output_dir = output_dir
    os.makedirs(playlist_output_dir, exist_ok=True)

    video_id = transcript_data['video_id']
    output_file = os.path.join(playlist_output_dir, f"{video_id}.json")

    # Set default model if not provided
    default_models = {
        AIProvider.OPENAI: "gpt-4o",
        AIProvider.GEMINI: "gemini-2.0-flash-exp"
    }
    model = model or default_models[provider]

    if os.path.exists(output_file):
        print(f"⚡ Skipping - output already exists: {output_file}")
        with open(output_file, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
            return existing_data.get('extracted_data', {})

    # Get API key
    if not api_key:
        env_key_map = {
            AIProvider.OPENAI: 'OPENAI_API_KEY',
            AIProvider.GEMINI: 'GEMINI_API_KEY'
        }
        api_key = os.getenv(env_key_map[provider])
        if not api_key:
            raise ValueError(f"{env_key_map[provider]} not found in environment")

    # Extract locations based on provider
    print(f"Extracting locations using {provider.value}/{model}...")

    prompt_info = {}
    if provider == AIProvider.OPENAI:
        result, prompt_info = extract_with_openai(transcript_data, api_key, model)
    elif provider == AIProvider.GEMINI:
        result, prompt_info = extract_with_gemini(transcript_data, api_key, model)
    else:
        raise ValueError(f"Unknown provider: {provider}")

    # Deduplicate locations and add video URLs with timestamps
    locations = result.get('locations', [])
    locations = deduplicate_locations(locations)

    for location in locations:
        timestamp = location.get('timestamp', 0)
        location['video_url_with_timestamp'] = f"https://youtube.com/watch?v={video_id}&t={int(timestamp)}s"

    # Update result with deduplicated locations
    result['locations'] = locations

    # Save result
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            'video_id': video_id,
            'video_title': transcript_data['title'],
            'video_url': transcript_data['url'],
            'extracted_data': result,
            'metadata': {
                'provider': provider.value,
                'model': model,
                'transcript_language': transcript_data.get('language')
            },
            'prompt_info': prompt_info
        }, f, ensure_ascii=False, indent=2)

    print(f"✓ Locations saved to {output_file}")
    return result


def batch_extract_locations(
    transcript_dir: str,
    provider: AIProvider = AIProvider.OPENAI,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    output_dir: str = 'output'
) -> List[Dict]:
    """
    Extract locations from all transcript files in a directory.

    Args:
        transcript_dir: Directory containing transcript JSON files
        provider: AI provider to use
        api_key: API key (if not provided, will use env var)
        model: Model name (if not provided, will use default)
        output_dir: Directory to save output JSONs

    Returns:
        List of extracted location data
    """
    import glob

    # Search recursively for JSON files in playlist subdirectories
    transcript_files = glob.glob(f"{transcript_dir}/**/*.json", recursive=True)
    # Exclude playlist_summary.json files
    transcript_files = [f for f in transcript_files if os.path.basename(f) != 'playlist_summary.json']
    # For testing, limit to first 1 files
    # transcript_files = transcript_files[:1]

    results = []

    for i, file in enumerate(transcript_files, 1):
        print(f"\n[{i}/{len(transcript_files)}] Processing {os.path.basename(file)}")
        try:
            result = extract_locations(
                file, provider, api_key, model, output_dir
            )
            results.append(result)
        except Exception as e:
            print(f"✗ Error: {str(e)}")

    print(f"\n✓ Processed {len(results)}/{len(transcript_files)} files")
    return results


if __name__ == '__main__':
    import sys
    from dotenv import load_dotenv

    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python extract_locations.py <TRANSCRIPT_FILE_OR_DIR> [provider] [model]")
        print("Providers: openai (default), anthropic, gemini")
        sys.exit(1)

    path = sys.argv[1]
    provider = AIProvider(sys.argv[2]) if len(sys.argv) > 2 else AIProvider.OPENAI
    model = sys.argv[3] if len(sys.argv) > 3 else None

    if os.path.isfile(path):
        result = extract_locations(path, provider, model=model)
        print(f"\n✓ Extracted {len(result.get('locations', []))} locations")
    elif os.path.isdir(path):
        batch_extract_locations(path, provider, model=model)
    else:
        print(f"Error: {path} is not a valid file or directory")
        sys.exit(1)
