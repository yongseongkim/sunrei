"""Client for the Sunrei admin YouTube collection API (stdlib only).

The collector and skills store playlists, videos, texts, and extraction runs
through ``/admin/youtube/*`` instead of local state files, so they can run on
any machine that reaches the API.

``SUNREI_API_URL`` selects the server (default: production). The admin token
comes from ``_common.admin_token`` and is re-minted before it expires.
"""

import copy
import hashlib
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


def workflow_write_key(body, document_field, marker, ignored_fields=()):
    """Hash request content, including JSON documents rather than their formatting."""
    content = copy.deepcopy(body)
    for field in ignored_fields:
        content.pop(field, None)
    for field in ("params", "payload", "rawOutput"):
        if isinstance(content.get(field), str):
            content[field] = json.loads(content[field])
    if isinstance(content.get(document_field), dict):
        content[document_field].pop(marker, None)
    encoded = json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def marker_document(value, field):
    if value is None:
        return {}
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise ValueError(f"Resumable writes require {field} to contain a JSON object")
    return copy.deepcopy(value)


class CollectionApi:
    def __init__(self, base_url=None, token_provider=admin_token, resume_writes=False):
        self.base_url = (base_url or os.environ.get("SUNREI_API_URL") or PROD_SERVER).rstrip("/")
        self.token_provider = token_provider
        self.token = None
        self.resume_writes = resume_writes

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

    def get_video(self, video_id):
        return self.request("GET", f"/admin/youtube/videos/{video_id}")

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
        path = f"/admin/youtube/videos/{video_id}/texts"
        if not self.resume_writes:
            return self.request("POST", path, body)
        settings = marker_document(params, "params")
        settings.pop("workflowWriteKey", None)
        body["params"] = json_string(settings)
        key = workflow_write_key(body, "params", "workflowWriteKey")
        settings["workflowWriteKey"] = key
        body["params"] = json_string(settings)
        return self._resumable_post(video_id, path, body, "texts", "params", "workflowWriteKey", key)

    def create_extraction_run(self, video_id, body):
        path = f"/admin/youtube/videos/{video_id}/extraction-runs"
        if not self.resume_writes or body.get("status") != "SUCCEEDED":
            return self.request("POST", path, body)
        body = copy.deepcopy(body)
        output = marker_document(body.get("rawOutput"), "rawOutput")
        output.pop("_workflowWriteKey", None)
        body["rawOutput"] = json_string(output)
        key = workflow_write_key(body, "rawOutput", "_workflowWriteKey", ("startedAt", "finishedAt"))
        output["_workflowWriteKey"] = key
        body["rawOutput"] = json_string(output)
        return self._resumable_post(video_id, path, body, "runs", "rawOutput", "_workflowWriteKey", key)

    def _stored_write(self, video_id, collection, document_field, marker, key):
        # Always fetch current server state. A failed/malformed verification
        # must propagate, rather than silently authorize another POST.
        detail = self.get_video(video_id)
        if not isinstance(detail, dict) or not isinstance(detail.get(collection), list):
            raise RuntimeError(f"Cannot verify stored {collection}: invalid video detail response")
        for record in detail[collection]:
            if not isinstance(record, dict):
                raise RuntimeError(f"Cannot verify stored {collection}: invalid record")
            document = record.get(document_field)
            if isinstance(document, str):
                try:
                    document = json.loads(document)
                except ValueError as error:
                    raise RuntimeError(f"Cannot verify stored {collection}: invalid {document_field} JSON") from error
            if not isinstance(document, dict) or document.get(marker) != key:
                continue
            if collection == "runs" and record.get("status") != "SUCCEEDED":
                continue
            if not record.get("id"):
                raise RuntimeError(f"Cannot verify stored {collection}: matching record has no ID")
            return record
        return None

    def _resumable_post(self, video_id, path, body, collection, document_field, marker, key):
        existing = self._stored_write(video_id, collection, document_field, marker, key)
        if existing is not None:
            return existing
        try:
            return self.request("POST", path, body)
        except RuntimeError:
            # A lost response can follow a committed transaction. Reconcile
            # with a fresh GET; never retry the uncertain mutation here.
            existing = self._stored_write(video_id, collection, document_field, marker, key)
            if existing is not None:
                return existing
            raise
