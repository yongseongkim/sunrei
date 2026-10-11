"""Replace all spots on an existing Sunrei with the latest workspace locations.

Preserves the Sunrei ID, source, and published status. GETs the Sunrei, builds a
PUT that soft-deletes every current spot and adds the new ones from locations.json,
optionally updating summary/description. Dry-run by default.

Usage:
    uv run python update_sunrei_spots.py <ID> <SUNREI_ID> [--prod] [--commit]
        [--summary "..."] [--description "..."] [--tag-ids a,b]
"""
import json
import sys

from _common import admin_api, admin_token, workspace
from create_sunrei import build_spots


def arg(args, flag, default=None):
    return args[args.index(flag) + 1] if flag in args else default


def main():
    args = sys.argv[1:]
    ws_id, sunrei_id = args[0], args[1]
    prod = "--prod" in args
    commit = "--commit" in args
    tag_ids = [t for t in arg(args, "--tag-ids", "").split(",") if t]
    ws = workspace(ws_id)
    token = admin_token()
    if not token:
        print("no admin token"); sys.exit(1)

    st, body = admin_api("GET", f"/admin/sunreis/{sunrei_id}", token, prod=prod)
    if st != 200:
        print(f"GET failed {st}: {str(body)[:300]}"); sys.exit(1)
    old = body.get("spots", [])
    published = body.get("publishedAt") is not None

    locs = json.load(open(ws / "locations.json"))
    new_spots, skipped = build_spots(locs, tag_ids)

    # The server auto-soft-deletes existing spots whose id is omitted from the
    # request, so sending only the new spots (id=null) replaces the set.
    payload = {"spots": new_spots}
    if arg(args, "--summary"):
        payload["summary"] = arg(args, "--summary")
    if arg(args, "--description"):
        payload["description"] = arg(args, "--description")

    print(f"--- {'PROD' if prod else 'LOCAL'} {'COMMIT' if commit else 'DRY-RUN'} ---")
    print(f"sunrei:  {sunrei_id} ({'published' if published else 'draft'})")
    print(f"delete:  {len(old)} old spots")
    print(f"add:     {len(new_spots)} new spots" + (f" (+{skipped} skipped, no coords)" if skipped else ""))

    if not commit:
        print("\nDry-run only. Re-run with --commit to replace.")
        return

    st, resp = admin_api("PUT", f"/admin/sunreis/{sunrei_id}", token, payload, prod=prod)
    if st == 200:
        kept = resp or body
        nspots = len((resp or {}).get("spots", old))
        print(f"\n✓ updated {sunrei_id}: now {nspots} spots ({'published' if (kept.get('publishedAt') or published) else 'draft'})")
    else:
        print(f"\n✗ update failed {st}: {str(resp)[:400]}")


if __name__ == "__main__":
    main()
