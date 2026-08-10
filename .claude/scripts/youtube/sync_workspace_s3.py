"""Back up historical YouTube workspaces and playlist baselines to S3.

The command validates every JSON document and reports the upload plan by
default. Pass ``--commit`` to upload immutable gzip snapshots, manifests, and
latest pointers. No raw media is accepted.

Usage:
    uv run --with boto3 python .claude/scripts/youtube/sync_workspace_s3.py
    uv run --with boto3 python .claude/scripts/youtube/sync_workspace_s3.py --commit
"""

import argparse
import gzip
import hashlib
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from _common import WS_ROOT, admin_token, load_google_api_key
from renew_playlists import (
    DEFAULT_CONFIG,
    STATE_FILE,
    existing_video_ids,
    fetch_playlist,
    fetch_video_details,
    load_state,
    production_video_ids,
    read_json,
)
from upload_artifacts import create_client, public_url

SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")
SECRET_PATTERNS = {
    "AWS access key ID": re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "Google API key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "Bearer token": re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*", re.IGNORECASE),
}
SECRET_KEYS = {
    "awsaccesskeyid",
    "awssecretaccesskey",
    "authjwtsecret",
    "googleapikey",
    "youtubeapikey",
}
SOURCE_FILES = {
    "audio_transcript.json",
    "captions.json",
    "descriptions.json",
    "metadata.json",
    "onscreen_text.json",
    "transcripts_raw.json",
    "video_info.json",
}
NORMALIZED_FILES = {
    "evidence_timeline.json",
    "resolved_links.json",
    "staging.json",
    "transcripts.json",
}
REVIEW_FILES = {
    "location_candidates.json",
    "transcript_review.json",
    "transcript_review_hints.json",
    "transcripts.reviewed.json",
}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--state", type=Path, default=STATE_FILE)
    parser.add_argument("--workspace", type=Path, default=WS_ROOT)
    parser.add_argument("--playlist", action="append", dest="playlist_ids")
    parser.add_argument("--snapshot-id")
    parser.add_argument("--skip-workspace-history", action="store_true")
    parser.add_argument("--skip-playlist-snapshots", action="store_true")
    parser.add_argument("--commit", action="store_true")
    return parser.parse_args()


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_snapshot_id():
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def validate_id(label, value):
    if not SAFE_ID.fullmatch(value):
        raise ValueError(f"Invalid {label}: {value}")


def normalized_key(value):
    return re.sub(r"[^a-z0-9]", "", value.lower())


def find_secret_key(value, path="$"):
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if normalized_key(str(key)) in SECRET_KEYS and child not in (None, ""):
                return child_path
            found = find_secret_key(child, child_path)
            if found:
                return found
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found = find_secret_key(child, f"{path}[{index}]")
            if found:
                return found
    return None


def validate_json_artifact(path):
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
        value = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"Invalid UTF-8 JSON in {path}: {error}") from error
    secret_key = find_secret_key(value)
    if secret_key:
        raise ValueError(f"Sensitive key {secret_key} found in {path}")
    for label, pattern in SECRET_PATTERNS.items():
        if pattern.search(text):
            raise ValueError(f"Possible {label} found in {path}")
    return raw


def artifact_role(path):
    name = path.name
    if name in SOURCE_FILES or "whisper" in path.parts:
        return "source"
    if name in NORMALIZED_FILES:
        return "source_normalized"
    if name in REVIEW_FILES:
        return "review"
    if name == "locations.json" or name == "locations.legacy.json" or name.endswith("_vendors.json"):
        return "derived"
    if name.endswith("_result.json") or name == "_create_manifest.json":
        return "derived_intermediate"
    return "debug_intermediate"


def artifact_entry(file_name, role, raw, bucket, region, key):
    compressed = gzip.compress(raw, mtime=0)
    return {
        "file": file_name,
        "role": role,
        "key": key,
        "url": public_url(bucket, region, key),
        "contentType": "application/json",
        "contentEncoding": "gzip",
        "size": len(raw),
        "gzipSize": len(compressed),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "gzipSha256": hashlib.sha256(compressed).hexdigest(),
        "body": compressed,
    }


def manifest_artifacts(entries):
    return [
        {key: value for key, value in entry.items() if key != "body"}
        for entry in entries
    ]


