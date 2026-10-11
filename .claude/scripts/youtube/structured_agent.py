"""Run a structured-output agent turn, falling back across providers.

``STRUCTURED_AGENTS`` lists the providers to try in order (default
``codex,claude``). A provider failure, such as a subscription usage limit, moves
on to the next provider. The returned object carries the provider name in
``agent``.
"""

import os
import sys

import claude_headless
import codex_headless

PROVIDERS = {
    "codex": codex_headless.run_structured,
    "claude": claude_headless.run_structured,
}


def providers():
    names = [
        name.strip()
        for name in os.environ.get("STRUCTURED_AGENTS", "codex,claude").split(",")
        if name.strip()
    ]
    unknown = [name for name in names if name not in PROVIDERS]
    if unknown or not names:
        raise ValueError(f"STRUCTURED_AGENTS must list {', '.join(PROVIDERS)}: {unknown or names}")
    return names


def run_structured(prompt, schema_file, model=None, timeout=900, temp_prefix="sunrei-agent-"):
    """Return the first provider's JSON object; ``model`` applies to the first provider only."""
    errors = []
    for index, name in enumerate(providers()):
        try:
            value = PROVIDERS[name](
                prompt,
                schema_file,
                model=model if index == 0 else None,
                timeout=timeout,
                temp_prefix=temp_prefix,
            )
        except RuntimeError as error:
            print(f"{name} failed, trying the next agent: {error}", file=sys.stderr, flush=True)
            errors.append(f"{name}: {error}")
            continue
        value["agent"] = name
        return value
    raise RuntimeError("every structured agent failed: " + " | ".join(errors))
