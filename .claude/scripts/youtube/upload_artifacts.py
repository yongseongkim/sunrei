"""Upload YouTube source and derived JSON artifacts using SOPS-managed keys.

The default is a dry run. Pass ``--commit`` to decrypt the existing server AWS
key and upload immutable gzip objects, a run manifest, and ``latest.json``.
Raw audio and video are never accepted as artifacts.

Usage:
    uv run --with boto3 python .claude/scripts/youtube/upload_artifacts.py \
      RUN_DIR --playlist-id ID --video-id ID --run-id ID [--commit]
"""

import argparse
import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from _common import ROOT

DEFAULT_CONFIG = ROOT / ".claude" / "config" / "youtube-renewal.json"
SECRETS_FILE = ROOT / "deploy" / "secrets" / "secrets.enc.yaml"
ARTIFACT_ROLES = {
    "metadata.json": "source",
    "captions.json": "source",
    "audio_transcript.json": "source",
    "onscreen_text.json": "source",
    "transcripts.json": "source_normalized",
    "evidence_timeline.json": "source_normalized",
    "transcript_review.json": "review",
    "transcripts.reviewed.json": "derived",
    "location_candidates.json": "derived",
}
ALLOWED_FILES = tuple(ARTIFACT_ROLES)
SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--playlist-id", required=True)
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--commit", action="store_true")
    return parser.parse_args()


def read_json(path):
    with Path(path).open(encoding="utf-8") as file:
        return json.load(file)


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write("\n")
    temporary.replace(path)


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_id(label, value):
    if not SAFE_ID.fullmatch(value):
        raise ValueError(f"Invalid {label}: {value}")


def load_sops_secret(key):
    result = subprocess.run(
        ["sops", "-d", "--extract", f'["stringData"]["{key}"]', str(SECRETS_FILE)],
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Could not decrypt {key}: {result.stderr.strip()[-500:]}")
    value = result.stdout.strip()
    if not value:
        raise RuntimeError(f"SOPS value {key} is empty")
    return value


def public_url(bucket, region, key):
    encoded = urllib.parse.quote(key, safe="/")
    return f"https://{bucket}.s3.{region}.amazonaws.com/{encoded}"


def artifact_entries(run_dir, bucket, region, run_prefix):
    entries = []
    for file_name in ALLOWED_FILES:
        path = run_dir / file_name
        if not path.is_file():
            continue
        raw = path.read_bytes()
        compressed = gzip.compress(raw, mtime=0)
        key = f"{run_prefix}/{file_name}.gz"
        entries.append(
            {
                "file": file_name,
                "role": ARTIFACT_ROLES[file_name],
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
        )
    return entries


def manifest_value(playlist_id, video_id, run_id, bucket, region, run_prefix, entries):
    return {
        "schemaVersion": 1,
        "playlistId": playlist_id,
        "videoId": video_id,
        "runId": run_id,
        "createdAt": utc_now(),
        "reviewStatus": "pending",
        "bucket": bucket,
        "prefix": run_prefix,
        "artifacts": [
            {key: value for key, value in entry.items() if key != "body"}
            for entry in entries
        ],
    }


def create_client(region):
    try:
        import boto3
    except ImportError as error:
        raise RuntimeError("boto3 is required for --commit; run with `uv run --with boto3`") from error

    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
    if access_key or secret_key:
        if not access_key or not secret_key:
            raise RuntimeError(
                "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together"
            )
        return boto3.client("s3", region_name=region)

    return boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=load_sops_secret("aws-access-key-id"),
        aws_secret_access_key=load_sops_secret("aws-secret-access-key"),
    )


def main():
    args = parse_args()
    for label, value in (
        ("playlist ID", args.playlist_id),
        ("video ID", args.video_id),
        ("run ID", args.run_id),
    ):
        validate_id(label, value)
    if not args.run_dir.is_dir():
        raise FileNotFoundError(args.run_dir)

    config = read_json(args.config)
    store = config["artifactStore"]
    bucket = store["bucket"]
    region = store["region"]
    root_prefix = store["prefix"].strip("/")
    video_prefix = f"{root_prefix}/playlists/{args.playlist_id}/videos/{args.video_id}"
    run_prefix = f"{video_prefix}/runs/{args.run_id}"
    manifest_key = f"{run_prefix}/manifest.json"
    latest_key = f"{video_prefix}/latest.json"
    entries = artifact_entries(args.run_dir, bucket, region, run_prefix)
    if not entries:
        raise ValueError(f"No allowed JSON artifacts found in {args.run_dir}")
    manifest = manifest_value(
        args.playlist_id,
        args.video_id,
        args.run_id,
        bucket,
        region,
        run_prefix,
        entries,
    )
    write_json(args.run_dir / "artifact_manifest.json", manifest)

    if not args.commit:
        print(f"[dry-run] {len(entries)} artifacts -> s3://{bucket}/{run_prefix}/")
        print(f"[dry-run] latest -> s3://{bucket}/{latest_key}")
        return

    client = create_client(region)
    for entry in entries:
        client.put_object(
            Bucket=bucket,
            Key=entry["key"],
            Body=entry["body"],
            ContentType=entry["contentType"],
            ContentEncoding=entry["contentEncoding"],
            CacheControl="public, max-age=31536000, immutable",
            Metadata={"sha256": entry["sha256"]},
        )
    manifest_body = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
    client.put_object(
        Bucket=bucket,
        Key=manifest_key,
        Body=manifest_body,
        ContentType="application/json",
        CacheControl="public, max-age=31536000, immutable",
    )
    latest = {
        "schemaVersion": 1,
        "playlistId": args.playlist_id,
        "videoId": args.video_id,
        "runId": args.run_id,
        "reviewStatus": "pending",
        "manifestKey": manifest_key,
        "manifestUrl": public_url(bucket, region, manifest_key),
        "updatedAt": utc_now(),
    }
    client.put_object(
        Bucket=bucket,
        Key=latest_key,
        Body=json.dumps(latest, ensure_ascii=False, indent=2).encode(),
        ContentType="application/json",
        CacheControl="no-cache",
    )
    print(f"uploaded {len(entries)} artifacts -> s3://{bucket}/{run_prefix}/")


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, KeyError, ValueError, RuntimeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