def workspace_snapshot_plans(workspace, configured_ids, snapshot_id, bucket, region, root_prefix):
    plans = []
    if not workspace.is_dir():
        return plans
    for directory in sorted(path for path in workspace.iterdir() if path.is_dir()):
        workspace_id = directory.name
        if workspace_id == "automation":
            continue
        validate_id("workspace ID", workspace_id)
        paths = sorted(directory.rglob("*.json"))
        if not paths:
            continue
        if workspace_id in configured_ids:
            owner_prefix = f"{root_prefix}/playlists/{workspace_id}"
            snapshot_prefix = f"{owner_prefix}/workspace-snapshots/{snapshot_id}"
            latest_key = f"{owner_prefix}/workspace-latest.json"
            owner_type = "playlist"
        else:
            owner_prefix = f"{root_prefix}/workspaces/{workspace_id}"
            snapshot_prefix = f"{owner_prefix}/snapshots/{snapshot_id}"
            latest_key = f"{owner_prefix}/latest.json"
            owner_type = "workspace"
        entries = []
        for path in paths:
            relative = path.relative_to(directory)
            raw = validate_json_artifact(path)
            key = f"{snapshot_prefix}/files/{relative.as_posix()}.gz"
            entries.append(
                artifact_entry(
                    relative.as_posix(),
                    artifact_role(relative),
                    raw,
                    bucket,
                    region,
                    key,
                )
            )
        manifest_key = f"{snapshot_prefix}/manifest.json"
        manifest = {
            "schemaVersion": 1,
            "snapshotType": "workspace_history",
            "snapshotId": snapshot_id,
            "workspaceId": workspace_id,
            "ownerType": owner_type,
            "createdAt": utc_now(),
            "bucket": bucket,
            "prefix": snapshot_prefix,
            "artifacts": manifest_artifacts(entries),
        }
        latest = {
            "schemaVersion": 1,
            "snapshotType": "workspace_history",
            "snapshotId": snapshot_id,
            "workspaceId": workspace_id,
            "artifactCount": len(entries),
            "manifestKey": manifest_key,
            "manifestUrl": public_url(bucket, region, manifest_key),
            "updatedAt": utc_now(),
        }
        plans.append(
            {
                "label": f"workspace {workspace_id}",
                "entries": entries,
                "manifestKey": manifest_key,
                "manifest": manifest,
                "latestKey": latest_key,
                "latest": latest,
            }
        )
    return plans


def ordered_unique(*groups):
    result = []
    seen = set()
    for group in groups:
        for value in group:
            if value and value not in seen:
                result.append(value)
                seen.add(value)
    return result


def playlist_snapshot_plan(
    playlist_config,
    remote,
    details,
    production_ids,
    previous_state,
    snapshot_id,
    bucket,
    region,
    root_prefix,
):
    playlist_id = playlist_config["id"]
    fetched_at = utc_now()
    videos = [
        {**video, **details.get(video["videoId"], {})}
        for video in remote["videos"]
    ]
    remote_ids = [video["videoId"] for video in videos]
    legacy_ids = existing_video_ids(playlist_id)
    previous = previous_state.get("playlists", {}).get(playlist_id, {})
    known_ids = ordered_unique(
        remote_ids,
        legacy_ids,
        previous.get("knownVideoIds", []),
        production_ids,
    )
    playlist_value = {
        "schemaVersion": 1,
        "snapshotId": snapshot_id,
        "fetchedAt": fetched_at,
        "id": playlist_id,
        "name": playlist_config.get("name"),
        "title": remote.get("title", ""),
        "channelId": remote.get("channelId", ""),
        "channelName": remote.get("channelName", ""),
        "enabled": bool(playlist_config.get("enabled")),
        "sunreiId": playlist_config.get("sunreiId"),
        "locationStrategy": playlist_config.get("locationStrategy"),
        "videos": videos,
    }
    state_value = {
        "schemaVersion": 1,
        "playlistId": playlist_id,
        "snapshotId": snapshot_id,
        "knownVideoIds": known_ids,
        "videos": previous.get("videos", {}),
        "lastCheckedAt": fetched_at,
        "remoteVideoCount": len(remote_ids),
        "productionVideoIds": production_ids,
        "productionCheckedAt": fetched_at,
        "baseline": {
            "remoteVideoCount": len(remote_ids),
            "legacyWorkspaceVideoCount": len(legacy_ids),
            "productionVideoCount": len(production_ids),
        },
    }
    owner_prefix = f"{root_prefix}/playlists/{playlist_id}"
    snapshot_prefix = f"{owner_prefix}/snapshots/{snapshot_id}"
    playlist_key = f"{snapshot_prefix}/playlist.json.gz"
    state_key = f"{snapshot_prefix}/state.json.gz"
    entries = [
        artifact_entry(
            "playlist.json",
            "source",
            json_bytes(playlist_value),
            bucket,
            region,
            playlist_key,
        ),
        artifact_entry(
            "state.json",
            "state",
            json_bytes(state_value),
            bucket,
            region,
            state_key,
        ),
    ]
    manifest_key = f"{snapshot_prefix}/manifest.json"
    manifest = {
        "schemaVersion": 1,
        "snapshotType": "playlist_baseline",
        "snapshotId": snapshot_id,
        "playlistId": playlist_id,
        "createdAt": utc_now(),
        "bucket": bucket,
        "prefix": snapshot_prefix,
        "artifacts": manifest_artifacts(entries),
    }
    latest = {
        "schemaVersion": 1,
        "snapshotType": "playlist_baseline",
        "snapshotId": snapshot_id,
        "playlistId": playlist_id,
        "remoteVideoCount": len(remote_ids),
        "knownVideoCount": len(known_ids),
        "playlistKey": playlist_key,
        "playlistUrl": public_url(bucket, region, playlist_key),
        "stateKey": state_key,
        "stateUrl": public_url(bucket, region, state_key),
        "manifestKey": manifest_key,
        "manifestUrl": public_url(bucket, region, manifest_key),
        "updatedAt": utc_now(),
    }
    return {
        "label": f"playlist {playlist_id}",
        "entries": entries,
        "manifestKey": manifest_key,
        "manifest": manifest,
        "latestKey": f"{owner_prefix}/latest.json",
        "latest": latest,
    }


