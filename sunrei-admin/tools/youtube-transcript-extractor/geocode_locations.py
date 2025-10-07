#!/usr/bin/env python3
"""
Add geocoding (latitude/longitude) to extracted location data using Google Maps Geocoding API.
"""

import json
import os
import sys
import time
import random
from typing import Dict, Optional
import googlemaps
from dotenv import load_dotenv


def geocode_location(gmaps_client: googlemaps.Client, location_query: str, language: str = 'ko') -> Optional[Dict]:
    """
    Search for a location using Google Maps Places API (text search) to get latitude, longitude, address, and place_id.

    Args:
        gmaps_client: Google Maps client
        location_query: Location search query (keyword search)
        language: Language code for results (default: 'ko' for Korean)

    Returns:
        Dict with latitude, longitude, address, and google_maps_id, or None if not found
    """
    try:
        # Use Places API text search instead of geocoding for better keyword matching
        result = gmaps_client.places(query=location_query, language=language)

        if result and result.get('results'):
            place = result['results'][0]  # Get the first (best) result
            location = place['geometry']['location']
            formatted_address = place.get('formatted_address', '')
            place_id = place.get('place_id', '')
            place_name = place.get('name', '')

            return {
                'latitude': location['lat'],
                'longitude': location['lng'],
                'address': formatted_address,
                'google_maps_id': place_id,
                'name': place_name
            }
        return None
    except Exception as e:
        print(f"  ✗ Place search failed: {str(e)}")
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

        geocode_data = geocode_location(gmaps_client, location_query)
        if geocode_data:
            location['latitude'] = geocode_data['latitude']
            location['longitude'] = geocode_data['longitude']
            location['address'] = geocode_data['address']
            location['google_maps_id'] = geocode_data['google_maps_id']
            print(f"  ✓ Found: {geocode_data['name']}")
            print(f"  ✓ Coordinates: {geocode_data['latitude']:.6f}, {geocode_data['longitude']:.6f}")
            print(f"  ✓ Address: {geocode_data['address']}")
            print(f"  ✓ Place ID: {geocode_data['google_maps_id']}")
            geocoded_count += 1
        else:
            location['latitude'] = None
            location['longitude'] = None
            location['address'] = None
            location['google_maps_id'] = None
            print(f"  ✗ Not found")

        # Add delay to avoid rate limiting (except for the last item)
        if i < len(locations):
            delay = random.uniform(1, 3)
            print(f"  ⏱️  Waiting {delay:.1f}s to avoid rate limiting...")
            time.sleep(delay)

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
