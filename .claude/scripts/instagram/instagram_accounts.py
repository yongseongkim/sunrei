"""Register and manage the Instagram accounts the collector processes.

``add`` looks the account up through Business Discovery and registers it with
the Sunrei that approved places go to. Without --sunrei it finds or creates the
account's Source (type INSTAGRAM, external URL = profile; an existing Source
with that URL is switched to INSTAGRAM) and its draft Sunrei. By default every
post is collected, history included (--baseline none); --baseline skip records
the newest page as SKIPPED so only later posts are processed.

The profile picture becomes the Source's poster image (the channel avatar in the
app) when the Source has none. Instagram's picture URLs expire, so the image is
copied into Sunrei's image storage through /admin/images/upload-url.
``update --refresh-picture`` replaces it with the current picture.

``SUNREI_API_URL`` selects the server (default: production).

Usage:
    python3 .claude/scripts/instagram/instagram_accounts.py list
    python3 .claude/scripts/instagram/instagram_accounts.py add USERNAME [--sunrei ID] [--baseline none|skip] [--disabled]
    python3 .claude/scripts/instagram/instagram_accounts.py update USERNAME [--sunrei ID] [--enable|--disable] [--refresh-picture]
"""

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from graph_api import GraphApi, post_input  # noqa: E402
from instagram_collection_api import InstagramCollectionApi  # noqa: E402


def profile_url(username):
    return f"https://www.instagram.com/{username}/"


def set_profile_picture(api, source, picture_url, replace=False):
    """Copy the profile picture into image storage and make it the Source's poster image.

    Keeps an existing poster unless ``replace``. Returns True when the poster changed.
    """
    if source.get("posterImage") and not replace:
        return False
    if not picture_url:
        print("the profile has no picture; poster image unchanged")
        return False
    image = api.request("POST", "/admin/images/upload-url", {"url": picture_url})
    api.request("PUT", f"/admin/sources/{source['id']}", {"posterImage": image})
    print(f"poster image of source {source['id']} set from the profile picture")
    return True


def source_of_sunrei(api, sunrei_id):
    sunrei = api.request("GET", f"/admin/sunreis/{sunrei_id}")
    return api.request("GET", f"/admin/sources/{sunrei['sourceId']}")


def find_or_create_sunrei(api, profile):
    """Return (sunrei id, source) for the account's INSTAGRAM Source, creating either when missing."""
    username, url = profile["username"], profile_url(profile["username"])
    found = api.request("GET", "/admin/sources", query={"q": username, "size": 50})["data"]
    source = next((s for s in found if (s.get("externalUrl") or "").rstrip("/") == url.rstrip("/")), None)
    if source and source["type"] != "INSTAGRAM":
        previous = source["type"]
        source = api.request("PUT", f"/admin/sources/{source['id']}", {"type": "INSTAGRAM"})
        print(f"switched source {source['id']} ({source['name']}) from {previous} to INSTAGRAM")
    elif source is None:
        source = api.request("POST", "/admin/sources", {
            "type": "INSTAGRAM",
            "name": profile.get("name") or username,
            "synopsis": f"Instagram @{username}",
            "externalUrl": url,
        })
        print(f"created source {source['id']} ({source['name']})")

    sunreis = api.request("GET", "/admin/sunreis", query={"sourceId": source["id"], "size": 50})["data"]
    if len(sunreis) > 1:
        raise SystemExit(f"Source {source['id']} has {len(sunreis)} Sunreis; pass --sunrei to pick one")
    if sunreis:
        sunrei = api.request("GET", f"/admin/sunreis/{sunreis[0]['id']}")
        spots = len(sunrei.get("spots") or [])
        print(f"using sunrei {sunrei['id']} ({sunrei['title']}), {spots} existing spots")
        if spots:
            print("  It already has spots; approved candidates are added next to them.")
        return sunrei["id"], source
    name = profile.get("name") or username
    sunrei = api.request("POST", "/admin/sunreis", {
        "sourceId": source["id"],
        "published": False,
        "title": f"{name} 인스타그램"[:128],
        "summary": f"@{username} 인스타그램 게시물에 나온 장소",
        "link": url,
        "images": [],
        "spots": [],
    })
    print(f"created draft sunrei {sunrei['id']} ({sunrei['title']})")
    return sunrei["id"], source


def account_by_username(api, username):
    username = username.lower().lstrip("@")
    account = next((a for a in api.list_accounts() if a["username"].lower() == username), None)
    if not account:
        raise SystemExit(f"Account {username} is not registered")
    return account


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    add = sub.add_parser("add")
    add.add_argument("username")
    add.add_argument("--sunrei")
    add.add_argument("--baseline", choices=["none", "skip"], default="none")
    add.add_argument("--disabled", action="store_true")
    update = sub.add_parser("update")
    update.add_argument("username")
    update.add_argument("--sunrei")
    toggle = update.add_mutually_exclusive_group()
    toggle.add_argument("--enable", action="store_true")
    toggle.add_argument("--disable", action="store_true")
    update.add_argument("--refresh-picture", action="store_true", help="Replace the Source poster with the current profile picture")
    args = parser.parse_args()
    api = InstagramCollectionApi()

    if args.command == "list":
        for a in api.list_accounts():
            state = "on " if a["syncEnabled"] else "off"
            backfill = "backfilled" if a.get("backfillCompletedAt") else f"backfill at {a.get('backfillCursor') or 'start'}"
            print(f"[{state}] @{a['username']} ({a['id']}) sunrei={a.get('sunreiId')} posts={a['postCount']} "
                  f"pending={a['pendingPostCount']} {backfill} last={a.get('lastSyncedAt')}")
        return

    if args.command == "update":
        account = account_by_username(api, args.username)
        body = {"username": account["username"]}
        if args.sunrei:
            body["sunreiId"] = args.sunrei
        if args.enable or args.disable:
            body["syncEnabled"] = args.enable
        account = api.upsert_account(account["id"], body)
        print(f"@{account['username']} sunrei={account.get('sunreiId')} sync={'on' if account['syncEnabled'] else 'off'}")
        if args.refresh_picture:
            profile = GraphApi().account(account["username"])
            set_profile_picture(api, source_of_sunrei(api, account["sunreiId"]), profile.get("profile_picture_url"), replace=True)
        return

    graph = GraphApi()
    username = args.username.lstrip("@")
    profile, items, _ = graph.media_page(username)
    if args.sunrei:
        sunrei_id, source = args.sunrei, source_of_sunrei(api, args.sunrei)
    else:
        sunrei_id, source = find_or_create_sunrei(api, profile)
    set_profile_picture(api, source, profile.get("profile_picture_url"))
    body = {
        "username": profile["username"],
        "name": profile.get("name"),
        "biography": profile.get("biography"),
        "followersCount": profile.get("followers_count"),
        "mediaCount": profile.get("media_count"),
        "sunreiId": sunrei_id,
        "syncEnabled": not args.disabled,
    }
    if args.baseline == "skip":
        body["backfillCompleted"] = True
    account = api.upsert_account(profile["id"], body)
    print(f"registered @{account['username']} ({account['id']}) -> sunrei {sunrei_id}, sync {'on' if account['syncEnabled'] else 'off'}")
    if args.baseline == "skip":
        added, _ = api.upsert_posts(profile["id"], [post_input(item) for item in items], initial_status="SKIPPED")
        print(f"baseline: {len(added)} newest posts recorded as SKIPPED; later posts will be processed")
    else:
        print(f"the collector will backfill all {profile.get('media_count')} posts, --max-pages pages per run")


if __name__ == "__main__":
    main()
