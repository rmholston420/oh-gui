"""ADR-001 item 7: all upstream SDK surface is confined to one module.

Enforced by AST scan, not by convention. Mirrors `apps/gui/src/__tests__/import-boundary.test.ts`
on the frontend side.

Also asserts the scanner itself can fail (see `test_scanner_detects_a_planted_violation`) —
a boundary test that has never been seen to fail is not a test.
"""

from __future__ import annotations

import ast
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src" / "ohgui_middleware"
ACL = SRC / "upstream"

FORBIDDEN_PREFIXES = ("openhands",)


def _imported_roots(tree: ast.AST) -> set[str]:
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module:
                roots.add(node.module.split(".")[0])
    return roots


def _violations(root: Path, *, exempt: Path) -> list[tuple[Path, str]]:
    found: list[tuple[Path, str]] = []
    for path in sorted(root.rglob("*.py")):
        if exempt in path.parents or path == exempt:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for mod in sorted(_imported_roots(tree)):
            if mod.startswith(FORBIDDEN_PREFIXES):
                found.append((path.relative_to(root), mod))
    return found


def test_only_the_acl_imports_openhands() -> None:
    assert _violations(SRC, exempt=ACL) == []


def test_the_acl_package_actually_exists_and_is_the_exemption() -> None:
    # Guards against the exemption silently covering everything if the path is wrong.
    assert ACL.is_dir()
    assert (ACL / "sdk.py").is_file()


def test_scanner_detects_a_planted_violation(tmp_path: Path) -> None:
    """Mutation check: the scanner must be able to fail."""
    pkg = tmp_path / "pkg"
    (pkg / "upstream").mkdir(parents=True)
    (pkg / "upstream" / "sdk.py").write_text("import openhands.sdk\n")
    (pkg / "leaky.py").write_text("from openhands.sdk import Conversation\n")
    (pkg / "clean.py").write_text("import json\n")

    found = _violations(pkg, exempt=pkg / "upstream")
    assert found == [(Path("leaky.py"), "openhands")]


def test_scanner_ignores_relative_imports(tmp_path: Path) -> None:
    pkg = tmp_path / "pkg"
    (pkg / "upstream").mkdir(parents=True)
    (pkg / "a.py").write_text("from .upstream import sdk\nfrom . import config\n")
    assert _violations(pkg, exempt=pkg / "upstream") == []
