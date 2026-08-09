"""The `AuthorizeRequest` provisional marker is an interlock, not a comment (ADR-021).

`AuthorizeRequest` mirrors the SDK's *documented* `pre_tool_use` envelope. ADR-015 exists
because documentation is not verification, and on this project a hand-written mirror already
shipped one wrong decision (DEBUG_LOG 2026-08-08 20:05 EDT). A hook wired to a wrong field
shape fails in the dangerous direction: the middleware reads `tool_name` as absent, judges an
empty call, and the operator sees a gate that looks installed.

So the marker has to be load-bearing. These tests tie it to the condition it stands for —
that no hook is installed — and to the artefact that will clear it, ADR-014 verification
item 5. Deleting the marker without capturing a real envelope breaks a test, which is the
only reason a marker in a docstring ever survives a refactor.
"""

from __future__ import annotations

import re
from pathlib import Path

from ohgui_middleware.ipc import schema

REPO_ROOT = Path(__file__).resolve().parents[3]
MW_SRC = REPO_ROOT / "services" / "middleware" / "src" / "ohgui_middleware"

_HOOK_INSTALL = re.compile(r"\b(install_hook|add_hook|register_hook|HookType\.COMMAND|hooks\s*=)")


def test_marker_flag_and_docstring_agree():
    """Two representations of one fact must not be able to drift apart."""
    doc = schema.AuthorizeRequest.__doc__ or ""
    marked = "PROVISIONAL" in doc
    assert marked == schema.AUTHORIZE_REQUEST_PROVISIONAL, (
        "AUTHORIZE_REQUEST_PROVISIONAL disagrees with the AuthorizeRequest docstring; "
        "one of them was changed without the other"
    )


def test_no_hook_is_installed_while_the_type_is_provisional():
    """The interlock itself. This is what the marker actually forbids."""
    if not schema.AUTHORIZE_REQUEST_PROVISIONAL:
        return  # the marker has been cleared; the interlock no longer applies
    offenders = [
        f"{path.relative_to(REPO_ROOT)}:{lineno}"
        for path in sorted(MW_SRC.rglob("*.py"))
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if _HOOK_INSTALL.search(line) and not line.lstrip().startswith("#")
    ]
    assert offenders == [], (
        "a hook is installed while AuthorizeRequest is PROVISIONAL — UNVERIFIED: "
        f"{offenders}. Clear ADR-014 verification gate item 5 first: capture the real "
        "pre_tool_use envelope against the pinned agent-server container and diff it."
    )


def test_the_marker_names_what_would_clear_it():
    """A marker with no exit condition becomes permanent furniture."""
    doc = schema.AuthorizeRequest.__doc__ or ""
    assert "ADR-014" in doc, "the marker must name the gate that clears it"
    assert "Native basis" in doc, "ADR-021 requires the native basis line, even when it is empty"


def test_decision_is_not_marked():
    """`Decision` is OH-GUI's own contract (ADR-021 class 3) and needs no upstream basis.

    Present so that a future blanket 'mark everything provisional' would fail here rather
    than quietly making the marker meaningless by making it universal.
    """
    assert "PROVISIONAL" not in (schema.Decision.__doc__ or "")
