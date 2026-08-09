#!/usr/bin/env python3
"""Compare a code object shipped inside the pinned image against source, structurally.

Why not `marshal.dumps(a) == marshal.dumps(b)`: marshal writes back-references for interned
objects, so two semantically identical code objects can serialize to different bytes depending
on the order objects were first seen. Using it as an equality test produced a **false negative**
on four of five hook modules here — it reported the image had diverged from upstream source
when the only difference was the memory address inside a `repr`. That is precisely the kind of
false alarm that gets a check switched off, so the check compares the fields that carry meaning
and ignores the ones that carry identity.

Deliberately compared:  co_code, co_consts (recursively), co_names, co_varnames, co_freevars,
                        co_cellvars, co_argcount, co_kwonlyargcount, co_flags, co_name
Deliberately ignored:   object addresses, co_filename, co_firstlineno, line tables

Ignoring line numbers is a real reduction in strictness and is stated rather than hidden: two
files differing only in blank lines would compare equal. Behaviour would not differ, which is
what this check is for.
"""

from __future__ import annotations

import sys
from types import CodeType

FIELDS = (
    "co_argcount",
    "co_posonlyargcount",
    "co_kwonlyargcount",
    "co_nlocals",
    "co_flags",
    "co_code",
    "co_names",
    "co_varnames",
    "co_freevars",
    "co_cellvars",
    "co_name",
)


def diff_code(a: CodeType, b: CodeType, path: str = "<module>") -> list[str]:
    out: list[str] = []
    for f in FIELDS:
        va, vb = getattr(a, f), getattr(b, f)
        if va != vb:
            out.append(f"{path}.{f}: {va!r} != {vb!r}")
    ca = [c for c in a.co_consts]
    cb = [c for c in b.co_consts]
    if len(ca) != len(cb):
        out.append(f"{path}.co_consts: length {len(ca)} != {len(cb)}")
        return out
    for i, (x, y) in enumerate(zip(ca, cb, strict=True)):
        if isinstance(x, CodeType) and isinstance(y, CodeType):
            out += diff_code(x, y, f"{path}.{x.co_name}")
        elif isinstance(x, CodeType) != isinstance(y, CodeType):
            out.append(f"{path}.co_consts[{i}]: code-vs-non-code mismatch")
        elif x != y:
            out.append(f"{path}.co_consts[{i}]: {x!r} != {y!r}")
    return out


def equal(a: CodeType, b: CodeType) -> bool:
    return not diff_code(a, b)


if __name__ == "__main__":  # pragma: no cover - exercised via extract_pyz.py
    sys.exit("import this module; it is a library")
