#!/usr/bin/env python3
"""
Import extracted YouTube location data to Sunrei database via Admin API.
"""

import json
import os
import sys
import requests
from typing import Dict, List, Optional
from dotenv import load_dotenv


def convert_to_create_sunrei_request(json_data: Dict) -> Dict:
    """
    Convert extracted location JSON to CreateSunreiRequest format.

    Args:
        json_data: Extracted location data from extract_locations.py + geocode_locations.py

    Returns:
        Dict in CreateSunreiRequest format
    """
    extracted_data = json_data.get('extracted_data', {})
    locations = extracted_data.get('locations', [])

    # Convert locations to spots
    spots = []
    for location in locations:
        # Skip locations without geocoding data
        if not location.get('latitude') or not location.get('longitude'):
            print(f"⚠️  Skipping location without coordinates: {location.get('location_name', 'Unknown')}")
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

        spot = {
            'title': location['location_name'],
            'description': location.get('description', ''),
            'youtubeLink': location.get('video_url_with_timestamp'),
            'place': place_data
        }
        spots.append(spot)

    # Create request payload
    request = {
        'title': json_data['video_title'],
        'description': extracted_data.get('video_summary', ''),
        'link': json_data.get('video_url'),
        'spots': spots
    }

    return request


def import_to_database(
    json_file: str,
    api_url: str,
    api_token: Optional[str] = None,
    dry_run: bool = False
) -> None:
    """
    Import extracted location data to Sunrei database.

    Args:
        json_file: Path to JSON file with extracted locations
        api_url: Base URL of the Sunrei Admin API
        api_token: JWT token for authentication (optional if not required)
        dry_run: If True, only print the request without sending it
    """
    # Load JSON file
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Convert to API request format
    request_data = convert_to_create_sunrei_request(data)

    print(f"Converting: {data['video_title']}")
    print(f"Locations to import: {len(request_data['spots'])}")

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


def batch_import(
    input_dir: str,
    api_url: str,
    api_token: Optional[str] = None,
    dry_run: bool = False
) -> None:
    """
    Import all location files from a directory.

    Args:
        input_dir: Directory containing location JSON files
        api_url: Base URL of the Sunrei Admin API
        api_token: JWT token for authentication
        dry_run: If True, only print the requests without sending them
    """
    import glob

    # Search recursively for location files in playlist subdirectories
    location_files = glob.glob(f"{input_dir}/**/*.json", recursive=True)
    # Exclude playlist_summary.json files
    location_files = [f for f in location_files if os.path.basename(f) != 'playlist_summary.json']

    print(f"Found {len(location_files)} location files")

    for i, file in enumerate(location_files, 1):
        print(f"\n{'='*60}")
        print(f"[{i}/{len(location_files)}] {os.path.basename(file)}")
        print('='*60)

        import_to_database(file, api_url, api_token, dry_run)


if __name__ == '__main__':
    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python import_to_database.py <INPUT_FILE_OR_DIR> [--dry-run]")
        print("  INPUT_FILE_OR_DIR: Single file or directory with location JSON files")
        print("  --dry-run: Print request payload without sending")
        print("")
        print("Environment variables:")
        print("  SUNREI_API_URL: Base URL of Sunrei Admin API (default: http://localhost:8080)")
        print("  SUNREI_API_TOKEN: JWT token for authentication (optional)")
        sys.exit(1)

    path = sys.argv[1]
    dry_run = '--dry-run' in sys.argv

    api_url = os.getenv('SUNREI_API_URL', 'http://localhost:8080')
    api_token = os.getenv('SUNREI_API_TOKEN')

    if os.path.isfile(path):
        import_to_database(path, api_url, api_token, dry_run)
    elif os.path.isdir(path):
        batch_import(path, api_url, api_token, dry_run)
    else:
        print(f"Error: {path} is not a valid file or directory")
        sys.exit(1)
