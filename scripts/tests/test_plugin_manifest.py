"""The `oh-gui` plugin must stay loadable by the OpenHands SDK that will load it.

The SDK is not importable in this repo's test environment, so these are static checks written
against the pinned SDK source under `review/_sdk_src/`, not against a guess. Every constant below
is read back out of that source rather than restated, so a version bump that renames a key fails
here instead of silently dropping the value.

This exists because `argument_hint` was written where the loader reads `argument-hint`. Nothing
raised: the key was ignored and the hint vanished. A frontmatter key the loader does not read is
indistinguishable from a typo, and neither is visible without a gate.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PLUGIN = REPO_ROOT / ".agents" / "plugins" / "oh-gui"
SDK = REPO_ROOT / "review" / "_sdk_src" / "1.41.0" / "openhands_sdk-1.41.0" / "openhands" / "sdk"


def _sdk_text(rel: str) -> str:
    path = SDK / rel
    if not path.is_file():
        pytest.skip(f"pinned SDK source not present: {rel}")
    return path.read_text(encoding="utf-8")


def test_the_manifest_sits_where_the_loader_looks() -> None:
    """`PLUGIN_MANIFEST_DIRS`, not the `.agents/plugin.json` in the class docstring."""
    dirs = re.search(r"PLUGIN_MANIFEST_DIRS = \[(.*?)\]", _sdk_text("plugin/plugin.py"))
    assert dirs is not None
    candidates = re.findall(r'"([^"]+)"', dirs.group(1))
    assert any((PLUGIN / d / "plugin.json").is_file() for d in candidates), candidates


def test_manifest_keys_are_all_read_by_the_manifest_model() -> None:
    fields = set(re.findall(r"^    (\w+): ", _sdk_text("plugin/types.py"), re.MULTILINE))
    manifest = json.loads((PLUGIN / ".plugin" / "plugin.json").read_text(encoding="utf-8"))
    unread = set(manifest) - fields
    assert not unread, f"manifest keys no model field reads: {sorted(unread)}"


def test_command_frontmatter_keys_are_all_read_by_the_loader() -> None:
    """`CommandDefinition.load` reads hyphenated keys. An underscore silently vanishes."""
    loader = _sdk_text("plugin/types.py")
    body = loader[loader.index("def load(cls, command_path"):]
    read = set(re.findall(r'fm\.get\(\s*"([^"]+)"', body))
    assert "description" in read and "argument-hint" in read, read

    offenders: list[str] = []
    for command in sorted((PLUGIN / "commands").glob("*.md")):
        text = command.read_text(encoding="utf-8")
        assert text.startswith("---\n"), f"{command.name} has no frontmatter"
        block = text.split("---\n", 2)[1]
        keys = {line.split(":", 1)[0].strip() for line in block.splitlines() if ":" in line}
        for key in sorted(keys - read):
            offenders.append(f"{command.name}: {key!r} is never read (did you mean a hyphen?)")
    assert not offenders, offenders


def test_every_skill_directory_carries_a_skill_file() -> None:
    empty = [
        d.name
        for d in sorted((PLUGIN / "skills").iterdir())
        if d.is_dir() and not (d / "SKILL.md").is_file()
    ]
    assert not empty, empty


def test_skills_are_not_discovered_twice() -> None:
    """A skill in `.agents/skills/` *and* in a plugin's `skills/` is loaded by both paths."""
    assert not (REPO_ROOT / ".agents" / "skills").exists()
