"""Run Claude Code headlessly with structured output and no ingest credentials.

Authentication uses the subscription token from ``claude setup-token`` in
``CLAUDE_CODE_OAUTH_TOKEN``. ``ANTHROPIC_API_KEY`` is removed so a stray API key
never switches the run to pay-per-token billing.
"""

import json
import os
import subprocess
import tempfile
from pathlib import Path

from codex_headless import SECRET_ENV_NAMES, SECRET_ENV_PREFIXES, read_json

KEEP_ENV_NAMES = {"CLAUDE_CODE_OAUTH_TOKEN"}


def claude_environment():
    """Keep the Claude subscription token while removing ingest and API credentials."""
    return {
        name: value
        for name, value in os.environ.items()
        if name in KEEP_ENV_NAMES
        or not (name in SECRET_ENV_NAMES or name.startswith(SECRET_ENV_PREFIXES))
    }


def run_structured(prompt, schema_file, model=None, timeout=900, temp_prefix="sunrei-claude-"):
    """Return the JSON object from an isolated, tool-less ``claude -p`` invocation."""
    schema_file = Path(schema_file).resolve()
    if not schema_file.is_file():
        raise FileNotFoundError(schema_file)
    schema = read_json(schema_file)
    # Claude validates schemas as draft-07, which rejects the 2020-12 `$schema` declaration.
    schema.pop("$schema", None)
    schema = json.dumps(schema, separators=(",", ":"))

    with tempfile.TemporaryDirectory(prefix=temp_prefix) as temp_dir:
        command = [
            "claude",
            "-p",
            "--output-format",
            "json",
            "--json-schema",
            schema,
            "--tools",
            "",
            "--strict-mcp-config",
            "--setting-sources",
            "",
            "--no-session-persistence",
        ]
        if model:
            command.extend(["--model", model])
        try:
            result = subprocess.run(
                command,
                input=prompt,
                text=True,
                capture_output=True,
                cwd=temp_dir,
                env=claude_environment(),
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"claude timed out after {timeout}s") from None

    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        details = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"claude failed ({result.returncode}): {details[-2000:]}") from None
    if result.returncode != 0 or output.get("is_error"):
        raise RuntimeError(f"claude failed ({output.get('subtype')}): {str(output.get('result'))[-2000:]}")
    value = output.get("structured_output")
    if not isinstance(value, dict):
        raise RuntimeError("claude returned no structured output")
    return value
