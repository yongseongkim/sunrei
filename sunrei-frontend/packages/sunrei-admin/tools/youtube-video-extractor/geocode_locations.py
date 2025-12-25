"""Geocoding locations using Google Maps Places API."""

import os
import time
import random
from typing import Optional
from dataclasses import dataclass

import googlemaps


@dataclass
class GeocodedLocation:
    """Geocoded location data from Google Maps."""
    latitude: float
    longitude: float
    address: str
    google_maps_id: str
    google_maps_name: str


def geocode_location(
    client: googlemaps.Client,
    query: str,
    language: str = 'ko'
) -> Optional[GeocodedLocation]:
    """
    Search for a location using Google Maps Places API.

    Args:
        client: Google Maps client
        query: Location search query
        language: Language code for results (default: 'ko')

    Returns:
        GeocodedLocation or None if not found
    """
    try:
        result = client.places(query=query, language=language)

        if result and result.get('results'):
            place = result['results'][0]
            location = place['geometry']['location']

            return GeocodedLocation(
                latitude=location['lat'],
                longitude=location['lng'],
                address=place.get('formatted_address', ''),
                google_maps_id=place.get('place_id', ''),
                google_maps_name=place.get('name', '')
            )
        return None

    except Exception as e:
        print(f"    Geocoding error: {e}")
        return None


def geocode_locations(
    locations: list[dict],
    api_key: Optional[str] = None,
    language: str = 'ko',
    delay_range: tuple[float, float] = (0.5, 1.5)
) -> list[dict]:
    """
    Add geocoding data to a list of locations.

    Args:
        locations: List of location dicts with 'query' field
        api_key: Google Maps API key (uses env var if not provided)
        language: Language code for results
        delay_range: Random delay range between requests (min, max) in seconds

    Returns:
        Updated locations list with geocoding data added
    """
    api_key = api_key or os.getenv('GOOGLE_MAPS_API_KEY')
    if not api_key:
        print("  Warning: GOOGLE_MAPS_API_KEY not set, skipping geocoding")
        return locations

    client = googlemaps.Client(key=api_key)
    geocoded_count = 0

    for i, location in enumerate(locations):
        query = location.get('query')
        name = location.get('name', 'Unknown')

        if not query:
            print(f"    [{i+1}/{len(locations)}] {name}: No query, skipping")
            continue

        print(f"    [{i+1}/{len(locations)}] {name}")
        print(f"      Query: {query}")

        result = geocode_location(client, query, language)

        if result:
            location['latitude'] = result.latitude
            location['longitude'] = result.longitude
            location['address'] = result.address
            location['google_maps_id'] = result.google_maps_id
            location['google_maps_name'] = result.google_maps_name
            geocoded_count += 1
            print(f"      Found: {result.google_maps_name}")
            print(f"      Coords: {result.latitude:.6f}, {result.longitude:.6f}")
        else:
            location['latitude'] = None
            location['longitude'] = None
            location['address'] = None
            location['google_maps_id'] = None
            location['google_maps_name'] = None
            print(f"      Not found")

        # Add delay between requests (except for last item)
        if i < len(locations) - 1:
            delay = random.uniform(*delay_range)
            time.sleep(delay)

    print(f"  Geocoded {geocoded_count}/{len(locations)} locations")
    return locations


if __name__ == '__main__':
    import sys
    import json
    from dotenv import load_dotenv

    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python geocode_locations.py <JSON_FILE>")
        print("Adds geocoding data to extracted locations JSON file")
        sys.exit(1)

    input_file = sys.argv[1]
    api_key = os.getenv('GOOGLE_MAPS_API_KEY')

    if not api_key:
        print("Error: GOOGLE_MAPS_API_KEY not found in environment")
        sys.exit(1)

    # Load file
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    locations = data.get('locations', [])
    print(f"Processing {len(locations)} locations...")

    # Geocode
    geocode_locations(locations, api_key)

    # Save back
    with open(input_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\nSaved to {input_file}")
