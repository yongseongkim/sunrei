#!/usr/bin/env python3

import argparse
import json
import os
import sys
import time
from datetime import datetime

from dotenv import load_dotenv

from utils import extract_video_id, extract_playlist_id, is_playlist_url, sanitize_channel_name, validate_transcript_quality
from video_transcript import (
    extract_video_transcript,
    VideoTranscript,
    get_playlist_metadata,
    get_playlist_video_ids
)
from audio_transcription import transcribe_video_audio, get_language_code
from extract_locations import (
    AIProvider,
    extract_locations,
    result_to_dict
)
from geocode_locations import geocode_locations


def get_cache_paths(video_id: str, cache_dir: str) -> dict:
    return {
        'transcript': os.path.join(cache_dir, f"{video_id}_transcript.json"),
        'locations': os.path.join(cache_dir, f"{video_id}_locations.json"),
    }


def load_cache(cache_path: str) -> dict | None:
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


def save_cache(cache_path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def wait_with_countdown(seconds: int, message: str = "Waiting") -> None:
    for remaining in range(seconds, 0, -1):
        sys.stdout.write(f"\r  {message}: {remaining}s remaining...  ")
        sys.stdout.flush()
        time.sleep(1)
    sys.stdout.write(f"\r  {message}: Done!                         \n")
    sys.stdout.flush()


def get_playlist_cache_path(playlist_id: str, cache_dir: str) -> str:
    return os.path.join(cache_dir, f"playlist_{playlist_id}_state.json")


def load_playlist_state(playlist_id: str, cache_dir: str) -> dict:
    cache_path = get_playlist_cache_path(playlist_id, cache_dir)
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {
        'processed_video_ids': [],
        'failed_video_ids': [],
        'last_processed_index': -1
    }


def save_playlist_state(playlist_id: str, cache_dir: str, state: dict) -> None:
    cache_path = get_playlist_cache_path(playlist_id, cache_dir)
    os.makedirs(os.path.dirname(cache_path) if os.path.dirname(cache_path) else '.', exist_ok=True)
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def process_video(
    video_id: str,
    provider: AIProvider,
    model: str | None,
    output_dir: str,
    cache_dir: str,
    audio_cache_dir: str | None,
    fallback_language: str,
    whisper_model: str,
    skip_stt_fallback: bool,
    skip_geocoding: bool,
    geocode_language: str,
    only_step: str | None = None,
    use_gemini_stt: bool = False
) -> dict | None:
    print(f"\n{'=' * 60}")
    print(f"Processing: {video_id}" + (f" (--only {only_step})" if only_step else ""))
    print(f"{'=' * 60}")

    cache_paths = get_cache_paths(video_id, cache_dir)

    try:
        # Step 1: Transcript
        if only_step in (None, 'transcript', 'locations'):
            print("\n[Step 1] Extracting transcript and metadata...")

            cached_transcript = load_cache(cache_paths['transcript'])
            if cached_transcript:
                print(f"  Using cached transcript: {cache_paths['transcript']}")
                video_data_dict = cached_transcript
            else:
                if only_step == 'locations':
                    print(f"  Error: No cached transcript. Run --only transcript first.")
                    return None

                video_data = extract_video_transcript(video_id)

                if not video_data.success and not skip_stt_fallback:
                    print(f"\n[Step 2] No transcript available, trying {'Gemini' if use_gemini_stt else 'Whisper'} STT...")
                    stt_result = transcribe_video_audio(
                        video_id,
                        language=get_language_code(fallback_language),
                        whisper_model=whisper_model,
                        cache_dir=audio_cache_dir,
                        use_gemini=use_gemini_stt
                    )

                    if stt_result.success:
                        video_data.transcript = stt_result.transcript
                        video_data.language = stt_result.language
                        video_data.transcript_source = stt_result.source
                        video_data.error = None
                        print(f"  STT transcription successful via {stt_result.source} ({len(stt_result.transcript)} segments)")
                    else:
                        print(f"  STT fallback failed: {stt_result.error}")
                elif not video_data.success:
                    print(f"\n[Step 2] Skipping STT fallback (--skip-stt-fallback)")

                print(f"  Saving transcript cache: {cache_paths['transcript']}")
                save_cache(cache_paths['transcript'], video_data.to_dict())
                video_data_dict = video_data.to_dict()

            if only_step == 'transcript':
                # Validate transcript quality
                is_valid, reason = validate_transcript_quality(
                    video_data_dict.get('transcript', []),
                    video_data_dict.get('duration', '')
                )
                if not is_valid:
                    print(f"\n  Transcript quality check failed: {reason}")
                    video_data_dict['success'] = False
                    video_data_dict['error'] = f"Transcript quality check failed: {reason}"
                    save_cache(cache_paths['transcript'], video_data_dict)
                    return None

                print(f"\n  Done. Transcript saved to: {cache_paths['transcript']}")
                return video_data_dict

            # Validate transcript quality before proceeding
            is_valid, reason = validate_transcript_quality(
                video_data_dict.get('transcript', []),
                video_data_dict.get('duration', '')
            )
            if not is_valid:
                print(f"\n  Transcript quality check failed: {reason}")
                return None

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

        # Step 3: Location extraction
        if only_step in (None, 'locations', 'geocode'):
            if only_step == 'geocode':
                cached_locations = load_cache(cache_paths['locations'])
                if not cached_locations:
                    print(f"  Error: No cached locations. Run --only locations first.")
                    return None
                output_data = cached_locations
            else:
                print(f"\n[Step 3] Extracting locations with {provider.value}...")

                cached_locations = load_cache(cache_paths['locations'])
                if cached_locations:
                    print(f"  Using cached locations: {cache_paths['locations']}")
                    output_data = cached_locations
                else:
                    if not video_data.success:
                        print("  Warning: No transcript available, extracting from description only")

                    try:
                        extraction = extract_locations(video_data, provider, model=model)
                        output_data = result_to_dict(video_data, extraction)
                    except Exception as e:
                        print(f"  Location extraction failed: {e}")
                        output_data = {
                            'channel_name': video_data.metadata.channel_name,
                            'channel_id': video_data.metadata.channel_id,
                            'video_id': video_data.metadata.video_id,
                            'video_title': video_data.metadata.title,
                            'video_url': video_data.metadata.url,
                            'video_summary': '',
                            'locations': [],
                            'metadata': {
                                'provider': provider.value,
                                'model': None,
                                'transcript_source': video_data.transcript_source,
                                'transcript_language': video_data.language
                            }
                        }

                    print(f"  Saving locations cache: {cache_paths['locations']}")
                    save_cache(cache_paths['locations'], output_data)

                if only_step == 'locations':
                    print(f"\n  Done. Locations saved to: {cache_paths['locations']}")
                    return output_data

        # Step 4: Geocoding
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
            save_cache(cache_paths['locations'], output_data)
        elif skip_geocoding:
            print(f"\n[Step 4] Skipping geocoding (--skip-geocoding)")
        elif not locations:
            print(f"\n[Step 4] No locations to geocode")
        else:
            print(f"\n[Step 4] Locations already geocoded, skipping")

        if only_step == 'geocode':
            print(f"\n  Done. Geocoded locations saved to: {cache_paths['locations']}")
            return output_data

        # Step 5: Save final output
        print(f"\n[Step 5] Saving final output...")

        channel_dir_name = sanitize_channel_name(output_data['channel_name'])
        channel_dir = os.path.join(output_dir, channel_dir_name)
        os.makedirs(channel_dir, exist_ok=True)

        output_data['extracted_at'] = datetime.now().isoformat()

        output_file = os.path.join(channel_dir, f"{video_id}.json")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)

        print(f"  Saved to: {output_file}")
        print(f"  Locations found: {len(locations)}")

        return output_data

    except Exception as e:
        print(f"Error processing {video_id}: {e}")
        import traceback
        traceback.print_exc()
        return None


