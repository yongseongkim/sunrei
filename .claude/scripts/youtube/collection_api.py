"""Client for the Sunrei admin YouTube collection API (stdlib only).

The collector and skills store playlists, videos, texts, and extraction runs
through ``/admin/youtube/*`` instead of local state files, so they can run on
any machine that reaches the API.

``SUNREI_API_URL`` selects the server (default: production). The admin token
comes from ``_common.admin_token`` and is re-minted before it expires.
"""

import json
import os
import urllib.parse

from _common import PROD_SERVER, admin_token, http_json, jwt_is_usable


class CollectionApiError(RuntimeError):
    def __init__(self, method, path, status, body):
        super().__init__(f"{method} {path} failed (HTTP {status}): {str(body)[:500]}")
        self.status = status
        self.body = body


def json_string(value):
    return None if value is None else json.dumps(value, ensure_ascii=False, separators=(",", ":"))


class CollectionApi:
    def __init__(self, base_url=None, token_provider=admin_token):
        self.base_url = (base_url or os.environ.get("SUNREI_API_URL") or PROD_SERVER).rstrip("/")
        self.token_provider = token_provider
        self.token = None

    def _token(self):
        if not self.token or not jwt_is_usable(self.token, minimum_seconds=300):
            self.token = self.token_provider()
            if not self.token:
                raise RuntimeError("Could not resolve an admin API token")
        return self.token

    def request(self, method, path, body=None, query=None, timeout=120):
        if query:
            filtered = {key: value for key, value in query.items() if value is not None}
            if filtered:
                path = f"{path}?{urllib.parse.urlencode(filtered)}"
        status, response = http_json(
            method,
            self.base_url + path,
            headers={"Authorization": f"Bearer {self._token()}"},
            body=body,
            timeout=timeout,
        )
        if not 200 <= status < 300:
            raise CollectionApiError(method, path, status, response)
        return response

    # ===== Playlists =====

    def list_playlists(self):
        return self.request("GET", "/admin/youtube/playlists")["data"]

    def get_playlist(self, playlist_id):
        try:
            return self.request("GET", f"/admin/youtube/playlists/{playlist_id}")
        except CollectionApiError as error:
            if error.status == 404:
                return None
            raise

    def upsert_playlist(self, playlist_id, body):
        return self.request("PUT", f"/admin/youtube/playlists/{playlist_id}", body)

    def sync_playlist_videos(self, playlist_id, videos, initial_status=None):
        body = {"videos": videos}
        if initial_status:
            body["initialStatus"] = initial_status
        return self.request("PUT", f"/admin/youtube/playlists/{playlist_id}/videos", body)

    # ===== Videos =====

    def list_videos(self, playlist_id=None, status=None):
        videos = []
        next_token = None
        while True:
            page = self.request(
                "GET",
                "/admin/youtube/videos",
                query={"playlistId": playlist_id, "status": status, "size": 100, "nextToken": next_token},
            )
            videos.extend(page["data"])
            next_token = page.get("nextToken")
            if not next_token:
                return videos

    def update_video(self, video_id, status=None, stage=None, error=None):
        body = {key: value for key, value in {"status": status, "stage": stage, "error": error}.items() if value is not None}
        return self.request("PATCH", f"/admin/youtube/videos/{video_id}", body)

    def create_text(self, video_id, kind, segments=None, language=None, full_text=None, payload=None, params=None):
        body = {
            "kind": kind,
            "language": language,
            "segments": segments or [],
            "fullText": full_text,
            "payload": json_string(payload),
            "params": json_string(params),
        }
        return self.request("POST", f"/admin/youtube/videos/{video_id}/texts", body)

    def create_extraction_run(self, video_id, body):
        return self.request("POST", f"/admin/youtube/videos/{video_id}/extraction-runs", body)
