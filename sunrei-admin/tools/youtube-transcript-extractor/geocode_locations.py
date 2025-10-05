#!/usr/bin/env python3
"""
Add geocoding (latitude/longitude) to extracted location data using Google Maps Geocoding API.
"""

import json
import os
import sys
from typing import Dict, Optional
import googlemaps
from dotenv import load_dotenv


def geocode_location(gmaps_client: googlemaps.Client, location_query: str) -> Optional[Dict]:
    """
    Geocode a location query to get latitude and longitude.

    Args:
        gmaps_client: Google Maps client
        location_query: Location search query

    Returns:
        Dict with latitude and longitude, or None if not found
    """
    try:
        result = gmaps_client.geocode(location_query)
        if result:
            location = result[0]['geometry']['location']
            return {
                'latitude': location['lat'],
                'longitude': location['lng']
            }
        return None
    except Exception as e:
        print(f"  ✗ Geocoding failed: {str(e)}")
        return None


def add_geocoding_to_file(
    input_file: str,
    api_key: str,
    output_file: Optional[str] = None
) -> None:
    """
    Add geocoding data to an extracted locations JSON file.

    Args:
        input_file: Path to input JSON file (from extract_locations.py)
        api_key: Google Maps API key
        output_file: Path to output file (defaults to overwriting input)
    """
    # Load input file
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    gmaps_client = googlemaps.Client(key=api_key)

    extracted_data = data.get('extracted_data', {})
    locations = extracted_data.get('locations', [])

    print(f"Processing {len(locations)} locations...")

    geocoded_count = 0
    for i, location in enumerate(locations, 1):
        location_query = location.get('location_query')
        if not location_query:
            print(f"[{i}/{len(locations)}] {location.get('location_name', 'Unknown')}: No location_query")
            continue

        print(f"[{i}/{len(locations)}] {location.get('location_name', 'Unknown')}")
        print(f"  Query: {location_query}")

        coords = geocode_location(gmaps_client, location_query)
        if coords:
            location['latitude'] = coords['latitude']
            location['longitude'] = coords['longitude']
            print(f"  ✓ Geocoded: {coords['latitude']:.6f}, {coords['longitude']:.6f}")
            geocoded_count += 1
        else:
            location['latitude'] = None
            location['longitude'] = None
            print(f"  ✗ Not found")

    # Save to output file
    if not output_file:
        output_file = input_file

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Geocoded {geocoded_count}/{len(locations)} locations")
    print(f"✓ Saved to {output_file}")


def batch_geocode(
    input_dir: str,
    api_key: str,
    output_dir: Optional[str] = None
) -> None:
    """
    Add geocoding to all location files in a directory (recursively searches playlist subdirectories).

    Args:
        input_dir: Directory containing location JSON files
        api_key: Google Maps API key
        output_dir: Output directory (defaults to overwriting input files)
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

        if output_dir:
            output_file = os.path.join(output_dir, os.path.basename(file))
        else:
            output_file = None

        add_geocoding_to_file(file, api_key, output_file)


if __name__ == '__main__':
    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python geocode_locations.py <INPUT_FILE_OR_DIR>")
        print("  INPUT_FILE_OR_DIR: Single file or directory with location JSON files")
        sys.exit(1)

    path = sys.argv[1]
    api_key = os.getenv('GOOGLE_MAPS_API_KEY')

    if not api_key:
        print("Error: GOOGLE_MAPS_API_KEY not found in environment")
        print("Add it to your .env file")
        sys.exit(1)

    if os.path.isfile(path):
        add_geocoding_to_file(path, api_key)
    elif os.path.isdir(path):
        batch_geocode(path, api_key)
    else:
        print(f"Error: {path} is not a valid file or directory")
        sys.exit(1)
