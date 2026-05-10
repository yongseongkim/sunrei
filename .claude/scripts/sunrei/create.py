"""
Source-agnostic Step 3: read a unified sunrei.json, resolve tags, POST to /admin/sunreis,
and (optionally) update an S3 registry.

Usage:
    # Dry run: resolve tags + write payload.json (no POST, no S3 write)
    uv run --with requests python .claude/scripts/sunrei/create.py \\
        --workspace .claude/workspace/animepilgrimage/shoshimin \\
        --dry-run

    # Live: POST + S3 registry update
    uv run --with requests python .claude/scripts/sunrei/create.py \\
        --workspace .claude/workspace/animepilgrimage/shoshimin \\
        --server http://localhost:3030 \\
        --aws-profile {profile}

Workspace contract:
    {workspace}/sunrei.json   (input — CreateSunreiRequest + _source block)

Outputs:
    {workspace}/payload.json  (resolved tagIds, what will be POSTed)
    {workspace}/result.json   (live mode only — sunreiId + spotIds)

`_source` block (optional but used for tag candidates and S3 registry):
    {
      "type": "youtube" | "animepilgrimage" | ...,
      "tagCandidates": ["..."],          // 3-5 names; matched/created
      "registryKey": "youtube/UC.json",  // path under s3://sunrei-resources/
      "registryInit": { ... },           // top-level fields when registry doesn't exist
      "summary": { ... },                // merged into the new sunrei entry
      "spotMetadata": [ { ... }, ... ]   // merged into each spot entry, parallel to spots[]
    }
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = REPO_ROOT / ".claude" / ".env"
S3_BUCKET = "sunrei-resources"


def load_dot_env():
    if not ENV_FILE.is_file():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, _, value = line.partition("=")
        if key and key not in os.environ:
            os.environ[key] = value


def fetch_existing_tags(server: str, token: str) -> list[dict]:
    tags: list[dict] = []
    next_token: str | None = None
    while True:
        params = {"size": 100}
        if next_token:
            params["nextToken"] = next_token
        res = requests.get(
            f"{server.rstrip('/')}/admin/tags",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=30,
        )
        res.raise_for_status()
        body = res.json()
        tags.extend(body.get("data", []))
        next_token = body.get("nextToken")
        if not next_token:
            break
    return tags


def create_tag(server: str, token: str, name: str) -> dict:
    res = requests.post(
        f"{server.rstrip('/')}/admin/tags",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"name": name},
        timeout=30,
    )
    if res.status_code != 201:
        raise RuntimeError(f"failed to create tag {name!r}: {res.status_code} {res.text}")
    return res.json()


def resolve_tags(
    candidates: list[str],
    existing: list[dict],
    server: str,
    token: str,
    *,
    create: bool = True,
) -> tuple[list[str], list[dict], list[dict], list[str]]:
    """Match candidates against existing tags; optionally create unmatched.

    Returns (tagIds, matched, created, toCreate) where each tag item is {id, name}
    and toCreate is the list of unmatched candidate names (only meaningful when
    create=False).
    """
    by_name_lower: dict[str, dict] = {t["name"].lower(): t for t in existing}
    tag_ids: list[str] = []
    matched: list[dict] = []
    created: list[dict] = []
    to_create: list[str] = []
    seen_ids: set[str] = set()
    seen_create: set[str] = set()
    for raw in candidates:
        name = raw.strip()
        if not name:
            continue
        existing_tag = by_name_lower.get(name.lower())
        if existing_tag:
            tid = existing_tag["id"]
            if tid not in seen_ids:
                tag_ids.append(tid)
                matched.append({"id": tid, "name": existing_tag["name"]})
                seen_ids.add(tid)
            continue
        if not create:
            if name.lower() not in seen_create:
                to_create.append(name)
                seen_create.add(name.lower())
            continue
        new_tag = create_tag(server, token, name)
        tid = new_tag["id"]
        if tid not in seen_ids:
            tag_ids.append(tid)
            created.append({"id": tid, "name": new_tag["name"]})
            seen_ids.add(tid)
            by_name_lower[new_tag["name"].lower()] = new_tag
    return tag_ids, matched, created, to_create


def s3_download(profile: str, key: str) -> dict | None:
    s3_path = f"s3://{S3_BUCKET}/{key}"
    with tempfile.NamedTemporaryFile(mode="r", suffix=".json", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        result = subprocess.run(
            ["aws-vault", "exec", profile, "--", "aws", "s3", "cp", s3_path, tmp_path],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            stderr = (result.stderr or "").lower()
            if "not found" in stderr or "404" in stderr or "nosuchkey" in stderr:
                return None
            raise RuntimeError(f"aws s3 cp failed: {result.stderr}")
        return json.loads(Path(tmp_path).read_text())
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def s3_upload(profile: str, key: str, body: dict):
    s3_path = f"s3://{S3_BUCKET}/{key}"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as tmp:
        json.dump(body, tmp, ensure_ascii=False, indent=2)
        tmp_path = tmp.name
    try:
        result = subprocess.run(
            ["aws-vault", "exec", profile, "--", "aws", "s3", "cp", tmp_path, s3_path,
             "--content-type", "application/json"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"aws s3 cp upload failed: {result.stderr}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def update_registry(profile: str, source: dict, sunrei_id: str, spot_ids: list[str]) -> dict | None:
    key = source.get("registryKey")
    if not key:
        return None

    summary = source.get("summary", {}) or {}
    spot_metadata = source.get("spotMetadata", []) or []
    init = source.get("registryInit", {}) or {}

    new_entry = {
        "sunreiId": sunrei_id,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        **summary,
        "spots": [
            {"spotId": sid, **(spot_metadata[i] if i < len(spot_metadata) else {})}
            for i, sid in enumerate(spot_ids)
        ],
    }

    registry = s3_download(profile, key)
    if registry is None:
        registry = {**init, "sunreis": []}
    registry.setdefault("sunreis", []).append(new_entry)
    s3_upload(profile, key, registry)
    return new_entry


def check_registry_for_duplicate(profile: str, source: dict) -> dict | None:
    """Pre-check: warn if registry already has entries for this source key."""
    key = source.get("registryKey")
    if not key:
        return None
    registry = s3_download(profile, key)
    if registry is None:
        return None
    existing = registry.get("sunreis", [])
    if not existing:
        return None
    return {"existingCount": len(existing), "lastEntry": existing[-1]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True, help="path containing sunrei.json")
    parser.add_argument("--server", default="http://localhost:3030")
    parser.add_argument("--aws-profile", help="aws-vault profile for S3 registry update (skipped if omitted)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-registry", action="store_true", help="skip the S3 registry update even if registryKey is present")
    args = parser.parse_args()

    workspace = Path(args.workspace)
    sunrei_path = workspace / "sunrei.json"
    payload_path = workspace / "payload.json"
    result_path = workspace / "result.json"

    if not sunrei_path.is_file():
        print(f"Error: missing {sunrei_path}", file=sys.stderr)
        return 1

    sunrei = json.loads(sunrei_path.read_text())
    source = sunrei.pop("_source", {}) or {}
    tag_candidates = source.get("tagCandidates", []) or []

    load_dot_env()
    token = os.environ.get("SUNREI_ADMIN_TOKEN")
    if not token and not args.dry_run:
        print("Error: SUNREI_ADMIN_TOKEN not set. Run: uv run --with requests python .claude/scripts/auth/login.py", file=sys.stderr)
        return 1

    # Resolve tags. In dry-run we only MATCH (no creation) so the preview is non-mutating.
    # Without a token, dry-run skips server contact entirely and reports all candidates
    # under willCreateTags.
    matched: list[dict] = []
    created: list[dict] = []
    to_create: list[str] = []
    if tag_candidates:
        existing: list[dict] = []
        if token:
            try:
                existing = fetch_existing_tags(args.server, token)
            except Exception as e:
                print(f"Warning: could not fetch existing tags ({e}); skipping tag resolution.", file=sys.stderr)
                existing = []
        else:
            print("Note: no SUNREI_ADMIN_TOKEN; dry-run will list all candidates as willCreateTags.", file=sys.stderr)
        tag_ids, matched, created, to_create = resolve_tags(
            tag_candidates, existing, args.server, token or "", create=not args.dry_run
        )
        sunrei.setdefault("tagIds", []).extend(tag_ids)
        sunrei["tagIds"] = list(dict.fromkeys(sunrei["tagIds"]))

    payload_path.parent.mkdir(parents=True, exist_ok=True)
    payload_path.write_text(json.dumps(sunrei, ensure_ascii=False, indent=2))
    print(
        f"wrote {payload_path} (title={sunrei.get('title')!r}, spots={len(sunrei.get('spots', []))}, tags={len(sunrei.get('tagIds', []))})",
        file=sys.stderr,
    )
    if matched:
        print(f"  matched tags: {[t['name'] for t in matched]}", file=sys.stderr)
    if created:
        print(f"  created tags: {[t['name'] for t in created]}", file=sys.stderr)

    if args.dry_run:
        summary = {
            "title": sunrei.get("title"),
            "spotCount": len(sunrei.get("spots", [])),
            "tagIds": sunrei.get("tagIds", []),
            "matchedTags": matched,
            "willCreateTags": to_create,
            "registryKey": source.get("registryKey"),
            "sampleSpots": [
                {"name": s["place"]["name"], "address": s["place"].get("address"), "googleMapsId": s["place"].get("googleMapsId")}
                for s in sunrei.get("spots", [])[:3]
            ],
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    # Pre-check S3 registry for duplicates (informational only)
    if source.get("registryKey") and args.aws_profile and not args.no_registry:
        try:
            dup = check_registry_for_duplicate(args.aws_profile, source)
            if dup:
                print(f"Note: registry s3://{S3_BUCKET}/{source['registryKey']} already has {dup['existingCount']} entries.", file=sys.stderr)
        except Exception as e:
            print(f"Warning: could not pre-check registry ({e})", file=sys.stderr)

    # POST sunrei
    res = requests.post(
        f"{args.server.rstrip('/')}/admin/sunreis",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        data=json.dumps(sunrei, ensure_ascii=False).encode("utf-8"),
        timeout=120,
    )

    if res.status_code != 201:
        try:
            body = res.json()
        except Exception:
            body = {"error": res.text}
        if res.status_code == 409:
            print(f"conflict (409): {body}", file=sys.stderr)
            print(json.dumps({"status": "conflict", "body": body}, ensure_ascii=False, indent=2))
            return 2
        print(f"error {res.status_code}: {body}", file=sys.stderr)
        print(json.dumps({"status": "error", "code": res.status_code, "body": body}, ensure_ascii=False, indent=2))
        return 3

    body = res.json()
    sunrei_id = body.get("id")
    spot_ids = [s.get("id") for s in body.get("spots", [])]
    result = {
        "sunreiId": sunrei_id,
        "spotIds": spot_ids,
        "title": body.get("title"),
        "spotCount": len(spot_ids),
        "createdTags": created,
        "matchedTags": matched,
    }

    # S3 registry update on success
    if source.get("registryKey") and args.aws_profile and not args.no_registry:
        try:
            entry = update_registry(args.aws_profile, source, sunrei_id, spot_ids)
            result["registryUpdated"] = bool(entry)
            result["registryKey"] = source["registryKey"]
        except Exception as e:
            print(f"Warning: registry update failed ({e}); the Sunrei was created but registry was not updated.", file=sys.stderr)
            result["registryUpdated"] = False
            result["registryError"] = str(e)
    elif source.get("registryKey") and not args.aws_profile:
        print(f"Note: registryKey={source['registryKey']!r} present but --aws-profile not provided; skipping S3 update.", file=sys.stderr)

    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"created {sunrei_id} ({len(spot_ids)} spots)", file=sys.stderr)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
