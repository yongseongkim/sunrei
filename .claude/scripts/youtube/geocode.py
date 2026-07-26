"""Geocode locations via Google Maps Places API (Text Search), with guards.

Two modes:
    # one-off lookup — prints the best match and a mismatch warning
    uv run python .claude/scripts/youtube/geocode.py --query "토리키조쿠" --area "시부야"

    # workspace backfill — fills missing coords in locations.json, flags mismatches
    uv run python .claude/scripts/youtube/geocode.py <ID>

Guards (from experience): never geocode a bare address — an address-only query returns
the nearest business (a wrong pin); a `name` that looks like hours/phone/an address is
rejected instead of searched; each result's displayName is checked against the queried
name and flagged (`geocodeWarning`) on mismatch.
"""
import json
import re
import sys

from _common import http_json, load_google_api_key, workspace

PLACES = "https://places.googleapis.com/v1/places:searchText"
FIELDS = "places.displayName,places.formattedAddress,places.location,places.id,places.googleMapsUri"
BAD_NAME = re.compile(r"\d{1,2}:\d{2}|\d{2,4}[-–]\d{3,4}[-–]\d{4}|^\s*\d+\s|매일|평일|주말|영업시간|휴무")


def looks_like_non_name(name):
    return bool(BAD_NAME.search(name or ""))


def norm(s):
    return re.sub(r"[\s\-·]", "", (s or "").lower())


def name_matches(a, b):
    x, y = norm(a), norm(b)
    return bool(x) and bool(y) and (x in y or y in x)


def search(key, text):
    status, body = http_json(
        "POST", PLACES,
        headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS},
        body={"textQuery": text, "languageCode": "ko"},
    )
    if status != 200:
        return None, f"HTTP {status}: {str(body)[:200]}"
    places = (body or {}).get("places") or []
    if not places:
        return None, "no result"
    p = places[0]
    loc = p.get("location", {})
    return {
        "displayName": p.get("displayName", {}).get("text"),
        "address": p.get("formattedAddress"),
        "latitude": loc.get("latitude"),
        "longitude": loc.get("longitude"),
        "googleMapsId": p.get("id"),
        "googleMapsUri": p.get("googleMapsUri"),
    }, None


def run_query(key, q, area):
    if looks_like_non_name(q):
        print(f"WARNING: '{q}' looks like hours/phone/address, not a venue name.")
    res, err = search(key, f"{q} {area}".strip())
    if err:
        print(err)
        sys.exit(1)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    if not name_matches(q, res["displayName"]):
        print(f"WARNING: returned '{res['displayName']}' != queried '{q}' — verify.")


def run_workspace(key, ws_id):
    ws = workspace(ws_id)
    locfile = ws / "locations.json"
    if not locfile.is_file():
        print(f"{locfile} not found.")
        sys.exit(1)
    data = json.load(open(locfile))
    filled = flagged = skipped = 0
    for v in data.get("videos", []):
        area = v.get("concept") or ""
        for loc in v.get("locations", []):
            if loc.get("latitude") and loc.get("googleMapsId"):
                continue
            name = loc.get("name") or ""
            if looks_like_non_name(name):
                loc["geocodeWarning"] = "name looks like hours/phone/address; needs a real venue name"
                skipped += 1
                continue
            res, err = search(key, f"{name} {area}".strip())
            if err:
                loc["geocodeWarning"] = f"geocode failed: {err}"
                flagged += 1
                continue
            loc["address"] = res["address"]
            loc["latitude"] = res["latitude"]
            loc["longitude"] = res["longitude"]
            loc["googleMapsId"] = res["googleMapsId"]
            loc["googleMapsUri"] = res["googleMapsUri"]
            filled += 1
            if not name_matches(name, res["displayName"]):
                loc["geocodeWarning"] = f"displayName '{res['displayName']}' != '{name}'; verify"
                flagged += 1
    json.dump(data, open(locfile, "w"), ensure_ascii=False, indent=2)
    print(f"filled {filled}, flagged {flagged}, skipped {skipped} -> {locfile}")
    if flagged or skipped:
        print("Review entries carrying a `geocodeWarning` field.")


def main():
    args = sys.argv[1:]
    key = load_google_api_key()
    if not key:
        print("No Google API key found in application-local.conf.")
        sys.exit(1)
    if "--query" in args:
        q = args[args.index("--query") + 1]
        area = args[args.index("--area") + 1] if "--area" in args else ""
        run_query(key, q, area)
    elif args:
        run_workspace(key, args[0])
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
