#!/usr/bin/env python3
"""Extract the native field set of every tool Action from the pinned agent-server image.

Why this exists
---------------
Blast radius is DERIVED under ADR-015: a per-tool projection over native fields of the concrete
`Action` subtype carried by `ActionEvent.action`. Condition (a) requires every input to be a
*named native field, individually verified per clause 1* — verified in the shipped artifact, with
path and line, not read out of documentation.

`openhands.tools` is a separate distribution (`openhands-tools`) from `openhands-sdk`, and neither
the SDK sdist nor the spec tells us what fields `ExecuteBashAction` or `FileEditorAction` actually
carry. So this does what `verify_trust_dial.py` does, one package over:

1. Read each `openhands.tools.*.definition` module out of the image's PyInstaller PYZ.
2. Diff it structurally against the same module compiled from the pinned `openhands-tools` sdist,
   establishing the sdist as a verified stand-in for what the image runs.
3. Execute the *image's own* code objects to enumerate every `Action` subclass and its pydantic
   field names, types, defaults and descriptions.
4. Emit the result as evidence.

Step 3 matters: the field list is read off the constructed pydantic model, not parsed out of the
source text. Inherited fields, aliases and validators are therefore included as the runtime sees
them, which is the thing a projection actually reads.

Stubs (a documented reduction in strictness, same as verify_trust_dial.py)
--------------------------------------------------------------------------
Executing these modules for real would pull in the whole tool runtime. Instead the SDK's own
`Action`/`Schema` base classes are imported from the *pinned SDK sdist* (already verified against
this image by verify_trust_dial.py and capture-hook-envelope.sh), and heavy leaves — the executor
implementations, `rich`, browser drivers — are stubbed inert. Logic living in a stubbed dependency
is not covered. Anything that fails to execute is reported as `unavailable`, never omitted:
an absent tool and an uncomputed tool must not look alike, which is the same rule condition (c)
applies to the values themselves.
"""

from __future__ import annotations

import argparse
import json
import sys
import types
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_bytecode import diff_code  # noqa: E402
from extract_image_sdk import (  # noqa: E402
    compile_reference,
    pyz_modules,
    read_carchive_pyz,
    shipped_code,
)

GREEN, YELLOW, RED, RESET = "\033[32m", "\033[33m", "\033[31m", "\033[0m"


def ok(msg: str) -> None:
    print(f"{GREEN}ok{RESET}   {msg}")


def warn(msg: str) -> None:
    print(f"{YELLOW}WARN{RESET} {msg}")


def fail(msg: str) -> None:
    print(f"{RED}FAIL{RESET} {msg}")


def _inert(name: str) -> types.ModuleType:
    """A module whose every attribute is a permissive no-op class."""
    mod = types.ModuleType(name)

    class _Any:
        def __init__(self, *a: Any, **k: Any) -> None: ...
        def __call__(self, *a: Any, **k: Any) -> Any:
            return self
        def __getattr__(self, item: str) -> Any:
            return _Any()

    mod.__getattr__ = lambda item: _Any()  # type: ignore[attr-defined]
    return mod


def install_stubs(sdk_root: Path) -> None:
    """Make the real SDK importable, stub the rest."""
    sys.path.insert(0, str(sdk_root))
    for name in (
        "openhands.tools.utils",
        "browser_use",
        "playwright",
        "playwright.async_api",
        "html2text",
    ):
        sys.modules.setdefault(name, _inert(name))


def field_rows(model: Any) -> list[dict[str, Any]]:
    rows = []
    for fname, f in model.model_fields.items():
        ann = f.annotation
        rows.append(
            {
                "name": fname,
                "type": getattr(ann, "__name__", None) or str(ann).replace("typing.", ""),
                "required": f.is_required(),
                "default": None if f.is_required() else repr(f.default),
                "description": f.description,
            }
        )
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--binary", required=True, type=Path)
    ap.add_argument("--tools-source-root", required=True, type=Path)
    ap.add_argument("--sdk-source-root", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    pyz = read_carchive_pyz(args.binary)
    toc = pyz_modules(pyz)

    definitions = sorted(
        m for m in toc if m.startswith("openhands.tools.") and m.endswith(".definition")
    )
    if not definitions:
        fail("no openhands.tools.*.definition modules in the image")
        return 1
    ok(f"{len(definitions)} tool definition modules in the image")

    verified: list[str] = []
    mismatched: list[str] = []
    for name in definitions:
        rel = Path(*name.split(".")) .with_suffix(".py")
        src = args.tools_source_root / rel
        if not src.exists():
            mismatched.append(f"{name}: not present in the pinned sdist ({rel})")
            continue
        shipped = shipped_code(pyz, toc, name)
        reference = compile_reference(src.read_text(), name)
        d = diff_code(shipped, reference)
        if d:
            mismatched.append(f"{name}: {d[0]}")
        else:
            verified.append(name)

    for m in mismatched:
        fail(m)
    ok(f"{len(verified)}/{len(definitions)} definition modules match the pinned sdist")
    if mismatched:
        fail("refusing to derive a field set from code that does not match the pin")
        return 1

    install_stubs(args.sdk_source_root)
    from openhands.sdk.tool.schema import Action  # noqa: PLC0415

    actions: dict[str, Any] = {}
    unavailable: dict[str, str] = {}
    for name in verified:
        ns: dict[str, Any] = {"__name__": name, "__file__": f"<image>/{name}"}
        try:
            exec(shipped_code(pyz, toc, name), ns)  # noqa: S102
        except Exception as exc:  # noqa: BLE001
            unavailable[name] = f"{type(exc).__name__}: {exc}"
            continue
        for attr, obj in ns.items():
            if (
                isinstance(obj, type)
                and issubclass(obj, Action)
                and obj is not Action
                and obj.__name__ not in actions
            ):
                actions[obj.__name__] = {
                    "module": name,
                    "class": obj.__name__,
                    "fields": field_rows(obj),
                }

    for name, why in unavailable.items():
        warn(f"{name}: could not execute — {why}")

    ok(f"{len(actions)} Action subclasses enumerated")

    payload = {
        "source": (
            "openhands.tools.*.definition, read from the pinned agent-server image's PyInstaller "
            "PYZ and verified byte-structure-equal to the pinned openhands-tools sdist"
        ),
        "caveat": (
            "Field sets are read off the constructed pydantic models. Executor implementations, "
            "rich, and browser drivers were stubbed inert; logic living in a stubbed dependency "
            "is not covered. Modules that failed to execute are listed under `unavailable` and "
            "are NOT absent-by-omission."
        ),
        "definition_modules_verified": verified,
        "unavailable": unavailable,
        "actions": dict(sorted(actions.items())),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n")
    ok(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
