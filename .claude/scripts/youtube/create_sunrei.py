"""Create one Sunrei (source + spots) from a workspace, via the admin API.

Reads video_info.json + locations.json, resolves or creates the YouTube Source for the
channel, builds one spot per geocoded location, and (with --commit) POSTs /admin/sunreis.
Dry-run by default: prints exactly what it would create and does nothing else.

Usage:
    uv run python .claude/scripts/youtube/create_sunrei.py <ID> [--prod] [--commit]
        [--summary "..."] [--description "..."] [--tag-ids a,b] [--publish]

Notes:
  - Summary/description read best from transcripts (model judgment); pass them via
    --summary/--description. Without them the video/playlist description is used and a
    warning is printed.
  - This bypasses the interactive skill checkpoints (tag selection, per-spot review),
    so it lands a draft unless --publish is given. Review in admin afterward.
  - Admin token is auto-minted locally (auth/mint_token.py) — no login needed. Requires
    SOPS + GCP KMS decrypt permission. Override by exporting SUNREI_ADMIN_TOKEN.
  - On success writes _create_manifest.json for the S3 registry step.
"""
import json
import sys
import urllib.parse

from _common import admin_api, admin_token, workspace


def arg(args, flag, default=None):
    return args[args.index(flag) + 1] if flag in args else default


def resolve_source(token, channel, prod):
    q = urllib.parse.quote(channel.get("title") or "")
    status, body = admin_api("GET", f"/admin/sources?q={q}&size=100", token, prod=prod)
    rows = (body or {}).get("data", []) if status == 200 else []
    yt = [s for s in rows if s.get("type") == "YOUTUBE"]
    by_url = next((s for s in yt if s.get("externalUrl") == channel.get("url")), None)
    if by_url:
        return by_url["id"], "reuse(url)"
    by_title = next((s for s in yt if s.get("name") == channel.get("title")), None)
    if by_title:
        return by_title["id"], "reuse(title)"
    return None, None


def build_spots(locs, tag_ids):
    spots, skipped = [], 0
    for v in locs.get("videos", []):
        vtitle = (v.get("title") or "")[:128]
        for l in v.get("locations", []):
            if not (l.get("latitude") and l.get("googleMapsId")):
                skipped += 1
                continue
            spots.append({
                "title": vtitle,
                "context": (l.get("description") or "")[:2000],
                "images": [],
                "youtubeLink": l.get("videoUrlWithTimestamp") or f"https://www.youtube.com/watch?v={v.get('videoId')}",
                "tagIds": tag_ids,
                "place": {
                    "name": (l.get("name") or "")[:200],
                    "address": (l.get("address") or "")[:300],
                    "latitude": l["latitude"], "longitude": l["longitude"],
                    "googleMapsId": l["googleMapsId"],
                },
            })
    return spots, skipped


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith("--"):
        print(__doc__)
        sys.exit(1)
    ws = workspace(args[0])
    prod = "--prod" in args
    commit = "--commit" in args
    publish = "--publish" in args

    info = json.load(open(ws / "video_info.json"))
    locs = json.load(open(ws / "locations.json"))

    is_playlist = info.get("type") == "playlist"
    title = (info.get("title") or "")[:128]
    link = info.get("url") or (
        f"https://www.youtube.com/playlist?list={info['id']}" if is_playlist
        else f"https://www.youtube.com/watch?v={info['id']}")
    summary = arg(args, "--summary") or (info.get("description") or "")[:200]
    description = arg(args, "--description") or (info.get("description") or "")
    if not arg(args, "--summary"):
        print("WARNING: no --summary; using the video/playlist description. "
              "A transcript-derived one-line summary is preferred.")
    tag_ids = [t for t in arg(args, "--tag-ids", "").split(",") if t]

    spots, skipped = build_spots(locs, tag_ids)
    channel = info.get("channel") or {}

    token = admin_token()
    if not token:
        print("Could not obtain an admin token. Check SOPS + GCP KMS decrypt access, "
              "or export SUNREI_ADMIN_TOKEN yourself (see mint_token.py).")
        sys.exit(1)

    source_id, how = resolve_source(token, channel, prod)

    print(f"--- {'PROD' if prod else 'LOCAL'} {'COMMIT' if commit else 'DRY-RUN'} ---")
    print(f"title:   {title}")
    print(f"link:    {link}")
    print(f"summary: {summary[:100]}")
    print(f"source:  {source_id or '(will create)'} {how or ''}  [{channel.get('title')}]")
    print(f"spots:   {len(spots)}")
    for s in spots[:8]:
        print(f"  - {s['place']['name']}  ({s['title'][:40]})")
    if len(spots) > 8:
        print(f"  ... +{len(spots) - 8} more")
    if skipped:
        print(f"NOTE: {skipped} location(s) without coords/googleMapsId were skipped (run geocode.py first).")

    if not commit:
        print("\nDry-run only. Re-run with --commit to create.")
        return

    if not source_id:
        payload = {"type": "YOUTUBE", "name": channel.get("title") or info.get("channelName"),
                   "synopsis": (channel.get("description") or "")[:500], "externalUrl": channel.get("url")}
        if channel.get("thumbnailUrl"):
            payload["posterImage"] = {"images": [{"url": channel["thumbnailUrl"]}]}
        st, resp = admin_api("POST", "/admin/sources", token, payload, prod=prod)
        if st != 201 or not (resp or {}).get("id"):
            print(f"source create failed {st}: {str(resp)[:300]}")
            sys.exit(1)
        source_id = resp["id"]
        print(f"created source {source_id}")

    payload = {"sourceId": source_id, "published": publish, "title": title,
               "summary": summary, "description": description, "link": link, "images": [], "spots": spots}
    st, resp = admin_api("POST", "/admin/sunreis", token, payload, prod=prod)
    if st == 201 and (resp or {}).get("id"):
        sid = resp["id"]
        created = resp.get("spots") or []
        manifest_spots = []
        for req, res in zip(spots, created):
            yl = req.get("youtubeLink", "")
            vid = yl.split("v=")[-1].split("&")[0] if "v=" in yl else None
            manifest_spots.append({"spotId": res.get("id"), "videoId": vid, "videoTitle": req.get("title")})
        json.dump({"sunreiId": sid, "sourceId": source_id, "spots": manifest_spots},
                  open(ws / "_create_manifest.json", "w"), ensure_ascii=False, indent=2)
        print(f"\n✓ created sunrei {sid}, {len(created)} spots ({'published' if publish else 'draft'})")
        print(f"manifest -> {ws / '_create_manifest.json'} (use for the S3 registry, Step 6)")
    elif st == 409:
        print(f"\n⊘ 409 conflict: link already exists -> {(resp or {}).get('existingId')}")
    else:
        print(f"\n✗ create failed {st}: {str(resp)[:400]}")
        sys.exit(1)


if __name__ == "__main__":
    main()
