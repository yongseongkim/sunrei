"""Collect creator-authored YouTube comments with explicit API coverage.

``channel_id`` must be the owner from the video's metadata, not the playlist
owner. The injected ``fetch(resource, params)`` transport returns Data API JSON;
the default transport uses the API key and the standard-library HTTP helper.
Only an exact author channel-ID match is retained as a creator comment. The
API does not expose whether a comment is pinned.
"""

import re
import urllib.parse

from _common import http_json

YOUTUBE_API = "https://www.googleapis.com/youtube/v3"


class CommentFetchError(RuntimeError):
    def __init__(self, message, reason="fetch_failed", status=None):
        super().__init__(message)
        self.reason = reason
        self.status = status


def _api_error(body, status=None):
    error = body.get("error") if isinstance(body, dict) else None
    if not error:
        return None
    if not isinstance(error, dict):
        return CommentFetchError(str(error), status=status)
    details = error.get("errors") or []
    reason = next((item.get("reason") for item in details if item.get("reason")), "fetch_failed")
    return CommentFetchError(error.get("message") or reason, reason, error.get("code") or status)


def _fetch(api_key, resource, params):
    query = urllib.parse.urlencode({**params, "key": api_key})
    status, body = http_json("GET", f"{YOUTUBE_API}/{resource}?{query}", timeout=60)
    error = _api_error(body, status)
    if error:
        raise error
    if status != 200:
        raise CommentFetchError(f"YouTube {resource} request failed ({status})", status=status)
    return body


def collect_creator_comments(
    video_id,
    channel_id,
    api_key,
    *,
    fetch=None,
    max_thread_pages=20,
    max_reply_pages=20,
):
    """Return creator comments plus complete/partial/disabled/failed coverage.

    Page limits are explicit and ``max_reply_pages`` applies to each parent.
    ``None`` removes a limit. Inline replies are sufficient only when they
    cover the reported reply count; otherwise comments.list is paginated.
    Raw creator comments, including repeated text and thanks, remain in the
    result. ``model_creator_comments`` performs model-only text filtering.
    """
    for limit in (max_thread_pages, max_reply_pages):
        if limit is not None and (not isinstance(limit, int) or limit < 0):
            raise ValueError("Comment page limits must be nonnegative integers or None")
    coverage = {
        "complete": False,
        "threadPagesRead": 0,
        "threadPagesLimit": max_thread_pages,
        "threadsExhausted": False,
        "nextThreadPageToken": None,
        "replyPagesRead": 0,
        "replyPagesLimitPerThread": max_reply_pages,
        "replyThreads": [],
        "commentsInspected": 0,
        "creatorCommentsFound": 0,
    }
    result = {
        "schemaVersion": 1,
        "videoId": video_id,
        "channelId": channel_id,
        "status": "failed",
        "coverage": coverage,
        "comments": [],
        "errors": [],
    }
    if not video_id or not channel_id or (not api_key and fetch is None):
        missing = "video_id" if not video_id else "channel_id" if not channel_id else "api_key"
        result["errors"].append({"reason": f"missing_{missing}", "message": f"Missing {missing}; comments were not checked"})
        return result

    transport = fetch or (lambda resource, params: _fetch(api_key, resource, params))
    inspected_ids = set()

    def request(resource, params):
        body = transport(resource, params)
        error = _api_error(body)
        if error:
            raise error
        if not isinstance(body, dict) or not isinstance(body.get("items", []), list):
            raise CommentFetchError("Malformed YouTube comment response", "invalid_response")
        return body

    def record_error(error, resource, parent_id=None):
        message = str(error)
        if api_key:
            message = message.replace(api_key, "[redacted]")
        result["errors"].append({
            "resource": resource,
            "parentId": parent_id,
            "reason": getattr(error, "reason", "fetch_failed"),
            "status": getattr(error, "status", None),
            "message": message,
        })

    def keep(comment, thread_id, parent_id=None):
        comment_id = comment.get("id")
        if not comment_id or comment_id in inspected_ids:
            return
        inspected_ids.add(comment_id)
        coverage["commentsInspected"] += 1
        snippet = comment.get("snippet") or {}
        author = snippet.get("authorChannelId") or {}
        author_id = author.get("value") if isinstance(author, dict) else author
        if author_id != channel_id:
            return
        result["comments"].append({
            "id": comment_id,
            "threadId": thread_id,
            "parentId": parent_id or snippet.get("parentId"),
            "authorChannelId": author_id,
            "authorDisplayName": snippet.get("authorDisplayName"),
            "authorVerified": True,
            "textOriginal": snippet.get("textOriginal", ""),
            "permalink": f"https://www.youtube.com/watch?v={urllib.parse.quote(str(video_id), safe='')}&lc={urllib.parse.quote(str(comment_id), safe='')}",
            "publishedAt": snippet.get("publishedAt"),
            "updatedAt": snippet.get("updatedAt"),
            "timeKind": "metadata",
            "sceneSeconds": None,
        })

    token = None
    visited_thread_tokens = set()
    while max_thread_pages is None or coverage["threadPagesRead"] < max_thread_pages:
        if token in visited_thread_tokens:
            record_error(CommentFetchError("Repeated thread page token", "repeated_page_token"), "commentThreads")
            break
        visited_thread_tokens.add(token)
        params = {"part": "snippet,replies", "videoId": video_id, "order": "relevance", "maxResults": 100, "textFormat": "plainText"}
        if token:
            params["pageToken"] = token
        try:
            body = request("commentThreads", params)
        except (RuntimeError, OSError, ValueError) as error:
            record_error(error, "commentThreads")
            break
        coverage["threadPagesRead"] += 1
        for thread in body.get("items", []):
            snippet = thread.get("snippet") or {}
            top = snippet.get("topLevelComment") or {}
            parent_id = top.get("id")
            thread_id = thread.get("id")
            keep(top, thread_id)
            included = (thread.get("replies") or {}).get("comments") or []
            for reply in included:
                keep(reply, thread_id, parent_id)
            included_ids = {reply.get("id") for reply in included if reply.get("id")}
            total = snippet.get("totalReplyCount")
            reply_coverage = {
                "threadId": thread_id,
                "parentId": parent_id,
                "totalRepliesReported": total,
                "includedRepliesRead": len(included_ids),
                "pagesRead": 0,
                "complete": isinstance(total, int) and len(included_ids) >= total,
                "nextPageToken": None,
            }
            coverage["replyThreads"].append(reply_coverage)
            if reply_coverage["complete"]:
                continue
            if not parent_id:
                record_error(CommentFetchError("Missing top-level comment ID", "invalid_response"), "comments")
                continue
            reply_token = None
            visited_reply_tokens = set()
            while max_reply_pages is None or reply_coverage["pagesRead"] < max_reply_pages:
                if reply_token in visited_reply_tokens:
                    record_error(CommentFetchError("Repeated reply page token", "repeated_page_token"), "comments", parent_id)
                    break
                visited_reply_tokens.add(reply_token)
                reply_params = {"part": "snippet", "parentId": parent_id, "maxResults": 100, "textFormat": "plainText"}
                if reply_token:
                    reply_params["pageToken"] = reply_token
                try:
                    replies = request("comments", reply_params)
                except (RuntimeError, OSError, ValueError) as error:
                    record_error(error, "comments", parent_id)
                    break
                reply_coverage["pagesRead"] += 1
                coverage["replyPagesRead"] += 1
                for reply in replies.get("items", []):
                    keep(reply, thread_id, parent_id)
                reply_token = replies.get("nextPageToken")
                reply_coverage["nextPageToken"] = reply_token
                if not reply_token:
                    reply_coverage["complete"] = True
                    break
        token = body.get("nextPageToken")
        coverage["nextThreadPageToken"] = token
        if not token:
            coverage["threadsExhausted"] = True
            break

    coverage["creatorCommentsFound"] = len(result["comments"])
    coverage["complete"] = (
        coverage["threadsExhausted"]
        and all(thread["complete"] for thread in coverage["replyThreads"])
        and not result["errors"]
    )
    if coverage["complete"]:
        result["status"] = "complete"
    elif coverage["threadPagesRead"]:
        result["status"] = "partial"
    elif any(error["reason"] == "commentsDisabled" for error in result["errors"]):
        result["status"] = "disabled"
    elif not result["errors"]:
        result["status"] = "partial"
    return result


