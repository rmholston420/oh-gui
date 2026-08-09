#!/usr/bin/env python3
"""Diff `AuthorizeRequest` against a captured `pre_tool_use` envelope, field by field.

ADR-014 verification gate item 5. The comparison is deliberately two-directional, because the
two directions fail differently and only one of them is obvious:

- **A field upstream sends that we do not declare** is survivable — `extra="allow"` preserves it
  — but it means we are not reading something the operator might need to judge on.
- **A field we require that upstream may omit or null** is the dangerous one. Pydantic raises,
  the middleware returns 422, and every tool call errors at the edge. A gate that errors on
  every call is not a strict gate; it is an outage that looks like one, and the pressure to
  "just make it work" points straight at removing the gate.

Exit 1 on any mismatch. Prints a diff, not a verdict, so the reader can judge each one.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCHEMA = REPO / "services" / "middleware" / "src" / "ohgui_middleware" / "ipc" / "schema.py"

G, Y, R, X = "\033[0;32m", "\033[0;33m", "\033[0;31m", "\033[0m"


def declared_fields() -> dict[str, str]:
    """Parse `AuthorizeRequest`'s annotations without importing pydantic or the package.

    Textual on purpose: this script has to run from a bare shell during verification, before
    the middleware venv is necessarily built, and importing the module under test to check the
    module under test is a shorter loop than it looks.
    """
    src = SCHEMA.read_text(encoding="utf-8")
    body = src.split("class AuthorizeRequest", 1)[1].split("\nclass ", 1)[0]
    out: dict[str, str] = {}
    for line in body.splitlines():
        m = re.match(r"\s{4}([a-z_][a-z0-9_]*)\s*:\s*(.+?)\s*(?:=\s*(.+))?$", line)
        if m and not line.lstrip().startswith("#"):
            name, ann, default = m.group(1), m.group(2), m.group(3)
            if name == "model_config":
                continue
            required = default is None
            out[name] = f"{ann}{'' if required else '  (optional)'}"
    return out


def main() -> int:
    """Compare against the envelope produced by `extract_image_sdk.py`.

    Upstream nullability is read from the envelope's `fields` map, which was produced by
    *executing* the image's own `HookEvent`. An earlier version re-derived it here with a
    regex over the SDK source, which meant two independent readings of the same fact and
    two chances to be wrong. One source of truth, and it is the one that ran.
    """
    envelope = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    upstream = envelope["fields"]
    declared = declared_fields()

    print("  --- AuthorizeRequest vs the pinned image ------------------------------")
    bad = 0

    for field, spec in upstream.items():
        if field not in declared:
            print(f"  {Y}MISSING{X}  upstream sends `{field}`; AuthorizeRequest does not declare it")
            print("           survivable (extra=allow preserves it) but unread")
            bad += 1
            continue
        ann = declared[field]
        nullable_up = spec["nullable"]
        # Optional is not nullable, and conflating them hides the exact bug this script
        # is for. `tool_input: dict[str, Any] = Field(default_factory=dict)` is optional
        # — pydantic fills it when the key is absent — and still rejects an explicit
        # `null`, which is what the image actually sends. Only the annotation counts.
        nullable_ours = "None" in ann.split("(optional)")[0]
        if nullable_up and not nullable_ours:
            why = (
                "we require it"
                if "(optional)" not in ann
                else "we default it but reject an explicit null"
            )
            print(f"  {R}NULL{X}     `{field}`: image allows null, {why}")
            print("           a null here raises ValidationError -> 422 on every call")
            bad += 1
        else:
            print(f"  {G}ok{X}       `{field}`: {ann}")

    for field in declared:
        if field not in upstream:
            print(f"  {Y}EXTRA{X}    we declare `{field}`; not present in the captured envelope")
            bad += 1

    print("  -----------------------------------------------------------------------")
    print(f"  {bad} mismatch(es)" if bad else f"  {G}field-for-field match{X}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
