"""Refresh the S3-backed channel registry through the Admin API.

For a YouTube channel, reads the current registry, rebuilds entries from live
Sunrei spot data, and asks the server to save the JSON. AWS credentials remain
owned by the Ktor server.

Usage:
    uv run python registry_update.py <channelId> <sunreiId1,sunreiId2,...> \
        [--channel-name "..."] [--channel-link "..."] [--local] [--commit]
"""
import json
import sys

from _common import admin_api, admin_token

def videoIdOf(link):
    if not link:
        return None
    if "v=" in link:
        return link.split("v=")[-1].split("&")[0]
    return None


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    channel_id = args[0]
    sunrei_ids = args[1].split(",")
    name = sys.argv[sys.argv.index("--channel-name") + 1] if "--channel-name" in args else ""
    link = sys.argv[sys.argv.index("--channel-link") + 1] if "--channel-link" in args else ""
    commit = "--commit" in args
    prod = "--local" not in args
    token = admin_token()
    if not token:
        print("Could not resolve an Admin API token.")
        sys.exit(1)

    existing = {}
    status, body = admin_api(
        "GET", f"/admin/resources/youtube/{channel_id}", token, prod=prod
    )
    if status == 200 and isinstance(body, dict):
        existing = body
    elif status != 404:
        print(f"registry GET failed: HTTP {status}: {str(body)[:300]}")
        sys.exit(1)

    # Full rebuild: existing entries are stale (post-DB-reset dead IDs), so build
    # the sunreis array only from the live Sunrei IDs given. Keep channelName/link.
    entries = []
    for sid in sunrei_ids:
        st, body = admin_api("GET", f"/admin/sunreis/{sid}", token, prod=prod)
        if st != 200:
            print(f"skip {sid}: GET {st}"); continue
        spots = []
        for s in body.get("spots", []):
            spots.append({"spotId": s.get("id"), "videoId": videoIdOf(s.get("youtubeLink")),
                          "videoTitle": (s.get("title") or "")[:200]})
        entries.append({"sunreiId": sid, "createdAt": body.get("createdAt"), "spots": spots})
        print(f"  {sid}: {len(spots)} spots")

    out = {"channelName": existing.get("channelName") or name,
           "link": existing.get("link") or link,
           "sunreis": entries}
    if commit:
        status, body = admin_api(
            "PUT", f"/admin/resources/youtube/{channel_id}", token, body=out, prod=prod
        )
        if status != 200:
            print(f"registry PUT failed: HTTP {status}: {str(body)[:300]}")
            sys.exit(1)
        print(f"saved registry through Admin API: {channel_id}")
    else:
        blob = json.dumps(out, ensure_ascii=False, indent=2).encode()
        print(f"[dry-run] would save {channel_id} ({len(blob)} bytes, {len(entries)} Sunrei entries)")
    print(f"registry: channel={out['channelName']} sunreis={[r['sunreiId'] for r in out['sunreis']]}")


if __name__ == "__main__":
    main()
