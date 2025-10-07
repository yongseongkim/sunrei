#!/usr/bin/env python3
"""
Import a YouTube playlist's extracted location data as a single Sunrei to the database.

This script aggregates all videos in a playlist into one Sunrei,
where each video's locations become SunreiSpots.
"""

import json
import os
import sys
import glob
import requests
from typing import Dict, List, Optional
from dotenv import load_dotenv


def load_playlist_summary(playlist_dir: str) -> Dict:
    """
    Load playlist_summary.json from the transcripts directory.

    Args:
        playlist_dir: Path to the playlist directory (e.g., output/PLAYLIST_ID)

    Returns:
        Playlist summary data
    """
    # Extract playlist_id from directory name
    playlist_id = os.path.basename(playlist_dir.rstrip('/'))

    # Look for playlist_summary.json in transcripts directory
    summary_path = os.path.join('transcripts', playlist_id, 'playlist_summary.json')

    if not os.path.exists(summary_path):
        raise FileNotFoundError(f"playlist_summary.json not found at {summary_path}")

    with open(summary_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def convert_playlist_to_create_sunrei_request(
    playlist_dir: str,
    playlist_summary: Optional[Dict] = None
) -> Dict:
    """
    Convert all location JSONs in a playlist directory to a single CreateSunreiRequest.

    Args:
        playlist_dir: Path to the playlist directory (e.g., output/PLAYLIST_ID)
        playlist_summary: Optional playlist summary data from transcripts/PLAYLIST_ID/playlist_summary.json

    Returns:
        Dict in CreateSunreiRequest format
    """
    # Get playlist_id from directory name
    playlist_id = os.path.basename(playlist_dir.rstrip('/'))

    # Load playlist summary if not provided
    if not playlist_summary:
        try:
            playlist_summary = load_playlist_summary(playlist_dir)
        except FileNotFoundError:
            print(f"⚠️  Warning: playlist_summary.json not found, using fallback values")
            playlist_summary = None

    # Find all location JSON files in the playlist directory
    location_files = glob.glob(os.path.join(playlist_dir, '*.json'))

    if not location_files:
        raise ValueError(f"No location JSON files found in {playlist_dir}")

    print(f"Found {len(location_files)} location files")

    # Aggregate all spots from all videos
    all_spots = []
    video_count = 0
    skipped_count = 0

    for location_file in location_files:
        # Skip playlist_summary.json if it exists in the output directory
        if os.path.basename(location_file) == 'playlist_summary.json':
            continue

        with open(location_file, 'r', encoding='utf-8') as f:
            video_data = json.load(f)

        extracted_data = video_data.get('extracted_data', {})
        locations = extracted_data.get('locations', [])
        video_title = video_data.get('video_title', 'Unknown')
        video_url = video_data.get('video_url', '')

        video_count += 1

        if not locations:
            print(f"  ⚠️  No locations in: {video_title}")
            continue

        print(f"  ✓ {len(locations)} location(s) from: {video_title}")

        # Convert each location to a spot
        for location in locations:
            # Skip locations without geocoding data
            if not location.get('latitude') or not location.get('longitude'):
                print(f"    ⚠️  Skipping location without coordinates: {location.get('location_name', 'Unknown')}")
                skipped_count += 1
                continue

            # Prepare place data
            place_data = {
                'name': location['location_name'],
                'address': location.get('address', ''),
                'latitude': location['latitude'],
                'longitude': location['longitude']
            }

            # Add googleMapsId if available
            if location.get('google_maps_id'):
                place_data['googleMapsId'] = location['google_maps_id']

            # Combine video title and location description
            spot_description = f"[{video_title}]\n\n{location.get('description', '')}"

            spot = {
                'title': location['location_name'],
                'description': spot_description,
                'youtubeLink': location.get('video_url_with_timestamp', video_url),
                'place': place_data
            }
            all_spots.append(spot)

    print(f"\nTotal: {len(all_spots)} spot(s) from {video_count} video(s)")
    if skipped_count > 0:
        print(f"Skipped: {skipped_count} location(s) without coordinates")

    # Determine Sunrei title and description
    if playlist_summary:
        # Use channel title as Sunrei title
        channel_title = playlist_summary.get('channel_title', '')
        playlist_title = playlist_summary.get('playlist_title', '')

        # Fallback to first video's channel if not in summary
        if not channel_title:
            first_video = playlist_summary.get('videos', [{}])[0]
            channel_title = first_video.get('channel_title', 'YouTube Playlist')

        sunrei_title = channel_title

        # Build description with playlist title and description
        description_parts = []

        if playlist_title:
            description_parts.append(f"**{playlist_title}**")

        playlist_description = playlist_summary.get('playlist_description', '')
        if playlist_description:
            description_parts.append(playlist_description)

        description_parts.append(f"Total videos: {playlist_summary.get('total_videos', len(location_files))}")

        sunrei_description = '\n\n'.join(description_parts)
    else:
        sunrei_title = f"YouTube Playlist {playlist_id}"
        sunrei_description = f"Aggregated locations from {video_count} videos"

    # Create request payload
    request = {
        'title': sunrei_title,
        'description': sunrei_description,
        'link': f'https://www.youtube.com/playlist?list={playlist_id}',
        'spots': all_spots
    }

    return request


def import_playlist_to_database(
    playlist_dir: str,
    api_url: str,
    api_token: Optional[str] = None,
    dry_run: bool = False
) -> None:
    """
    Import a playlist's location data as a single Sunrei to the database.

    Args:
        playlist_dir: Path to the playlist directory (e.g., output/PLAYLIST_ID)
        api_url: Base URL of the Sunrei Admin API
        api_token: JWT token for authentication (optional if not required)
        dry_run: If True, only print the request without sending it
    """
    playlist_id = os.path.basename(playlist_dir.rstrip('/'))

    # Load playlist summary
    try:
        playlist_summary = load_playlist_summary(playlist_dir)
        print(f"Loaded playlist summary: {playlist_summary.get('total_videos', 0)} videos")
    except FileNotFoundError as e:
        print(f"⚠️  {e}")
        playlist_summary = None

    # Convert to API request format
    request_data = convert_playlist_to_create_sunrei_request(playlist_dir, playlist_summary)

    print(f"\nCreating Sunrei from playlist: {playlist_id}")
    print(f"  Title: {request_data['title']}")
    print(f"  Spots: {len(request_data['spots'])}")

    if dry_run:
        print("\n[DRY RUN] Request payload:")
        print(json.dumps(request_data, ensure_ascii=False, indent=2))
        return

    # Prepare headers
    headers = {
        'Content-Type': 'application/json'
    }
    if api_token:
        headers['Authorization'] = f'Bearer {api_token}'

    # Send POST request
    endpoint = f"{api_url}/admin/sunreis"
    print(f"\nSending POST request to {endpoint}...")

    try:
        response = requests.post(
            endpoint,
            json=request_data,
            headers=headers
        )

        if response.status_code in [200, 201]:
            result = response.json()
            print(f"✓ Successfully created Sunrei!")
            print(f"  ID: {result.get('id', 'N/A')}")
            print(f"  Title: {result.get('title', 'N/A')}")
            print(f"  Spots: {len(result.get('spots', []))}")
        else:
            print(f"✗ Failed to create Sunrei")
            print(f"  Status: {response.status_code}")
            print(f"  Response: {response.text}")

    except Exception as e:
        print(f"✗ Error: {str(e)}")


def batch_import_playlists(
    output_base_dir: str,
    api_url: str,
    api_token: Optional[str] = None,
    dry_run: bool = False
) -> None:
    """
    Import all playlists from the output directory.

    Args:
        output_base_dir: Base output directory (e.g., output/)
        api_url: Base URL of the Sunrei Admin API
        api_token: JWT token for authentication
        dry_run: If True, only print the requests without sending them
    """
    # Find all playlist directories
    playlist_dirs = [
        d for d in glob.glob(os.path.join(output_base_dir, '*'))
        if os.path.isdir(d)
    ]

    if not playlist_dirs:
        print(f"No playlist directories found in {output_base_dir}")
        return

    print(f"Found {len(playlist_dirs)} playlist(s)")

    for i, playlist_dir in enumerate(playlist_dirs, 1):
        playlist_id = os.path.basename(playlist_dir)
        print(f"\n{'='*60}")
        print(f"[{i}/{len(playlist_dirs)}] Processing playlist: {playlist_id}")
        print('='*60)

        import_playlist_to_database(playlist_dir, api_url, api_token, dry_run)


if __name__ == '__main__':
    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python import_playlist_to_database.py <PLAYLIST_DIR> [--dry-run]")
        print("  PLAYLIST_DIR: Playlist directory (e.g., output/PLAYLIST_ID) or base output directory for batch import")
        print("  --dry-run: Print request payload without sending")
        print("")
        print("Environment variables:")
        print("  SUNREI_API_URL: Base URL of Sunrei Admin API (default: http://localhost:8080)")
        print("  SUNREI_API_TOKEN: JWT token for authentication (optional)")
        print("")
        print("Examples:")
        print("  # Import single playlist")
        print("  python import_playlist_to_database.py output/PLDarQlAimXcFD3CqCK8TGGDLeUOGJDj6z")
        print("")
        print("  # Import all playlists in output/")
        print("  python import_playlist_to_database.py output/")
        print("")
        print("  # Dry run to preview the request")
        print("  python import_playlist_to_database.py output/PLAYLIST_ID --dry-run")
        sys.exit(1)

    path = sys.argv[1]
    dry_run = '--dry-run' in sys.argv

    api_url = os.getenv('SUNREI_API_URL', 'http://localhost:8080')
    api_token = os.getenv('SUNREI_API_TOKEN')

    # Check if path is a specific playlist directory or base output directory
    if os.path.isdir(path):
        # Check if it contains JSON files (specific playlist) or subdirectories (base output dir)
        json_files = glob.glob(os.path.join(path, '*.json'))
        subdirs = [d for d in glob.glob(os.path.join(path, '*')) if os.path.isdir(d)]

        if json_files:
            # Specific playlist directory
            import_playlist_to_database(path, api_url, api_token, dry_run)
        elif subdirs:
            # Base output directory with multiple playlists
            batch_import_playlists(path, api_url, api_token, dry_run)
        else:
            print(f"Error: {path} contains no JSON files or subdirectories")
            sys.exit(1)
    else:
        print(f"Error: {path} is not a valid directory")
        sys.exit(1)