def process_playlist(
    playlist_id: str,
    provider: AIProvider,
    model: str | None,
    output_dir: str,
    cache_dir: str,
    audio_cache_dir: str | None,
    fallback_language: str,
    whisper_model: str,
    skip_stt_fallback: bool,
    skip_geocoding: bool,
    geocode_language: str,
    transcript_delay: int = 60,
    only_step: str | None = None,
    use_gemini_stt: bool = False
) -> list[dict]:
    print(f"\n{'=' * 60}")
    print(f"Processing Playlist: {playlist_id}")
    print(f"{'=' * 60}")

    playlist_meta = get_playlist_metadata(playlist_id)
    if not playlist_meta:
        print(f"Error: Playlist not found: {playlist_id}")
        return []

    print(f"  Title: {playlist_meta.title}")
    print(f"  Channel: {playlist_meta.channel_name}")
    print(f"  Videos: {playlist_meta.video_count}")

    print(f"\nFetching video list...")
    videos = get_playlist_video_ids(playlist_id)
    print(f"  Found {len(videos)} videos")

    state = load_playlist_state(playlist_id, cache_dir)
    processed_ids = set(state['processed_video_ids'])

    videos_to_process = [
        v for v in videos
        if v.video_id not in processed_ids
    ]

    if len(videos_to_process) < len(videos):
        print(f"  Resuming: {len(videos) - len(videos_to_process)} already processed")

    print(f"  To process: {len(videos_to_process)} videos")
    print(f"  Rate limit delay: {transcript_delay}s between videos")

    if transcript_delay > 0 and len(videos_to_process) > 0:
        estimated_time = len(videos_to_process) * transcript_delay
        print(f"  Estimated time: ~{estimated_time // 60}m {estimated_time % 60}s (excluding processing)")

    results = []

    for i, video in enumerate(videos_to_process):
        video_id = video.video_id

        display_title = video.title[:50] + "..." if len(video.title) > 50 else video.title
        print(f"\n[{i + 1}/{len(videos_to_process)}] {display_title}")

        transcript_cache_path = os.path.join(cache_dir, f"{video_id}_transcript.json")
        needs_transcript_fetch = not os.path.exists(transcript_cache_path)

        try:
            result = process_video(
                video_id,
                provider,
                model,
                output_dir,
                cache_dir,
                audio_cache_dir,
                fallback_language,
                whisper_model,
                skip_stt_fallback,
                skip_geocoding,
                geocode_language,
                only_step,
                use_gemini_stt
            )

            if result:
                results.append(result)
                state['processed_video_ids'].append(video_id)
            else:
                state['failed_video_ids'].append(video_id)
        except Exception as e:
            print(f"  Error: {e} - skipping to next video")
            state['failed_video_ids'].append(video_id)

        state['last_processed_index'] = i
        save_playlist_state(playlist_id, cache_dir, state)

        if transcript_delay > 0 and needs_transcript_fetch and i < len(videos_to_process) - 1:
            wait_with_countdown(transcript_delay, "Rate limit delay before next video")

    return results


