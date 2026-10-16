"""Client for the Sunrei admin Instagram collection API (stdlib only).

The collector, the workspace import, and the skills store accounts, posts,
texts, and extraction runs through ``/admin/instagram/*``, so they run on any
machine that reaches the API. ``SUNREI_API_URL`` selects the server (default:
production). Requests, tokens, and errors come from the YouTube collection
client.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "youtube"))
from collection_api import CollectionApi, CollectionApiError, json_string  # noqa: E402,F401

POSTS_PER_UPSERT = 100


class InstagramCollectionApi(CollectionApi):
    def _paged(self, path, query):
        items, next_token = [], None
        while True:
            page = self.request("GET", path, query={**query, "size": 100, "nextToken": next_token})
            items.extend(page["data"])
            next_token = page.get("nextToken")
            if not next_token:
                return items

    def _optional(self, path):
        try:
            return self.request("GET", path)
        except CollectionApiError as error:
            if error.status == 404:
                return None
            raise

    # ===== Accounts =====

    def list_accounts(self):
        return self.request("GET", "/admin/instagram/accounts")["data"]

    def get_account(self, account_id):
        return self._optional(f"/admin/instagram/accounts/{account_id}")

    def upsert_account(self, account_id, body):
        return self.request("PUT", f"/admin/instagram/accounts/{account_id}", body)

    def upsert_posts(self, account_id, posts, initial_status=None):
        """Store posts in chunks of POSTS_PER_UPSERT; returns (added ids, updated ids)."""
        added, updated = [], []
        for start in range(0, len(posts), POSTS_PER_UPSERT):
            body = {"posts": posts[start:start + POSTS_PER_UPSERT]}
            if initial_status:
                body["initialStatus"] = initial_status
            result = self.request("PUT", f"/admin/instagram/accounts/{account_id}/posts", body)
            added += result["addedPostIds"]
            updated += result["updatedPostIds"]
        return added, updated

    # ===== Posts =====

    def list_posts(self, account_id=None, status=None, media_type=None, location_tag_read=None):
        query = {"accountId": account_id, "status": status, "mediaType": media_type}
        if location_tag_read is not None:
            query["locationTagRead"] = "true" if location_tag_read else "false"
        return self._paged("/admin/instagram/posts", query)

    def get_post(self, post_id):
        return self._optional(f"/admin/instagram/posts/{post_id}")

    def update_post(self, post_id, status=None, stage=None, error=None):
        body = {key: value for key, value in {"status": status, "stage": stage, "error": error}.items() if value is not None}
        return self.request("PATCH", f"/admin/instagram/posts/{post_id}", body)

    def set_location_tag(self, post_id, location_tag):
        return self.request("PUT", f"/admin/instagram/posts/{post_id}/location-tag", {"locationTag": location_tag})

    def create_text(self, post_id, kind, segments=None, language=None, full_text=None, params=None):
        body = {
            "kind": kind,
            "language": language,
            "segments": segments or [],
            "fullText": full_text,
            "params": json_string(params),
        }
        return self.request("POST", f"/admin/instagram/posts/{post_id}/texts", body)

    def create_extraction_run(self, post_id, body):
        return self.request("POST", f"/admin/instagram/posts/{post_id}/extraction-runs", body)

    # ===== Extracted places =====

    def list_places(self, review_status=None, geocode_status=None, account_id=None, post_id=None):
        query = {"reviewStatus": review_status, "geocodeStatus": geocode_status, "accountId": account_id, "postId": post_id}
        return self._paged("/admin/instagram/extracted-places", query)

    def review_place(self, place_id, body):
        return self.request("PATCH", f"/admin/instagram/extracted-places/{place_id}", body)