def fetch_playlist_plans(config, selected, previous_state, snapshot_id, bucket, region, root_prefix):
    api_key = load_google_api_key()
    if not api_key:
        raise RuntimeError("No YouTube API key found in application-local.conf")
    token = admin_token()
    if not token:
        raise RuntimeError("Could not resolve an Admin API token for production baselines")
    playlists = [
        playlist
        for playlist in config.get("playlists", [])
        if not selected or playlist["id"] in selected
    ]
    missing = selected - {playlist["id"] for playlist in config.get("playlists", [])}
    if missing:
        raise ValueError(f"Unknown playlists: {', '.join(sorted(missing))}")
    plans = []
    for playlist in playlists:
        remote = fetch_playlist(api_key, playlist["id"])
        video_ids = [video["videoId"] for video in remote["videos"]]
        details = fetch_video_details(api_key, video_ids)
        production_ids = production_video_ids(playlist["sunreiId"], token)
        plans.append(
            playlist_snapshot_plan(
                playlist,
                remote,
                details,
                production_ids,
                previous_state,
                snapshot_id,
                bucket,
                region,
                root_prefix,
            )
        )
        print(
            f"prepared {playlist['name']}: remote={len(video_ids)} "
            f"details={len(details)} production={len(production_ids)}",
            flush=True,
        )
    return plans


def put_json(client, bucket, key, value, cache_control):
    body = json_bytes(value)
    digest = hashlib.sha256(body).hexdigest()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType="application/json",
        CacheControl=cache_control,
        Metadata={"sha256": digest},
    )
    return body, digest


def verify_entry(client, bucket, entry):
    head = client.head_object(Bucket=bucket, Key=entry["key"])
    if head.get("ContentLength") != entry["gzipSize"]:
        raise RuntimeError(f"Size mismatch for s3://{bucket}/{entry['key']}")
    if head.get("Metadata", {}).get("sha256") != entry["sha256"]:
        raise RuntimeError(f"Metadata hash mismatch for s3://{bucket}/{entry['key']}")
    body = client.get_object(Bucket=bucket, Key=entry["key"])["Body"].read()
    if hashlib.sha256(body).hexdigest() != entry["gzipSha256"]:
        raise RuntimeError(f"Compressed hash mismatch for s3://{bucket}/{entry['key']}")
    if hashlib.sha256(gzip.decompress(body)).hexdigest() != entry["sha256"]:
        raise RuntimeError(f"Content hash mismatch for s3://{bucket}/{entry['key']}")


