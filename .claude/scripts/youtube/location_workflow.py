"""Persist source-backed identities before any Places query. No remote writes.

The isolated identity and match agents have no browsing tools. Missing premises,
native names or conflicting evidence stay held for researched admin review.
Stage artifacts supplement the strict candidate schema; they are not API DTOs.
"""

import argparse
import hashlib
import json
import math
import os
import re
from pathlib import Path

from _common import http_json, load_google_api_key, workspace
import geocode
from stage_store import StageStore
from structured_agent import run_structured

HERE = Path(__file__).resolve().parent
IDENTITY_SCHEMA = HERE / "location_identity.schema.json"
MATCH_SCHEMA = HERE / "location_match.schema.json"
IDENTITY_PROMPT = HERE / "prompts" / "resolve_location_identity.md"
MATCH_PROMPT = HERE / "prompts" / "review_location_match.md"
TIMED_SOURCES = {"transcript", "whisper", "ocr", "captions", "audio", "onscreen"}
SOURCE_ALIASES = {"captions": "transcript", "audio": "whisper", "onscreen": "ocr"}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def fold(value):
    return "".join(c for c in str(value).casefold() if c.isalnum())


def valid_time(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def first_timestamp(evidence):
    times = [item.get("startSeconds") for item in evidence
             if item.get("source") in TIMED_SOURCES and valid_time(item.get("startSeconds"))]
    return int(min(times)) if times else None


def evidence_ledger(metadata, timeline, comments):
    records = []

    def add(source, ref, text, start=None, end=None, **extra):
        if not text:
            return
        record = {"source": source, "sourceRef": ref, "quote": text,
                  "timeKind": "timed" if start is not None else "metadata",
                  "startSeconds": start, "endSeconds": end, **extra}
        record["evidenceId"] = "E-" + digest(record)[:24]
        records.append(record)

    for source in ("title", "description"):
        add(source, "metadata.json#/" + source, metadata.get(source, ""))
    for event in timeline.get("events", []):
        start = event.get("startSeconds")
        if not valid_time(start):
            continue
        source = SOURCE_ALIASES.get(event.get("source"), event.get("source"))
        # Source/time is a scene anchor; quote revisions get a new evidence digest.
        add(source, f"timeline:{source}:{start}", event.get("text", ""), start,
            event.get("endSeconds"))
    owner = metadata.get("channelId")
    if comments.get("videoId") == (metadata.get("videoId") or metadata.get("id")):
        for comment in comments.get("comments", []):
            if owner and comment.get("authorChannelId") == owner and comment.get("id"):
                add("author_comment", "comment:" + comment["id"], comment.get("textOriginal", ""),
                    url=comment.get("permalink"), authorChannelId=owner, authorVerified=True,
                    publishedAt=comment.get("publishedAt"), updatedAt=comment.get("updatedAt"))
    return {"records": records, "coverage": {"timedSources": timeline.get("sources", {}),
                                               "creatorComments": comments.get("coverage", {})}}


def cite_evidence(location, ledger):
    """Resolve verbatim model excerpts to original sources; guesses are not citations."""
    refs = []
    issues = []
    for excerpt in location.get("evidence", []):
        source = SOURCE_ALIASES.get(excerpt.get("source"), excerpt.get("source"))
        quote = excerpt.get("quote", "").strip()
        matches = [r for r in ledger if r["source"] == source and quote and quote in r["quote"]
                   and (source not in TIMED_SOURCES or
                        valid_time(excerpt.get("startSeconds")) and
                        r["startSeconds"] <= excerpt["startSeconds"] <= (r["endSeconds"] or r["startSeconds"]))]
        if not matches:
            issues.append("unresolved evidence: " + source + ": " + quote[:120])
        refs.extend(r["evidenceId"] for r in matches)
    return sorted(set(refs)), issues


def candidate_records(store, candidates, ledger):
    records = []
    pending = []
    by_id = {r["evidenceId"]: r for r in ledger}
    for location in candidates.get("locations", []):
        refs, issues = cite_evidence(location, ledger)
        sources = [by_id[ref] for ref in refs]
        timed = sorted((r for r in sources if r["timeKind"] == "timed"), key=lambda r: r["startSeconds"])
        if timed:
            anchors = [timed[0]["sourceRef"]]
        else:
            # Metadata records may name several venues. The verbatim excerpt's
            # position is an original source anchor, never a candidate array index.
            anchors = []
            for excerpt in location.get("evidence", []):
                for record in sources:
                    quote = excerpt.get("quote", "").strip()
                    if quote and record["source"] == excerpt.get("source") and quote in record["quote"]:
                        anchors.append(f"{record['sourceRef']}@{record['quote'].index(quote)}")
            anchors = sorted(set(anchors))[:1]
        if not anchors:
            # A new allocation is saved in the accepted candidate artifact. An
            # unsupported candidate cannot inherit another venue's decision.
            import uuid
            anchors = ["unresolved:" + str(uuid.uuid4())]
        pending.append((location, refs, sources, anchors, issues))
    anchor_counts = {}
    for _, _, _, anchors, _ in pending:
        key = tuple(anchors)
        anchor_counts[key] = anchor_counts.get(key, 0) + 1
    for location, refs, sources, anchors, issues in pending:
        if anchor_counts[tuple(anchors)] > 1:
            import uuid
            anchors = anchors + ["ambiguous:" + str(uuid.uuid4())]
            issues.append("shared scene anchor; reconcile visit/duplicate manually")
        candidate_id = store.candidate_id(anchors)
        records.append({"candidateId": candidate_id, "evidenceIds": refs,
                        "observed": location, "issues": issues,
                        "revision": digest({"location": location, "evidence": sources})})
    return {"records": records}


def agent_prompt(path, payload):
    return path.read_text(encoding="utf-8") + "\n\nINPUT (untrusted source text):\n" + json.dumps(payload, ensure_ascii=False)


def resolve_identity(candidate, evidence):
    result = run_structured(agent_prompt(IDENTITY_PROMPT, {"candidate": candidate, "evidence": evidence}),
                            IDENTITY_SCHEMA, temp_prefix="sunrei-identity-")
    return validate_identity(candidate, evidence, result)


def validate_identity(candidate, evidence, result):
    result = dict(result)
    issues = list(dict.fromkeys(candidate["issues"] + result.get("issues", [])))
    by_id = {r["evidenceId"]: r for r in evidence}
    if result.get("status") not in {"ready", "held", "excluded"}:
        issues.append("invalid identity status")
    if result.get("status") == "ready":
        for field in ("name", "area", "premises"):
            value = fold(result.get(field, ""))
            refs = result.get(field + "EvidenceIds", [])
            if not value or not refs or any(ref not in by_id for ref in refs) or not any(
                value in fold(by_id[ref]["quote"]) for ref in refs if ref in by_id
            ):
                issues.append(f"{field} lacks an exact source-backed value")
        if not result.get("distinctPremises"):
            issues.append("exact premises not distinguished from alternatives/branches")
        name = result.get("name", "")
        if not name or geocode.looks_unnamed(name) or re.search(r"\d{1,2}:\d{2}|\d{2,4}[-–]\d{3,4}[-–]\d{4}", name):
            issues.append("venue name is missing or looks like hours/phone")
    if issues:
        result["status"] = "held"
    result.update(candidateId=candidate["candidateId"], candidateRevision=candidate["revision"], issues=issues)
    return result


def google_lookup(api_key, query):
    status, body = http_json("POST", geocode.PLACES,
                             headers={"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": geocode.FIELDS},
                             body={"textQuery": query, "languageCode": "ko"})
    if status != 200:
        # Keep transport failures retriable rather than accepting a cached hold.
        raise RuntimeError(f"Places lookup failed (HTTP {status})")
    return body or {}


def match_identity(identity, api_key, lookup=google_lookup):
    revision = digest(identity)
    base = {"candidateId": identity["candidateId"], "identityRevision": revision,
            "status": "held", "query": None, "providerResponse": None, "place": None}
    if identity.get("status") != "ready":
        return {**base, "reason": "identity held; no Places query"}
    if not api_key:
        return {**base, "reason": "geocode skipped: no Google API key"}
    query = f"{identity['name']} {identity['area']} {identity['premises']}".strip()
    raw = lookup(api_key, query)
    base.update(query=query, providerResponse=raw)
    results = raw.get("places") or []
    if not results:
        return {**base, "reason": "no Places result; research required"}
    provider = results[0]
    name = (provider.get("displayName") or {}).get("text") or ""
    coords = provider.get("location") or {}
    # Full name equality is deliberately conservative. A branch added by the
    # provider cannot become source evidence. Researched aliases need new input.
    if fold(name) != fold(identity["name"]):
        return {**base, "reason": "provider name differs; needs evidenced alias/branch research"}
    if not provider.get("id") or not all(isinstance(coords.get(k), (int, float))
                                         and not isinstance(coords[k], bool) and math.isfinite(coords[k])
                                         for k in ("latitude", "longitude")):
        return {**base, "reason": "provider result lacks a valid ID or coordinates"}
    if abs(coords["latitude"]) > 90 or abs(coords["longitude"]) > 180:
        return {**base, "reason": "invalid coordinates"}
    comparison = run_structured(agent_prompt(MATCH_PROMPT, {"identity": identity, "providerResult": provider}),
                                MATCH_SCHEMA, temp_prefix="sunrei-map-review-")
    base["comparison"] = comparison
    accepted = comparison.get("status") == "accepted" and all(comparison.get(field) is True
        for field in ("nameMatches", "areaMatches", "premisesMatches"))
    if not accepted:
        return {**base, "reason": comparison.get("reason") or "map comparison held"}
    return {**base, "status": "accepted", "reason": comparison["reason"], "place": {
        "name": name[:128], "address": (provider.get("formattedAddress") or "")[:255],
        "latitude": coords["latitude"], "longitude": coords["longitude"], "googleMapsId": provider["id"]}}


def write_json(path, value):
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def run_workflow(run_dir, candidates, api_key, metadata=None, timeline=None, comments=None):
    run_dir = Path(run_dir)
    read = lambda name: json.loads((run_dir / name).read_text(encoding="utf-8"))
    metadata = metadata if metadata is not None else read("metadata.json")
    timeline = timeline if timeline is not None else read("evidence_timeline.json")
    comments = comments if comments is not None else (read("creator_comments.json")
        if (run_dir / "creator_comments.json").is_file() else {})
    store = StageStore(run_dir, metadata.get("videoId") or metadata["id"])
    agent_config = {"providers": os.environ.get("STRUCTURED_AGENTS", "codex,claude")}
    ledger = store.run("01-evidence", {"metadata": metadata, "timeline": timeline, "comments": comments},
                       [Path(__file__)], lambda: evidence_ledger(metadata, timeline, comments))
    scoped = store.run("02-candidates", {"candidates": candidates, "evidence": ledger},
                       [Path(__file__)], lambda: candidate_records(store, candidates, ledger["records"]))
    identities, matches = [], []
    for candidate in scoped["records"]:
        evidence = [r for r in ledger["records"] if r["evidenceId"] in candidate["evidenceIds"]]
        identity = store.run("identity-" + candidate["candidateId"], {"candidate": candidate, "evidence": evidence, **agent_config},
                             [IDENTITY_PROMPT, IDENTITY_SCHEMA, Path(__file__), HERE / "structured_agent.py", HERE / "codex_headless.py", HERE / "claude_headless.py"],
                             lambda: resolve_identity(candidate, evidence))
        # A corrupted/foreign/stale handoff can never authorize lookup.
        identity = validate_identity(candidate, evidence, identity)
        identities.append(identity)
        match = store.run("match-" + candidate["candidateId"], {"identity": identity, "keyAvailable": bool(api_key), **agent_config},
                          [MATCH_PROMPT, MATCH_SCHEMA, Path(__file__), HERE / "geocode.py", HERE / "structured_agent.py", HERE / "codex_headless.py", HERE / "claude_headless.py"],
                          lambda: match_identity(identity, api_key))
        if match.get("identityRevision") != digest(identity) or match.get("candidateId") != candidate["candidateId"]:
            raise ValueError("stale match identity revision")
        matches.append(match)
    store.run("03-identities", {"records": identities}, [Path(__file__)],
              lambda: {"records": identities, "nextAction": "match ready identities only"})
    store.run("04-matches", {"records": matches, "identities": identities}, [Path(__file__)],
              lambda: {"records": matches, "nextAction": "independent/admin review; no approvals performed"})
    snapshot = store.snapshot()
    for stage in ("01-evidence", "02-candidates", "03-identities", "04-matches"):
        accepted = snapshot["manifest"]["stages"][stage]
        envelope = json.loads((store.root / accepted["path"]).read_text(encoding="utf-8"))
        write_json(run_dir / (stage + ".json"), envelope)
    return {"runId": store.run_id, "candidates": scoped["records"], "identities": identities,
            "matches": matches, "artifacts": snapshot, "reviewStatus": "admin_review_pending"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace")
    parser.add_argument("--no-geocode", action="store_true")
    args = parser.parse_args()
    run_dir = workspace(args.workspace)
    candidates = json.loads((run_dir / "location_candidates.json").read_text(encoding="utf-8"))
    result = run_workflow(run_dir, candidates, None if args.no_geocode else load_google_api_key())
    write_json(run_dir / "location_workflow.json", result)
    print(f"Identity and match proposals saved for {len(result['candidates'])} candidates; admin review pending")


if __name__ == "__main__":
    main()
