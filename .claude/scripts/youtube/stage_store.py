"""Durable, local phase results; this module never performs remote writes.

``StageStore(run_directory, content_id).run(stage, inputs, policies, producer)``
returns the producer's JSON object unchanged. ``inputs`` must declare all data
and runtime options the producer consumes, including source-file digests and
upstream result hashes. Strings are data, not implicitly read filesystem paths.
Policy files, this module, and the producer's source/code are hashed; imported
helpers must be included in ``policies`` when their changes affect a result.

Artifacts live below ``run_directory/stage-store``. Attempts and candidate ID
records are immutable. Only the manifest is replaced, atomically, after an
attempt is durable. A file lock protects short registry/manifest updates; it is
never held while the producer runs. Failed/incomplete attempts remain history.

Candidate evidence refs MUST identify immutable source scenes/segments, e.g.
``captions:original-segment-42:123.4`` or a creator comment ID plus venue block.
Do not use corrected quotes, mutable names, list indexes, Google IDs, or a hash
of corrected text. The exact unordered anchor set reuses an ID; changed sets
get a new ID with overlap recorded for coordinator review, never a name remap.
"""

import hashlib
import functools
import inspect
import json
import os
import re
import tempfile
import uuid
import types
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import fcntl


SCHEMA_VERSION = 1
STATUSES = {"complete", "partial", "blocked", "failed"}
STAGE_PATTERN = r"[A-Za-z0-9][A-Za-z0-9_.-]*"


def _json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def _sha(value):
    return hashlib.sha256(value).hexdigest()


def _code_signature(code):
    """marshal encodings depend on interning/reference state, not just code."""
    def constant(value):
        if isinstance(value, types.CodeType):
            return _code_signature(value)
        if isinstance(value, (tuple, frozenset)):
            values = [constant(item) for item in value]
            return {type(value).__name__: sorted(values, key=repr) if isinstance(value, frozenset) else values}
        return {"type": type(value).__name__, "value": repr(value)}
    return {"bytecode": code.co_code.hex(), "constants": [constant(c) for c in code.co_consts],
            "names": code.co_names, "varnames": code.co_varnames,
            "freevars": code.co_freevars, "cellvars": code.co_cellvars,
            "args": [code.co_argcount, code.co_posonlyargcount, code.co_kwonlyargcount],
            "flags": code.co_flags}


def _now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json(path):
    return json.loads(path.read_bytes())


def _valid_descriptor(value):
    if not isinstance(value, dict):
        return False
    for key in ("sha256", "resultSha256", "fingerprint"):
        if not isinstance(value.get(key), str) or not re.fullmatch(r"[0-9a-f]{64}", value[key]):
            return False
    stage = value.get("stage")
    attempt_id = value.get("attemptId")
    if (not isinstance(stage, str) or not re.fullmatch(STAGE_PATTERN, stage)
            or not isinstance(value.get("status"), str)
            or value["status"] not in STATUSES or not isinstance(attempt_id, str)):
        return False
    try:
        if str(uuid.UUID(attempt_id)) != attempt_id:
            return False
    except ValueError:
        return False
    return value.get("path") == f"attempts/{stage}/{attempt_id}.json"