def main():
    load_dotenv()

    parser = argparse.ArgumentParser(
        description='Extract location data from YouTube videos using AI',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  uv run python main.py "https://youtube.com/watch?v=VIDEO_ID"
  uv run python main.py "https://www.youtube.com/playlist?list=PLxxxxxx"
  uv run python main.py "https://www.youtube.com/playlist?list=PLxxxxxx" --transcript-delay 30
  uv run python main.py URL1 URL2 URL3 --provider gemini
  uv run python main.py URL --skip-stt-fallback --skip-geocoding

Environment variables:
  YOUTUBE_API_KEY          - Required for video metadata
  ANTHROPIC_API_KEY        - Required for Claude provider
  GEMINI_API_KEY           - Required for Gemini provider
  GOOGLE_MAPS_API_KEY      - Required for geocoding locations
        """
    )

    parser.add_argument('urls', nargs='+', help='YouTube video URLs, video IDs, or playlist URLs')
    parser.add_argument('--provider', choices=['claude', 'gemini'], default='claude',
                        help='AI provider for location extraction (default: claude)')
    parser.add_argument('--model', help='Specific model to use (uses provider default if not specified)')
    parser.add_argument('--output-dir', default='output', help='Base directory for output files (default: output)')
    parser.add_argument('--cache-dir', default='cache', help='Directory for intermediate cache files (default: cache)')
    parser.add_argument('--audio-cache-dir', default='audio_cache',
                        help='Directory to cache downloaded audio for STT (default: audio_cache)')
    parser.add_argument('--fallback-language', default='ko',
                        help='Language code for Whisper STT fallback (default: ko)')
    parser.add_argument('--whisper-model', default='medium', choices=['tiny', 'base', 'small', 'medium', 'large'],
                        help='Whisper model size for STT fallback (default: medium)')
    parser.add_argument('--skip-stt-fallback', action='store_true',
                        help='Skip STT fallback if transcript unavailable')
    parser.add_argument('--use-gemini-stt', action='store_true',
                        help='Use Gemini for STT instead of Whisper (Whisper is default)')
    parser.add_argument('--skip-geocoding', action='store_true', help='Skip Google Maps geocoding for locations')
    parser.add_argument('--geocode-language', default='ko', help='Language code for geocoding results (default: ko)')
    parser.add_argument('--transcript-delay', type=int, default=60,
                        help='Seconds to wait between transcript fetches for rate limiting (default: 60)')
    parser.add_argument('--no-rate-limit', action='store_true',
                        help='Disable rate limiting (use with caution, may cause API errors)')
    parser.add_argument('--only', choices=['transcript', 'locations', 'geocode'],
                        help='Run only specific step (transcript/locations/geocode)')

    args = parser.parse_args()

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

    transcript_delay = 0 if args.no_rate_limit else args.transcript_delay

    playlist_urls = [url for url in args.urls if is_playlist_url(url)]
    video_urls = [url for url in args.urls if not is_playlist_url(url)]

    print("=" * 60)
    print("YouTube Video Location Extractor")
    print("=" * 60)
    print(f"Provider: {args.provider}")
    if args.model:
        print(f"Model: {args.model}")
    print(f"Playlists to process: {len(playlist_urls)}")
    print(f"Individual videos to process: {len(video_urls)}")
    print(f"Output directory: {args.output_dir}")
    print(f"Cache directory: {args.cache_dir}")
    print(f"Transcript rate limit: {transcript_delay}s" if transcript_delay > 0 else "Rate limiting: disabled")
    print(f"STT fallback: {'disabled' if args.skip_stt_fallback else 'enabled'}")
    print(f"Geocoding: {'disabled' if args.skip_geocoding else 'enabled'}")
    print("=" * 60)

    results = []

    for playlist_url in playlist_urls:
        playlist_id = extract_playlist_id(playlist_url)
        if not playlist_id:
            print(f"Error: Could not extract playlist ID from: {playlist_url}")
            continue

        playlist_results = process_playlist(
            playlist_id,
            provider,
            args.model,
            args.output_dir,
            args.cache_dir,
            args.audio_cache_dir,
            args.fallback_language,
            args.whisper_model,
            args.skip_stt_fallback,
            args.skip_geocoding,
            args.geocode_language,
            transcript_delay,
            args.only,
            args.use_gemini_stt
        )
        results.extend(playlist_results)

    for i, url in enumerate(video_urls, 1):
        video_id = extract_video_id(url)
        if not video_id:
            print(f"Error: Could not extract video ID from: {url}")
            continue

        print(f"\n[{i}/{len(video_urls)}] Processing video...")

        transcript_cache_path = os.path.join(args.cache_dir, f"{video_id}_transcript.json")
        needs_transcript_fetch = not os.path.exists(transcript_cache_path)

        result = process_video(
            video_id,
            provider,
            args.model,
            args.output_dir,
            args.cache_dir,
            args.audio_cache_dir,
            args.fallback_language,
            args.whisper_model,
            args.skip_stt_fallback,
            args.skip_geocoding,
            args.geocode_language,
            args.only,
            args.use_gemini_stt
        )
        if result:
            results.append(result)

        if transcript_delay > 0 and needs_transcript_fetch and i < len(video_urls):
            wait_with_countdown(transcript_delay, "Rate limit delay")

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Processed: {len(results)} videos")

    if args.only == 'transcript':
        print(f"\nTranscripts saved to: {args.cache_dir}/")
        for r in results:
            print(f"  - {r['video_id']}_transcript.json")
    else:
        total_locations = sum(len(r.get('locations', [])) for r in results)
        print(f"Total locations extracted: {total_locations}")

        if results:
            print(f"\nOutput saved to: {args.output_dir}/")
            for r in results:
                channel = sanitize_channel_name(r.get('channel_name', 'unknown'))
                print(f"  - {channel}/{r['video_id']}.json ({len(r.get('locations', []))} locations)")


if __name__ == '__main__':
    main()
