"""The `AuthorizeRequest` provisional marker is an interlock, not a comment (ADR-021).

`AuthorizeRequest` was originally written from the SDK's *documented* `pre_tool_use` envelope.
ADR-015 exists because documentation is not verification, and that mirror turned out to have
four of eight fields wrong — confirmed on 2026-08-08 by extracting the model from the pinned
image and running it.

The marker has now been cleared, so these tests change job. They no longer guard "do not wire
a hook yet"; they guard the *clearing*: the flag may only be False while evidence exists on
disk and still agrees with the model. A marker that can be cleared by editing one boolean is
not an interlock, and un-clearing it silently is exactly how a verified type drifts back into
an assumed one.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from ohgui_middleware.ipc import schema

REPO_ROOT = Path(__file__).resolve().parents[3]
MW_SRC = REPO_ROOT / "services" / "middleware" / "src" / "ohgui_middleware"
EVIDENCE = REPO_ROOT / "docs" / "evidence" / "hook-envelope" / "envelope.json"

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
    assert "Native basis" in doc, "ADR-021 requires the native basis line, even when it is empty"
    if schema.AUTHORIZE_REQUEST_PROVISIONAL:
        assert "ADR-014" in doc, "the marker must name the gate that clears it"


def test_cleared_marker_is_backed_by_evidence_on_disk():
    """Clearing the flag requires a captured envelope, not a confident edit."""
    if schema.AUTHORIZE_REQUEST_PROVISIONAL:
        return  # still provisional; nothing to back up
    assert EVIDENCE.exists(), (
        f"AUTHORIZE_REQUEST_PROVISIONAL is False but {EVIDENCE.relative_to(REPO_ROOT)} is "
        "missing. Regenerate it with scripts/capture-hook-envelope.sh, or set the flag back."
    )
    assert "Native basis: `openhands.sdk.hooks.types.HookEvent`" in (
        schema.AuthorizeRequest.__doc__ or ""
    ), "ADR-021 requires the cleared marker to name the artifact it rests on"


def test_declared_fields_still_match_the_captured_envelope():
    """The whole point of the capture: drift between us and the image must fail a test.

    Compares against the recorded envelope rather than against the image, so it runs offline
    and in CI-less local verification. Re-running the capture is what refreshes the evidence;
    this only asserts we have not drifted from it.
    """
    if not EVIDENCE.exists():
        return
    upstream = json.loads(EVIDENCE.read_text(encoding="utf-8"))["fields"]
    ours = schema.AuthorizeRequest.model_fields

    missing = sorted(set(upstream) - set(ours))
    assert not missing, f"the image sends fields we do not declare: {missing}"

    wrong: list[str] = []
    for name, spec in upstream.items():
        ann = str(ours[name].annotation)
        nullable_ours = "None" in ann or "Optional" in ann
        # Optional is not nullable. A field with a default still rejects an explicit null,
        # and the image sends explicit nulls, so only the annotation counts here.
        if spec["nullable"] and not nullable_ours:
            wrong.append(f"{name}: image allows null, ours is {ann}")
        if spec["required"] and not ours[name].is_required():
            wrong.append(f"{name}: image requires it, ours is optional")
    assert not wrong, "AuthorizeRequest has drifted from the captured envelope: " + "; ".join(wrong)


def test_decision_is_not_marked():
    """`Decision` is OH-GUI's own contract (ADR-021 class 3) and needs no upstream basis.

    Present so that a future blanket 'mark everything provisional' would fail here rather
    than quietly making the marker meaningless by making it universal.
    """
    assert "PROVISIONAL" not in (schema.Decision.__doc__ or "")
