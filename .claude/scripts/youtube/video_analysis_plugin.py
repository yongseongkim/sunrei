"""Locate the installed video-analysis skill used by Sunrei's collectors."""

import json
import os
import subprocess
import sys
from functools import lru_cache
from pathlib import Path


MARKETPLACE = "yongseong-plugins"
PLUGIN_ID = f"video-analysis@{MARKETPLACE}"
PLUGIN_ENV = "SUNREI_VIDEO_ANALYSIS_PLUGIN"
SETUP = (
    f"Install with 'codex plugin marketplace add yongseongkim/agent-plugins' and "
    f"'codex plugin add {PLUGIN_ID}', or set {PLUGIN_ENV} to the installed plugin root."
)


@lru_cache(maxsize=1)
def skill_directory():
    override = os.environ.get(PLUGIN_ENV)
    if override:
        root = Path(override).expanduser()
    else:
        try:
            result = subprocess.run(
                ["codex", "plugin", "list", "--marketplace", MARKETPLACE, "--json"],
                check=True, capture_output=True, text=True, timeout=30,
            )
            installed = json.loads(result.stdout)["installed"]
        except (OSError, subprocess.SubprocessError, ValueError, KeyError) as error:
            raise RuntimeError(f"Cannot read installed Codex plugins. {SETUP}") from error
        entry = next((item for item in installed if item.get("pluginId") == PLUGIN_ID
                      and item.get("installed") and item.get("enabled")), None)
        if entry is None:
            raise RuntimeError(f"{PLUGIN_ID} is missing or disabled. {SETUP}")
        if entry.get("installedPath"):
            root = Path(entry["installedPath"])
        else:
            home = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex").expanduser()
            root = home / "plugins/cache" / MARKETPLACE / "video-analysis" / entry["version"]

    root = root.resolve()
    skill = root / "skills/video-analysis"
    try:
        manifest = json.loads((root / "plugin.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise RuntimeError(f"Cannot read plugin.json at {root}. {SETUP}") from error
    if (manifest.get("name") != "video-analysis" or not (skill / "SKILL.md").is_file()
            or not (skill / "scripts/video_evidence.py").is_file()):
        raise RuntimeError(f"No complete video-analysis plugin at {root}. {SETUP}")
    return skill


if __name__ == "__main__":
    try:
        print(skill_directory())
    except RuntimeError as error:
        sys.exit(str(error))