def verify_json(client, bucket, key, expected_body, expected_digest):
    head = client.head_object(Bucket=bucket, Key=key)
    if head.get("ContentLength") != len(expected_body):
        raise RuntimeError(f"Size mismatch for s3://{bucket}/{key}")
    if head.get("Metadata", {}).get("sha256") != expected_digest:
        raise RuntimeError(f"Metadata hash mismatch for s3://{bucket}/{key}")
    body = client.get_object(Bucket=bucket, Key=key)["Body"].read()
    if body != expected_body:
        raise RuntimeError(f"Content mismatch for s3://{bucket}/{key}")


def verify_public_json(url, snapshot_id):
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                value = json.load(response)
            if value.get("snapshotId") != snapshot_id:
                raise RuntimeError(f"Unexpected snapshot at {url}")
            return
        except (OSError, ValueError, RuntimeError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(1)
    raise RuntimeError(f"Public read failed for {url}: {last_error}")


def upload_plan(client, bucket, region, plan, public):
    for entry in plan["entries"]:
        client.put_object(
            Bucket=bucket,
            Key=entry["key"],
            Body=entry["body"],
            ContentType=entry["contentType"],
            ContentEncoding=entry["contentEncoding"],
            CacheControl="public, max-age=31536000, immutable",
            Metadata={
                "sha256": entry["sha256"],
                "gzipsha256": entry["gzipSha256"],
            },
        )
    manifest_body, manifest_digest = put_json(
        client,
        bucket,
        plan["manifestKey"],
        plan["manifest"],
        "public, max-age=31536000, immutable",
    )
    for entry in plan["entries"]:
        verify_entry(client, bucket, entry)
    verify_json(client, bucket, plan["manifestKey"], manifest_body, manifest_digest)

    latest_body, latest_digest = put_json(
        client,
        bucket,
        plan["latestKey"],
        plan["latest"],
        "no-cache",
    )
    verify_json(client, bucket, plan["latestKey"], latest_body, latest_digest)
    if public:
        verify_public_json(
            public_url(bucket, region, plan["latestKey"]),
            plan["latest"]["snapshotId"],
        )


def main():
    args = parse_args()
    if args.skip_workspace_history and args.skip_playlist_snapshots:
        raise ValueError("Nothing to sync")
    snapshot_id = args.snapshot_id or new_snapshot_id()
    validate_id("snapshot ID", snapshot_id)
    config = read_json(args.config)
    if config.get("schemaVersion") != 1:
        raise ValueError(f"Unsupported config schema in {args.config}")
    store = config["artifactStore"]
    bucket = store["bucket"]
    region = store["region"]
    root_prefix = store["prefix"].strip("/")
    selected = set(args.playlist_ids or [])
    configured_ids = {playlist["id"] for playlist in config.get("playlists", [])}
    plans = []

    if not args.skip_workspace_history:
        plans.extend(
            workspace_snapshot_plans(
                args.workspace,
                configured_ids,
                snapshot_id,
                bucket,
                region,
                root_prefix,
            )
        )
    if not args.skip_playlist_snapshots:
        previous_state = load_state(args.state)
        plans.extend(
            fetch_playlist_plans(
                config,
                selected,
                previous_state,
                snapshot_id,
                bucket,
                region,
                root_prefix,
            )
        )
    if not plans:
        raise ValueError("No JSON snapshots found")

    entry_count = sum(len(plan["entries"]) for plan in plans)
    raw_size = sum(entry["size"] for plan in plans for entry in plan["entries"])
    gzip_size = sum(entry["gzipSize"] for plan in plans for entry in plan["entries"])
    mode = "commit" if args.commit else "dry-run"
    print(
        f"mode={mode} snapshot={snapshot_id} plans={len(plans)} "
        f"artifacts={entry_count} rawBytes={raw_size} gzipBytes={gzip_size}"
    )
    for plan in plans:
        print(
            f"  {plan['label']}: artifacts={len(plan['entries'])} "
            f"latest=s3://{bucket}/{plan['latestKey']}"
        )
    if not args.commit:
        return

    client = create_client(region)
    for index, plan in enumerate(plans, start=1):
        upload_plan(client, bucket, region, plan, bool(store.get("public")))
        print(f"uploaded and verified [{index}/{len(plans)}] {plan['label']}", flush=True)
    print(
        f"uploaded and verified {entry_count} artifacts in {len(plans)} snapshots "
        f"under s3://{bucket}/{root_prefix}/"
    )


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, KeyError, ValueError, RuntimeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