def _atomic_write(path, value, *, replace=False):
    """Publish a complete file; immutable destinations must not already exist."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".write-", dir=path.parent)
    temporary = Path(temporary)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            os.link(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


class StageStore:
    def __init__(self, workspace, content_id):
        if not isinstance(content_id, str) or not content_id.strip():
            raise ValueError("content_id must be a nonempty string")
        self.root = Path(workspace).resolve() / "stage-store"
        self.root.mkdir(parents=True, exist_ok=True)
        self.content_id = content_id
        self.manifest_path = self.root / "manifest.json"
        with self._lock():
            identity_path = self.root / "run.json"
            if not identity_path.exists():
                identity = {"schemaVersion": SCHEMA_VERSION,
                            "runId": str(uuid.uuid4()), "contentId": content_id}
                _atomic_write(identity_path, _json_bytes(identity))
            identity = _read_json(identity_path)
            if (identity.get("schemaVersion") != SCHEMA_VERSION
                    or identity.get("contentId") != content_id):
                raise ValueError("StageStore run belongs to a different content/schema")
            self.run_id = str(uuid.UUID(identity["runId"]))
            self._manifest()

    @contextmanager
    def _lock(self):
        with (self.root / ".lock").open("a+b") as stream:
            fcntl.flock(stream, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)

    def _manifest(self):
        """Read fresh under the lock; a damaged index never loses attempts."""
        if self.manifest_path.exists():
            try:
                value = _read_json(self.manifest_path)
                if not isinstance(value, dict):
                    raise ValueError("manifest must be an object")
                if (value.get("contentId") != self.content_id
                        or value.get("runId") != self.run_id):
                    raise RuntimeError("StageStore manifest scope does not match run")
                if (value.get("schemaVersion") != SCHEMA_VERSION
                        or not isinstance(value.get("stages"), dict)
                        or not isinstance(value.get("history"), list)
                        or any(not _valid_descriptor(item) for item in value["history"])
                        or any(not _valid_descriptor(item) or item["stage"] != stage
                               or item["status"] != "complete"
                               for stage, item in value["stages"].items())):
                    raise ValueError("invalid manifest structure")
                return value
            except (ValueError, UnicodeDecodeError):
                archive = self.root / "corrupt" / f"manifest-{uuid.uuid4()}.json"
                _atomic_write(archive, self.manifest_path.read_bytes())
        value = {"schemaVersion": SCHEMA_VERSION, "runId": self.run_id,
                 "contentId": self.content_id, "stages": {}, "history": []}
        self._save_manifest(value)
        return value

    def _save_manifest(self, manifest):
        _atomic_write(self.manifest_path, _json_bytes(manifest), replace=True)

    def _request(self, stage, inputs, policies, producer):
        if not isinstance(stage, str) or not re.fullmatch(STAGE_PATTERN, stage):
            raise ValueError("stage must be a simple nonempty identifier")
        if not isinstance(inputs, dict) or any(not isinstance(key, str) for key in inputs):
            raise ValueError("inputs must be a JSON object with string keys")
        # Serialize before invoking the producer, rejecting non-JSON/NaN inputs.
        input_refs = [{"id": key, "sha256": _sha(_json_bytes(value))}
                      for key, value in sorted(inputs.items())]
        policy_refs = [{"path": str(path), "sha256": _sha(path.read_bytes())}
                       for path in sorted({Path(p).resolve() for p in policies})]
        code_paths = {Path(__file__).resolve()}
        target = producer
        while isinstance(target, functools.partial):
            target = target.func
        if not (inspect.isfunction(target) or inspect.ismethod(target)
                or inspect.isclass(target) or inspect.isbuiltin(target)):
            target = getattr(target, "__call__", target)
        try:
            source = inspect.getsourcefile(target)
        except TypeError:
            source = None
        if source and Path(source).is_file():
            code_paths.add(Path(source).resolve())
        code_refs = [{"path": str(path), "sha256": _sha(path.read_bytes())}
                     for path in sorted(code_paths)]
        code = getattr(target, "__code__", None)
        if code is None:
            code = getattr(getattr(target, "__call__", None), "__code__", None)
        if code is not None:
            code_refs.append({"id": "producer-code", "sha256": _sha(_json_bytes(_code_signature(code)))})
        request = {"schemaVersion": SCHEMA_VERSION, "contentId": self.content_id,
                   "stage": stage, "inputRefs": input_refs,
                   "policyRefs": policy_refs, "codeRefs": code_refs}
        return request, _sha(_json_bytes(request))

    def _cached(self, descriptor, request, fingerprint):
        try:
            if not isinstance(descriptor, dict) or descriptor.get("fingerprint") != fingerprint:
                return None
            relative = Path(descriptor["path"])
            expected_parent = self.root / "attempts" / request["stage"]
            path = (self.root / relative).resolve()
            if path.parent != expected_parent or path.suffix != ".json":
                return None
            raw = path.read_bytes()
            if _sha(raw) != descriptor["sha256"]:
                return None
            envelope = json.loads(raw)
            if any(envelope.get(key) != value for key, value in request.items()):
                return None
            if (envelope.get("runId") != self.run_id or envelope.get("status") != "complete"
                    or envelope.get("fingerprint") != fingerprint):
                return None
            result = envelope["result"]
            if not isinstance(result, dict):
                return None
            if _sha(_json_bytes(result)) != descriptor["resultSha256"]:
                return None
            return result
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            return None

    def run(self, stage, inputs, policies, producer, force=False):
        """Reuse a valid complete result, otherwise retain a new attempt.

        Producer exceptions are recorded and re-raised. A result may declare
        ``stageStatus`` complete/partial/blocked/failed (default complete); only a
        complete result promotes. Runtime inputs must be explicit: closed-over
        mutable configuration and dependency files are not guessed.
        """
        request, fingerprint = self._request(stage, inputs, policies, producer)
        with self._lock():
            manifest = self._manifest()
            if not force:
                cached = self._cached(manifest["stages"].get(stage), request, fingerprint)
                if cached is not None:
                    return cached
        attempt_id = str(uuid.uuid4())
        envelope = {**request, "runId": self.run_id, "attemptId": attempt_id,
                    "fingerprint": fingerprint, "startedAt": _now()}
        failure = None
        try:
            result = producer()
            if not isinstance(result, dict):
                raise ValueError("stage producer must return a JSON object")
            # Snapshot the result so caller mutation cannot alter persisted data.
            result = json.loads(_json_bytes(result))
            # Business/domain statuses are ordinary data, never phase state.
            status = result.get("stageStatus", "complete")
            if status not in STATUSES:
                raise ValueError(f"invalid local stage status: {status}")
            records = result.get("records", [])
            envelope.update(status=status, result=result, records=records,
                            issues=result.get("issues", []),
                            counts=result.get("counts", {"records": len(records)}),
                            nextAction=result.get("nextAction"))
        except Exception as error:
            failure = error
            result = None
            envelope.update(status="failed", result=None, records=[], counts={},
                            issues=[{"type": type(error).__name__, "message": str(error)}],
                            error={"type": type(error).__name__, "message": str(error)},
                            nextAction="retry failed stage with corrected inputs or access")
        envelope["finishedAt"] = _now()
        raw = _json_bytes(envelope)
        path = self.root / "attempts" / stage / f"{attempt_id}.json"
        _atomic_write(path, raw)
        descriptor = {"path": str(path.relative_to(self.root)), "sha256": _sha(raw),
                      "resultSha256": _sha(_json_bytes(result)), "status": envelope["status"],
                      "fingerprint": fingerprint, "attemptId": attempt_id, "stage": stage}
        with self._lock():
            manifest = self._manifest()
            manifest["history"].append(descriptor)
            if envelope["status"] == "complete":
                manifest["stages"][stage] = descriptor
            self._save_manifest(manifest)
        if failure is not None:
            raise failure
        return result

    def _registry(self):
        records = []
        for path in sorted((self.root / "candidate-registry").glob("*.json")):
            record = _read_json(path)
            checksum = record.pop("recordSha256", None)
            if (_sha(_json_bytes(record)) != checksum
                    or record.get("contentId") != self.content_id
                    or record.get("runId") != self.run_id
                    or record.get("candidateId") != path.stem):
                raise ValueError(f"corrupt candidate registry record: {path}")
            record["recordSha256"] = checksum
            records.append(record)
        return records

    def candidate_id(self, evidence_refs):
        """Return a persistent UUID for exactly these immutable visit anchors."""
        if (not isinstance(evidence_refs, list) or not evidence_refs
                or any(not isinstance(ref, str) or not ref.strip() for ref in evidence_refs)):
            raise ValueError("evidence_refs must be a nonempty list of immutable anchor strings")
        refs = sorted(set(evidence_refs))
        with self._lock():
            self._manifest()  # Reject a scope mismatch even on an existing instance.
            records = self._registry()
            for record in records:
                if record["evidenceRefs"] == refs:
                    return record["candidateId"]
            candidate_id = str(uuid.uuid4())
            related = [record["candidateId"] for record in records
                       if set(record["evidenceRefs"]).intersection(refs)]
            record = {"schemaVersion": SCHEMA_VERSION, "runId": self.run_id,
                      "contentId": self.content_id, "candidateId": candidate_id,
                      "evidenceRefs": refs, "relatedCandidateIds": related, "createdAt": _now()}
            record["recordSha256"] = _sha(_json_bytes(record))
            _atomic_write(self.root / "candidate-registry" / f"{candidate_id}.json", _json_bytes(record))
            return candidate_id

    def snapshot(self):
        """Return JSON for remote rawOutput retention/debug, without writing it.

        All durable attempts are included, even one left unindexed by a crash.
        Corrupt attempts are represented by an integrity error and file digest;
        a corrupt ID registry fails closed rather than assigning different IDs.
        """
        with self._lock():
            manifest = self._manifest()
            registry = self._registry()
            expected_hashes = {record["path"]: record["sha256"]
                               for record in manifest["history"]}
            expected_hashes.update({record["path"]: record["sha256"]
                                    for record in manifest["stages"].values()})
            attempts = []
            for path in sorted((self.root / "attempts").glob("*/*.json")):
                raw = path.read_bytes()
                item = {"path": str(path.relative_to(self.root)), "sha256": _sha(raw)}
                if item["path"] in expected_hashes and expected_hashes[item["path"]] != item["sha256"]:
                    item["error"] = "corrupt attempt: digest does not match manifest"
                try:
                    item["envelope"] = json.loads(raw)
                except (ValueError, UnicodeDecodeError) as error:
                    item["error"] = f"corrupt attempt: {error}"
                attempts.append(item)
            return {"schemaVersion": SCHEMA_VERSION, "runId": self.run_id,
                    "contentId": self.content_id, "manifest": manifest,
                    "attempts": attempts, "candidateRegistry": registry}
