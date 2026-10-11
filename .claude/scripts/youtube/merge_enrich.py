"""Merge _enrich_*.json descriptions back into a workspace locations.json.

Each _enrich_N.json is [{"videoId","name","description"}]. This replaces the
matching location's description (matched by videoId + exact name).

Usage:
    uv run python .claude/scripts/youtube/merge_enrich.py <ID>
"""
import json
import sys
from pathlib import Path

from _common import WS_ROOT


def main():
    if not sys.argv[1:]:
        print(__doc__)
        sys.exit(1)
    ws = WS_ROOT / sys.argv[1]
    locfile = ws / "locations.json"
    data = json.load(open(locfile))
    enrich = {}
    for p in sorted(ws.glob("_enrich_*.json")):
        for e in json.load(open(p)):
            enrich[(e["videoId"], e["name"])] = e["description"]
    updated = missing = 0
    for v in data.get("videos", []):
        vid = v.get("videoId")
        for loc in v.get("locations", []):
            key = (vid, loc.get("name"))
            if key in enrich:
                loc["description"] = enrich[key]
                updated += 1
            else:
                missing += 1
    json.dump(data, open(locfile, "w"), ensure_ascii=False, indent=2)
    print(f"updated {updated} descriptions, {missing} kept as-is ({len(enrich)} enrich entries) -> {locfile}")


if __name__ == "__main__":
    main()
