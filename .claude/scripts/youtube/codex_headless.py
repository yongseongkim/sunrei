"""Run Codex headlessly with structured output and no ingest credentials."""

import json
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from contextlib import contextmanager
from pathlib import Path

SECRET_ENV_NAMES = {
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "CODEX_API_KEY",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GOOGLE_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_MAPS_API_KEY",
    "KUBECONFIG",
    "OPENAI_API_KEY",
    "SUNREI_ADMIN_TOKEN",
    "YOUTUBE_API_KEY",
}
SECRET_ENV_PREFIXES = (
    "AWS_",
    "GOOGLE_",
    "SOPS_",
    "SUNREI_",
    "YOUTUBE_",
)


def read_json(path):
    with Path(path).open(encoding="utf-8") as file:
        return json.load(file)


@contextmanager
def scrubbed_environment():
    """Hide ingest credentials from os.environ while the Codex runtime starts.

    The SDK copies os.environ into the runtime process and can only add variables,
    so secrets are removed for the duration of the launch and restored afterward.
    """
    removed = {
        name: os.environ.pop(name)
        for name in list(os.environ)
        if name in SECRET_ENV_NAMES or name.startswith(SECRET_ENV_PREFIXES)
    }
    try:
        yield
    finally:
        os.environ.update(removed)


def parse_final_response(text):
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    value = json.loads(text)
    if not isinstance(value, dict):
        raise RuntimeError("codex returned a non-object JSON value")
    return value


def run_structured(prompt, schema_file, model=None, timeout=900, temp_prefix="sunrei-codex-"):
    """Return the JSON object from an isolated, read-only Codex SDK turn."""
    from openai_codex import ApprovalMode, Codex, CodexConfig, Sandbox

    schema_file = Path(schema_file).resolve()
    if not schema_file.is_file():
        raise FileNotFoundError(schema_file)
    schema = read_json(schema_file)

    with tempfile.TemporaryDirectory(prefix=temp_prefix) as temp_dir:
        # MCP servers from a developer's config.toml must not load in an extraction thread.
        config = CodexConfig(cwd=temp_dir, config_overrides=("mcp_servers={}",))
        with scrubbed_environment():
            codex = Codex(config)
        with codex:
            thread = codex.thread_start(
                approval_mode=ApprovalMode.deny_all,
                cwd=temp_dir,
                ephemeral=True,
                model=model,
                sandbox=Sandbox.read_only,
            )
            turn = thread.turn(prompt, output_schema=schema)
            # The SDK has no turn timeout. On timeout, interrupt; leaving `with` stops the runtime.
            pool = ThreadPoolExecutor(max_workers=1)
            try:
                result = pool.submit(turn.run).result(timeout=timeout)
            except FutureTimeout:
                try:
                    turn.interrupt()
                except Exception:  # noqa: BLE001
                    pass
                raise RuntimeError(f"codex turn timed out after {timeout}s") from None
            finally:
                pool.shutdown(wait=False)
    try:
        return parse_final_response(result.final_response)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"codex returned invalid JSON: {error}") from None
