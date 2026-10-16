"""Copy Instagram post images into Sunrei's image storage and attach them to the posts.

For posts of an account that have extracted places and no images yet, this finds
the posts through Business Discovery, takes their images (a reel's cover, the
photo, or up to five carousel items), copies each one through
/admin/images/upload-url, and stores the copies with
PUT /admin/instagram/posts/{id}/images. The server also gives them to spots
already approved from those posts, and later approvals copy them. Instagram's
image URLs expire, so only the copies are kept.

The command is a dry run unless --commit is given. SUNREI_API_URL selects the
server (default: production).

Usage:
    python3 .claude/scripts/instagram/post_images.py USERNAME [--commit] [--limit N] [--max-pages 60]
"""

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from graph_api import IMAGE_FIELDS, GraphApi, TokenExpired, log, shortcode_of  # noqa: E402
from instagram_collection_api import CollectionApiError, InstagramCollectionApi  # noqa: E402

MAX_IMAGES = 5
REVIEWABLE = {"PENDING", "APPROVED"}


def image_sources(media):
    """Instagram URLs of a post's images, at most MAX_IMAGES: the reel cover, the photo, or the carousel items."""
    kind = media.get("media_type")
    if kind == "VIDEO":
        urls = [media.get("thumbnail_url")]
    elif kind == "CAROUSEL_ALBUM":
        children = (media.get("children") or {}).get("data") or []
        urls = [child.get("thumbnail_url") if child.get("media_type") == "VIDEO" else child.get("media_url") for child in children]
        urls = urls or [media.get("media_url")]
    else:
        urls = [media.get("media_url")]
    return [url for url in urls if url][:MAX_IMAGES]


def save_post_images(graph, api, username, wanted, max_pages=60):
    """Find the wanted posts ({post id: shortcode}) through Business Discovery and store their image copies.

    Returns {"saved": n, "no_image": n, "not_found": n, "failed": n}.
    """
    counts = {"saved": 0, "no_image": 0, "not_found": 0, "failed": 0}
    remaining, after = dict(wanted), None
    for _ in range(max_pages):
        if not remaining:
            break
        _, items, after = graph.media_page(username, after=after, fields=IMAGE_FIELDS)
        for media in items:
            if media["id"] not in remaining:
                continue
            code = remaining.pop(media["id"])
            sources = image_sources(media)
            if not sources:
                counts["no_image"] += 1
                log(f"{code}: Instagram returned no image URL")
                continue
            try:
                images = [api.upload_image_from_url(url) for url in sources]
                api.set_post_images(media["id"], images)
                counts["saved"] += 1
                log(f"{code}: {len(images)} images")
            except CollectionApiError as error:
                counts["failed"] += 1
                log(f"{code}: FAILED {str(error)[:200]}")
        if not after:
            break
    counts["not_found"] = len(remaining)
    for code in remaining.values():
        log(f"{code}: not found in the account's media")
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("username")
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--limit", type=int, help="At most N posts, newest first, for a trial run")
    parser.add_argument("--max-pages", type=int, default=60)
    args = parser.parse_args()

    api = InstagramCollectionApi()
    username = args.username.lower().lstrip("@")
    account = next((a for a in api.list_accounts() if a["username"].lower() == username), None)
    if not account:
        raise SystemExit(f"Account {username} is not registered")
    with_places = {p["postId"] for p in api.list_places(account_id=account["id"]) if p["reviewStatus"] in REVIEWABLE}
    posts = [p for p in api.list_posts(account_id=account["id"]) if p["id"] in with_places and not p.get("images")]
    posts = posts[: args.limit]
    log(f"server: {api.base_url}; {len(posts)} posts with places and no images")
    if not args.commit or not posts:
        print("Dry run only. Re-run with --commit to copy the images." if not args.commit else "Nothing to do.")
        return
    try:
        counts = save_post_images(GraphApi(), api, account["username"], {p["id"]: p["shortcode"] for p in posts}, args.max_pages)
    except TokenExpired as error:
        raise SystemExit(str(error))
    log(f"done: {counts}")


if __name__ == "__main__":
    main()
