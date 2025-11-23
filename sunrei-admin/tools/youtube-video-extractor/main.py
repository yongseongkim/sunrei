#!/usr/bin/env python3
"""
YouTube Video Location Extractor

Extract location information from YouTube videos using AI (Claude/Gemini).
Supports automatic transcript extraction with Google Cloud STT fallback.
"""

import argparse
import json
import os
import sys
from datetime import datetime

from dotenv import load_dotenv

from utils import extract_video_id, sanitize_channel_name
from video_transcript import extract_video_transcript, VideoTranscript
from audio_transcription import transcribe_video_audio, get_language_code
from extract_locations import (
    AIProvider,
    extract_locations,
    result_to_dict
)
from geocode_locations import geocode_locations


def get_cache_paths(video_id: str, cache_dir: str) -> dict:
    """Get cache file paths for a video."""
    return {
        'transcript': os.path.join(cache_dir, f"{video_id}_transcript.json"),
        'locations': os.path.join(cache_dir, f"{video_id}_locations.json"),
    }


def load_cache(cache_path: str) -> dict | None:
    """Load cached data from file if exists."""
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


def save_cache(cache_path: str, data: dict) -> None:
    """Save data to cache file."""
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def process_video(
    video_url: str,
    provider: AIProvider,
    model: str | None,
    output_dir: str,
    cache_dir: str,
    audio_cache_dir: str | None,
    fallback_language: str,
    skip_stt_fallback: bool,
    skip_geocoding: bool,
    geocode_language: str
) -> dict | None:
    """
    Process a single YouTube video and extract locations.
    Caches intermediate results to allow resuming if interrupted.

    Args:
        video_url: YouTube video URL or ID
        provider: AI provider for location extraction
        model: Model name (or None for default)
        output_dir: Base output directory
        cache_dir: Directory for intermediate cache files
        audio_cache_dir: Directory to cache downloaded audio
        fallback_language: Language code for STT fallback
        skip_stt_fallback: Skip STT fallback if transcript unavailable
        skip_geocoding: Skip Google Maps geocoding
        geocode_language: Language code for geocoding results

    Returns:
        Extracted data dictionary or None if failed
    """
    video_id = extract_video_id(video_url)
    if not video_id:
        print(f"Error: Could not extract video ID from: {video_url}")
        return None

    print(f"\n{'=' * 60}")
    print(f"Processing: {video_url}")
    print(f"{'=' * 60}")

    # Get cache paths
    cache_paths = get_cache_paths(video_id, cache_dir)

    try:
        # Step 1: Extract transcript and metadata (or load from cache)
        print("\n[Step 1] Extracting transcript and metadata...")

        cached_transcript = load_cache(cache_paths['transcript'])
        if cached_transcript:
            print(f"  Using cached transcript: {cache_paths['transcript']}")
            video_data_dict = cached_transcript
            # We need video_data for later steps, reconstruct minimal info
            from video_transcript import VideoMetadata, VideoTranscript, TranscriptEntry

            metadata = VideoMetadata(
                video_id=video_data_dict['video_id'],
                title=video_data_dict['title'],
                description=video_data_dict['description'],
                cleaned_description=video_data_dict['cleaned_description'],
                channel_name=video_data_dict['channel_name'],
                channel_id=video_data_dict['channel_id'],
                published_at=video_data_dict.get('published_at', ''),
                duration=video_data_dict.get('duration', ''),
                view_count=video_data_dict.get('view_count', 0),
                like_count=video_data_dict.get('like_count', 0),
                thumbnails=video_data_dict.get('thumbnails', {}),
                tags=video_data_dict.get('tags', []),
                timeline=video_data_dict.get('timeline', [])
            )

            transcript_entries = [
                TranscriptEntry(text=e['text'], start=e['start'], duration=e['duration'])
                for e in video_data_dict.get('transcript', [])
            ]

            video_data = VideoTranscript(
                metadata=metadata,
                transcript=transcript_entries,
                language=video_data_dict.get('language'),
                transcript_source=video_data_dict.get('transcript_source', 'none'),
                error=video_data_dict.get('error')
            )
        else:
            video_data = extract_video_transcript(video_url)

            # Step 2: Try STT fallback if no transcript
            if not video_data.success and not skip_stt_fallback:
                print(f"\n[Step 2] No transcript available, trying Google Cloud STT...")
                stt_result = transcribe_video_audio(
                    video_id,
                    language_code=get_language_code(fallback_language),
                    cache_dir=audio_cache_dir
                )

                if stt_result.success:
                    video_data.transcript = stt_result.transcript
                    video_data.language = stt_result.language
                    video_data.transcript_source = "google_stt"
                    video_data.error = None
                    print(f"  STT transcription successful ({len(stt_result.transcript)} segments)")
                else:
                    print(f"  STT fallback failed: {stt_result.error}")
            elif not video_data.success:
                print(f"\n[Step 2] Skipping STT fallback (--skip-stt-fallback)")

            # Save transcript to cache
            print(f"  Saving transcript cache: {cache_paths['transcript']}")
            save_cache(cache_paths['transcript'], video_data.to_dict())

        # Step 3: Extract locations using AI (or load from cache)
        print(f"\n[Step 3] Extracting locations with {provider.value}...")

        cached_locations = load_cache(cache_paths['locations'])
        if cached_locations:
            print(f"  Using cached locations: {cache_paths['locations']}")
            output_data = cached_locations
        else:
            if not video_data.success:
                print("  Warning: No transcript available, extracting from description only")

            extraction = extract_locations(video_data, provider, model=model)
            output_data = result_to_dict(video_data, extraction)

            # Save locations to cache (before geocoding)
            print(f"  Saving locations cache: {cache_paths['locations']}")
            save_cache(cache_paths['locations'], output_data)

        # Step 4: Geocode locations using Google Maps
        # Check if locations already have geocoding data
        locations = output_data.get('locations', [])
        needs_geocoding = any(
            loc.get('latitude') is None
            for loc in locations
        ) if locations else False

        if not skip_geocoding and locations and needs_geocoding:
            print(f"\n[Step 4] Geocoding locations with Google Maps...")
            geocode_locations(
                output_data['locations'],
                language=geocode_language
            )
            # Update cache with geocoded data
            save_cache(cache_paths['locations'], output_data)
        elif skip_geocoding:
            print(f"\n[Step 4] Skipping geocoding (--skip-geocoding)")
        elif not locations:
            print(f"\n[Step 4] No locations to geocode")
        else:
            print(f"\n[Step 4] Locations already geocoded, skipping")

        # Step 5: Save final output
        print(f"\n[Step 5] Saving final output...")

        # Create channel-specific directory
        channel_dir_name = sanitize_channel_name(output_data['channel_name'])
        channel_dir = os.path.join(output_dir, channel_dir_name)
        os.makedirs(channel_dir, exist_ok=True)

        # Add timestamp
        output_data['extracted_at'] = datetime.now().isoformat()

        # Save to file
        output_file = os.path.join(channel_dir, f"{video_id}.json")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)

        print(f"  Saved to: {output_file}")
        print(f"  Locations found: {len(locations)}")

        return output_data

    except Exception as e:
        print(f"Error processing {video_url}: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    load_dotenv()

    parser = argparse.ArgumentParser(
        description='Extract location data from YouTube videos using AI',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process a single video with Claude
  uv run python main.py "https://youtube.com/watch?v=VIDEO_ID"

  # Process multiple videos with Gemini
  uv run python main.py URL1 URL2 URL3 --provider gemini

  # Specify output directory
  uv run python main.py URL --output-dir ./my_output

  # Skip STT fallback and geocoding
  uv run python main.py URL --skip-stt-fallback --skip-geocoding

Environment variables:
  YOUTUBE_API_KEY          - Required for video metadata
  ANTHROPIC_API_KEY        - Required for Claude provider
  GEMINI_API_KEY           - Required for Gemini provider
  GOOGLE_MAPS_API_KEY      - Required for geocoding locations
  GOOGLE_APPLICATION_CREDENTIALS - Required for STT fallback
        """
    )

    parser.add_argument(
        'urls',
        nargs='+',
        help='YouTube video URLs or video IDs'
    )
    parser.add_argument(
        '--provider',
        choices=['claude', 'gemini'],
        default='claude',
        help='AI provider for location extraction (default: claude)'
    )
    parser.add_argument(
        '--model',
        help='Specific model to use (uses provider default if not specified)'
    )
    parser.add_argument(
        '--output-dir',
        default='output',
        help='Base directory for output files (default: output)'
    )
    parser.add_argument(
        '--cache-dir',
        default='cache',
        help='Directory for intermediate cache files (default: cache)'
    )
    parser.add_argument(
        '--audio-cache-dir',
        default='audio_cache',
        help='Directory to cache downloaded audio for STT (default: audio_cache)'
    )
    parser.add_argument(
        '--fallback-language',
        default='ko',
        help='Language code for STT fallback (default: ko)'
    )
    parser.add_argument(
        '--skip-stt-fallback',
        action='store_true',
        help='Skip Google Cloud STT fallback if transcript unavailable'
    )
    parser.add_argument(
        '--skip-geocoding',
        action='store_true',
        help='Skip Google Maps geocoding for locations'
    )
    parser.add_argument(
        '--geocode-language',
        default='ko',
        help='Language code for geocoding results (default: ko)'
    )

    args = parser.parse_args()

    # Validate required API keys
    youtube_api_key = os.getenv('YOUTUBE_API_KEY')
    if not youtube_api_key:
        print("Error: YOUTUBE_API_KEY not found in environment")
        print("Please set it in .env file or export it as environment variable")
        sys.exit(1)

    provider = AIProvider(args.provider)
    provider_key_map = {
        AIProvider.CLAUDE: 'ANTHROPIC_API_KEY',
        AIProvider.GEMINI: 'GEMINI_API_KEY'
    }

    ai_api_key = os.getenv(provider_key_map[provider])
    if not ai_api_key:
        print(f"Error: {provider_key_map[provider]} not found in environment")
        print("Please set it in .env file or export it as environment variable")
        sys.exit(1)

    # Print configuration
    print("=" * 60)
    print("YouTube Video Location Extractor")
    print("=" * 60)
    print(f"Provider: {args.provider}")
    if args.model:
        print(f"Model: {args.model}")
    print(f"Videos to process: {len(args.urls)}")
    print(f"Output directory: {args.output_dir}")
    print(f"Cache directory: {args.cache_dir}")
    print(f"STT fallback: {'disabled' if args.skip_stt_fallback else 'enabled'}")
    print(f"Geocoding: {'disabled' if args.skip_geocoding else 'enabled'}")
    print("=" * 60)

    # Process each video
    results = []
    for i, url in enumerate(args.urls, 1):
        print(f"\n[{i}/{len(args.urls)}] Processing video...")
        result = process_video(
            url,
            provider,
            args.model,
            args.output_dir,
            args.cache_dir,
            args.audio_cache_dir,
            args.fallback_language,
            args.skip_stt_fallback,
            args.skip_geocoding,
            args.geocode_language
        )
        if result:
            results.append(result)

    # Print summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Processed: {len(results)}/{len(args.urls)} videos")

    total_locations = sum(len(r.get('locations', [])) for r in results)
    print(f"Total locations extracted: {total_locations}")

    if results:
        print(f"\nOutput saved to: {args.output_dir}/")
        for r in results:
            channel = sanitize_channel_name(r['channel_name'])
            print(f"  - {channel}/{r['video_id']}.json ({len(r['locations'])} locations)")


if __name__ == '__main__':
    main()
