"""Geocode locations via Google Maps Places API (Text Search), with guards.

Two modes:
    # one-off lookup — prints the best match and a mismatch warning
    uv run python .claude/scripts/youtube/geocode.py --query "토리키조쿠" --area "시부야"

    # workspace backfill — fills missing coords in locations.json, flags mismatches
    uv run python .claude/scripts/youtube/geocode.py <ID>

Guards (from experience): never geocode a bare address — an address-only query returns
the nearest business (a wrong pin); a `name` that looks like hours/phone/an address, or
that the extractor marked as unknown ("상호 미상"), is not searched; each result is flagged
(`geocodeWarning`) when its displayName differs from the queried name, adds words other
than a branch or area to it ('옛집' -> '옛집국수'), or its Korean address is outside the
area's 시/구/군.
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


# 추출기가 상호를 못 찾으면 이름에 "상호 미상", "(상호 미확인)"처럼 남긴다.
UNNAMED = re.compile(r"상호\s*(?:미상|미확인|불명)|(?:미상|미확인)\s*\)")
UNNAMED_WARNING = "venue name unknown; not searched — find the venue by web research and give its place when approving"
PARENS = re.compile(r"\([^)]*\)")
# 시/구/군만 본다. 도로명 주소에는 동이 잘 들어가지 않아서 동까지 보면 대부분 걸린다.
DISTRICT = re.compile(r"[가-힣]{1,6}(?:시|구|군)(?![가-힣])")
# 건대입구, 부산항구 같은 역·항구 이름도 구로 끝난다.
NOT_DISTRICT_SUFFIXES = ("입구", "출구", "항구")


def looks_unnamed(name):
    return bool(UNNAMED.search(name or ""))


def extra_words(name, display, area=""):
    """Return what Google's name adds to the extracted name, or None when the rest is a branch, the area, or a romanization."""
    x, y = norm(PARENS.sub("", name or "")), norm(PARENS.sub("", display or ""))
    if not x or not y or x == y or not (x in y or y in x):
        return None
    shorter, longer = sorted((x, y), key=len)
    extra = longer.replace(shorter, "", 1)
    if extra.endswith("점") or re.fullmatch(r"[a-z0-9&'.]+", extra) or extra in norm(area):
        return None
    return extra


def branch_mismatch(area, address):
    """Return the area districts missing from a Korean address, or None when it agrees or cannot be judged."""
    if not area or not address or not address.startswith("대한민국"):
        return None
    districts = [d for d in DISTRICT.findall(area) if not d.endswith(NOT_DISTRICT_SUFFIXES)]
    missing = [district for district in districts if district not in address]
    return missing or None


def venue_warning(name, display, area="", address="", aliases=()):
    """Return why a Places result may not be the venue the video named, or None.

    A substring match alone let '옛집' land on '옛집국수' in another district, so a match also has to
    add nothing but a branch or area word, and a Korean address has to sit in the area's 시/구/군.
    """
    names = [n for n in (name, *aliases) if n]
    matching = [n for n in names if name_matches(n, display)]
    if not matching:
        return f"displayName '{display}' != '{name}'; verify"
    extras = [extra_words(n, display, area) for n in matching]
    if all(extras):
        return f"displayName '{display}' adds '{extras[0]}' to '{name}'; check it is the same venue"
    missing = branch_mismatch(area, address)
    if missing:
        return f"address '{address}' is not in {', '.join(missing)} from the area '{area}'; verify"
    return None


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
    warning = venue_warning(q, res["displayName"], area, res["address"])
    if warning:
        print(f"WARNING: {warning}")


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
            if looks_unnamed(name):
                loc["geocodeWarning"] = UNNAMED_WARNING
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
            warning = venue_warning(name, res["displayName"], loc.get("area") or area, res["address"], loc.get("aliases") or ())
            if warning:
                loc["geocodeWarning"] = warning
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
