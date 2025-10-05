#!/usr/bin/env python3
"""
YouTube Transcript to Sunrei Data Extractor

This script extracts transcripts from YouTube playlists and uses AI to extract
location information suitable for creating Sunrei entries in the admin panel.
"""

import os
import sys
import argparse
from dotenv import load_dotenv
from playlist_to_transcripts import extract_playlist_transcripts
from extract_locations import batch_extract_locations, AIProvider


def main():
    load_dotenv()

    parser = argparse.ArgumentParser(
        description='Extract Sunrei location data from YouTube playlists'
    )
    parser.add_argument(
        'playlist_id',
        help='YouTube playlist ID'
    )
    parser.add_argument(
        '--provider',
        choices=['openai', 'gemini'],
        default='openai',
        help='AI provider to use for location extraction (default: openai)'
    )
    parser.add_argument(
        '--model',
        help='Specific model to use (optional, uses provider default if not specified)'
    )
    parser.add_argument(
        '--transcript-dir',
        default='transcripts',
        help='Directory to save transcripts (default: transcripts)'
    )
    parser.add_argument(
        '--output-dir',
        default='output',
        help='Directory to save extracted location data (default: output)'
    )
    parser.add_argument(
        '--skip-transcripts',
        action='store_true',
        help='Skip transcript extraction (use existing transcripts)'
    )
    parser.add_argument(
        '--skip-extraction',
        action='store_true',
        help='Skip location extraction (only extract transcripts)'
    )

    args = parser.parse_args()

    # Check required API keys
    youtube_api_key = os.getenv('YOUTUBE_API_KEY')
    if not args.skip_transcripts and not youtube_api_key:
        print("Error: YOUTUBE_API_KEY not found in environment")
        print("Please set it in .env file or export it as environment variable")
        sys.exit(1)

    ai_provider = AIProvider(args.provider)
    provider_key_map = {
        AIProvider.OPENAI: 'OPENAI_API_KEY',
        AIProvider.GEMINI: 'GEMINI_API_KEY'
    }

    if not args.skip_extraction:
        ai_api_key = os.getenv(provider_key_map[ai_provider])
        if not ai_api_key:
            print(f"Error: {provider_key_map[ai_provider]} not found in environment")
            print("Please set it in .env file or export it as environment variable")
            sys.exit(1)

    print("=" * 60)
    print("YouTube Transcript to Sunrei Data Extractor")
    print("=" * 60)
    print(f"Playlist ID: {args.playlist_id}")
    print(f"AI Provider: {args.provider}")
    if args.model:
        print(f"Model: {args.model}")
    print("=" * 60)

    # Step 1: Extract transcripts
    if not args.skip_transcripts:
        print("\n[STEP 1] Extracting transcripts from playlist...")
        print("-" * 60)
        extract_playlist_transcripts(
            args.playlist_id,
            youtube_api_key,
            args.transcript_dir
        )
    else:
        print("\n[STEP 1] Skipping transcript extraction (using existing)")
        print("-" * 60)

    # Step 2: Extract locations
    if not args.skip_extraction:
        print("\n[STEP 2] Extracting locations from transcripts...")
        print("-" * 60)

        # Construct playlist-specific transcript directory
        playlist_transcript_dir = os.path.join(args.transcript_dir, args.playlist_id)

        batch_extract_locations(
            playlist_transcript_dir,
            ai_provider,
            model=args.model,
            output_dir=args.output_dir
        )
    else:
        print("\n[STEP 2] Skipping location extraction")
        print("-" * 60)

    print("\n" + "=" * 60)
    print("✓ Process completed successfully!")
    print("=" * 60)
    print(f"\nTranscripts saved to: {os.path.join(args.transcript_dir, args.playlist_id)}/")
    if not args.skip_extraction:
        print(f"Extracted data saved to: {os.path.join(args.output_dir, args.playlist_id)}/")
        print("\nYou can now use the JSON files in the output directory")
        print("to fill in the Sunrei form in the admin panel.")


if __name__ == '__main__':
    main()