def meaningful_comment(text):
    """Exclude only empty, emoji-only and plain gratitude-only model input."""
    words = "".join(character for character in str(text or "").casefold() if character.isalnum())
    return bool(words) and words not in {
        "thanks", "thankyou", "thx", "ty", "감사합니다", "감사해요", "고맙습니다", "고마워요",
        "ありがとう", "ありがとうございます",
    }


def model_creator_comments(envelope, video_id, channel_id):
    """Return verified, deduplicated model text while retaining provenance."""
    if not isinstance(envelope, dict):
        envelope = {}
    coverage = envelope.get("coverage") or {"complete": False}
    output = {
        "status": envelope.get("status", "not_collected"),
        "coverage": coverage,
        "comments": [],
    }
    if not channel_id or envelope.get("videoId") != video_id or envelope.get("channelId") != channel_id:
        if envelope:
            output["status"] = "scope_mismatch"
            output["coverage"] = {**coverage, "complete": False}
        return output
    seen = {}
    for comment in envelope.get("comments") or []:
        if comment.get("authorChannelId") != channel_id or not comment.get("id"):
            continue
        text = comment.get("textOriginal") or ""
        if not meaningful_comment(text):
            continue
        ref = {key: comment.get(key) for key in ("id", "threadId", "parentId", "authorChannelId", "permalink", "publishedAt", "updatedAt")}
        normalized = re.sub(r"\s+", " ", text).strip()
        if normalized in seen:
            seen[normalized]["sourceRefs"].append(ref)
            continue
        item = {
            "id": comment["id"],
            "source": "author_comment",
            "authorChannelId": channel_id,
            "authorVerified": True,
            "textOriginal": text,
            "permalink": comment.get("permalink"),
            "publishedAt": comment.get("publishedAt"),
            "updatedAt": comment.get("updatedAt"),
            "timeKind": "metadata",
            "startSeconds": None,
            "sourceRefs": [ref],
        }
        seen[normalized] = item
        output["comments"].append(item)
    return output
