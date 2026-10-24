"""Find extracted Instagram places on Google Maps (Places Text Search, stdlib only).

Uses the YouTube geocoder's field mask and name check, and adds a branch check:
a Korean result whose address lacks the 시/구/군 named in the candidate's area
(방울과꼬막 서순라점 → 용산구 branch) is a NAME_MISMATCH. Places without a
business name are never searched. A location tag's coordinates bias the search
only when the tag names the venue itself.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "youtube"))
from _common import http_json  # noqa: E402
# branch_mismatch는 YouTube 지오코더와 같이 쓰며, import_workspace와 테스트가 이 모듈에서 가져간다.
from geocode import FIELDS, PLACES, branch_mismatch, looks_like_non_name, name_matches  # noqa: E402,F401

BIAS_RADIUS_METERS = 500.0


def search(key, text, bias=None, cache=None):
    """Return up to three Places results for a query; cached per (text, bias). Raises on HTTP errors."""
    cache_key = f"{text}|{bias}"
    if cache is not None and cache_key in cache:
        return cache[cache_key]
    body = {"textQuery": text, "languageCode": "ko"}
    if bias:
        body["locationBias"] = {"circle": {"center": {"latitude": bias[0], "longitude": bias[1]}, "radius": BIAS_RADIUS_METERS}}
    status, response = http_json("POST", PLACES, headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS}, body=body)
    if status != 200:
        raise RuntimeError(f"Places search failed (HTTP {status}): {str(response)[:200]}")
    places = ((response or {}).get("places") or [])[:3]
    if cache is not None:
        cache[cache_key] = places
    return places


def geocode(key, place, location_tag=None, cache=None):
    """Return the geocoding fields of an InstagramExtractedPlaceInput for one extracted place.

    ``place`` is an item from the extraction output (name, aliases, area, nameFound);
    ``location_tag`` is {"name", "latitude", "longitude"} or None.
    """
    if place.get("nameFound") is False or looks_like_non_name(place["name"]):
        return {"geocodeStatus": "NOT_SEARCHED"}
    venue_tag = location_tag and location_tag.get("latitude") is not None and name_matches(place["name"], location_tag.get("name", ""))
    bias = (location_tag["latitude"], location_tag["longitude"]) if venue_tag else None
    results = search(key, f"{place['name']} {place.get('area') or ''}".strip(), bias, cache)
    if not results:
        return {"geocodeStatus": "NOT_FOUND", "geocodeWarning": "No Places result"}
    return from_result(place, results[0])


def from_result(place, result):
    """Judge a Places result for an extracted place: MATCHED, or NAME_MISMATCH with a warning."""
    display = (result.get("displayName") or {}).get("text") or ""
    address = result.get("formattedAddress") or ""
    found = {
        "name": (display or place["name"])[:128],
        "address": address[:255],
        "latitude": result["location"]["latitude"],
        "longitude": result["location"]["longitude"],
        "googleMapsId": result["id"],
    }
    names = [place["name"], *place.get("aliases", [])]
    if not any(name_matches(name, display) for name in names):
        return {"geocodeStatus": "NAME_MISMATCH", "place": found, "geocodeWarning": f"Google returned '{display}' for '{place['name']}'"}
    missing = branch_mismatch(place.get("area"), address)
    if missing:
        return {"geocodeStatus": "NAME_MISMATCH", "place": found,
                "geocodeWarning": f"Address '{address}' is not in {', '.join(missing)} from the area '{place.get('area')}'"}
    return {"geocodeStatus": "MATCHED", "place": found}
