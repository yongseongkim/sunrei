"""Run Codex headlessly with structured output and no ingest credentials."""

import json
import os
import subprocess
import tempfile
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


def sanitized_environment():
    """Keep Codex login state while removing ingest and deployment credentials."""
    return {
        name: value
        for name, value in os.environ.items()
        if name not in SECRET_ENV_NAMES and not name.startswith(SECRET_ENV_PREFIXES)
    }


def read_json(path):
    with Path(path).open(encoding="utf-8") as file:
        return json.load(file)


def run_structured(prompt, schema_file, model=None, timeout=900, temp_prefix="sunrei-codex-"):
    """Return the JSON object from an isolated ``codex exec`` invocation."""
    schema_file = Path(schema_file).resolve()
    if not schema_file.is_file():
        raise FileNotFoundError(schema_file)

    with tempfile.TemporaryDirectory(prefix=temp_prefix) as temp_dir:
        output = Path(temp_dir) / "result.json"
        command = [
            "codex",
            "exec",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--output-schema",
            str(schema_file),
            "--output-last-message",
            str(output),
            "--color",
            "never",
            "-C",
            temp_dir,
        ]
        if model:
            command.extend(["--model", model])
        command.append("-")
        result = subprocess.run(
            command,
            input=prompt,
            text=True,
            capture_output=True,
            env=sanitized_environment(),
            timeout=timeout,
        )
        if result.returncode != 0:
            details = result.stderr.strip() or result.stdout.strip()
            raise RuntimeError(f"codex exec failed ({result.returncode}): {details[-2000:]}")
        if not output.is_file():
            raise RuntimeError("codex exec did not write its final response")
        value = read_json(output)
        if not isinstance(value, dict):
            raise RuntimeError("codex exec returned a non-object JSON value")
        return value
