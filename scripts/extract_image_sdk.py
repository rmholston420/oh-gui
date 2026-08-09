#!/usr/bin/env python3
"""Read the OpenHands SDK out of the pinned agent-server image and verify it against source.

Background — why the first harness failed
-----------------------------------------
`capture-hook-envelope.sh` originally tried to `python -c 'import openhands.sdk.hooks.types'`
inside the pinned image, then fell back to `find`ing `types.py`. Both found nothing, and the
fallback printed nothing at all, which looked like a broken script. It was not: the image
ships **one 112 MB stripped PyInstaller binary** at `/usr/local/bin/openhands-agent-server`
and no Python package tree whatsoever. There is no `types.py` on that filesystem to find and
no interpreter on `PATH` that could import it. The premise was wrong, not the plumbing.

What this does instead
----------------------
1. Copies the binary out of the pinned image (by digest, never by tag).
2. Parses the PyInstaller CArchive table of contents to locate the embedded `PYZ.pyz`.
3. Unmarshals the shipped `openhands.sdk.hooks.*` code objects.
4. Compares each, structurally, against the same module compiled from the pinned upstream
   sdist — establishing the sdist as a verified stand-in for what the image actually runs.
5. Emits the `pre_tool_use` envelope from the verified source and diffs it against our
   `AuthorizeRequest`.

Requires CPython 3.13 (the image bundles 3.13.14 and marshal is version-specific).
`capture-hook-envelope.sh` provisions one.
"""

from __future__ import annotations

import argparse
import json
import marshal
import struct
import sys
import zlib
from pathlib import Path
from types import CodeType

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_bytecode import diff_code  # noqa: E402

PYINSTALLER_COOKIE = b"MEI\014\013\012\013\016"


def compile_reference(source: str, filename: str) -> CodeType:
    """Compile reference source the way the image's builder did.

    `dont_inherit=True` is load-bearing and was learned the hard way. `compile()` inherits any
    `__future__` statements in effect in the *calling* module. This file uses
    `from __future__ import annotations`, so without the flag every reference module compiled
    with `CO_FUTURE_ANNOTATIONS` (co_flags 0x1000000) while the shipped ones did not — turning
    annotations into strings and reporting all five hook modules as diverged from upstream.
    A false 'the image does not match upstream' is worse than no check at all: it is exactly
    the alarm an operator learns to ignore.
    """
    return compile(source, filename, "exec", dont_inherit=True)


HOOK_MODULES = (
    "openhands.sdk.hooks.types",
    "openhands.sdk.hooks.executor",
    "openhands.sdk.hooks.manager",
    "openhands.sdk.hooks.conversation_hooks",
    "openhands.sdk.hooks.config",
)


class Fail(SystemExit):
    def __init__(self, msg: str) -> None:
        super().__init__(f"FAIL: {msg}")


def read_carchive_pyz(binary: Path) -> bytes:
    """Return the decompressed PYZ archive embedded in a PyInstaller onefile binary."""
    data = binary.read_bytes()
    pos = data.rfind(PYINSTALLER_COOKIE)
    if pos < 0:
        raise Fail(
            f"{binary} has no PyInstaller cookie. If upstream stopped shipping a onefile "
            f"bundle, this whole approach needs revisiting — do not patch around it."
        )
    cookie = data[pos : pos + 24 + 64]
    _magic, pkg_len, toc_off, toc_len, pyvers = struct.unpack("!8sIIII", cookie[:24])
    print(f"  ok   PyInstaller archive found (bundled Python {pyvers // 100}.{pyvers % 100})")
    if pyvers != 313:
        raise Fail(f"image bundles Python {pyvers}, this script assumes 313")

    pkg_start = pos + len(cookie) - pkg_len
    toc = data[pkg_start + toc_off : pkg_start + toc_off + toc_len]

    p = 0
    while p < len(toc):
        (elen,) = struct.unpack("!I", toc[p : p + 4])
        if elen == 0:
            break
        epos, dlen, _ulen, flag, typecode = struct.unpack("!IIIBc", toc[p + 4 : p + 18])
        name = toc[p + 18 : p + elen].rstrip(b"\x00").decode(errors="replace")
        if typecode in (b"z", b"Z"):
            raw = data[pkg_start + epos : pkg_start + epos + dlen]
            if flag:
                raw = zlib.decompress(raw)
            print(f"  ok   extracted {name} ({len(raw):,} bytes)")
            return raw
        p += elen
    raise Fail("no PYZ archive in the CArchive table of contents")


def pyz_modules(pyz: bytes) -> dict[str, tuple[int, int, int]]:
    if pyz[:4] != b"PYZ\x00":
        raise Fail(f"not a PYZ archive (magic {pyz[:4]!r})")
    (toc_off,) = struct.unpack("!I", pyz[8:12])
    toc = marshal.loads(pyz[toc_off:])
    return dict(toc) if isinstance(toc, list) else toc


def shipped_code(pyz: bytes, toc: dict, module: str) -> CodeType:
    if module not in toc:
        raise Fail(f"{module} is not in the image's PYZ archive")
    _tc, pos, length = toc[module]
    return marshal.loads(zlib.decompress(pyz[pos : pos + length]))


def verify(binary: Path, source_root: Path) -> tuple[bytes, dict]:
    pyz = read_carchive_pyz(binary)
    toc = pyz_modules(pyz)
    print(f"  ok   {len(toc):,} modules in the bundle")

    failures = 0
    for module in HOOK_MODULES:
        code = shipped_code(pyz, toc, module)
        rel = module.replace(".", "/") + ".py"
        src_path = source_root / rel
        if not src_path.exists():
            print(f"  FAIL {module}: reference source missing at {src_path}")
            failures += 1
            continue
        local = compile_reference(src_path.read_text(), code.co_filename)
        d = diff_code(local, code)
        if d:
            failures += 1
            print(f"  FAIL {module}: image diverges from pinned source ({len(d)} differences)")
            for line in d[:6]:
                print(f"         {line}")
        else:
            print(f"  ok   {module} matches pinned source")

    if failures:
        raise Fail(
            f"{failures} hook module(s) in the image do not match the pinned sdist. "
            f"The sdist is NOT a valid stand-in — do not derive the envelope from it."
        )
    print("  ok   pinned sdist is a verified stand-in for the image's hook modules")
    return pyz, toc


def emit_envelope(pyz: bytes, toc: dict, out: Path) -> dict:
    """Serialize a real pre_tool_use HookEvent by executing the image's own bytecode.

    Deliberately *not* imported from the reference sdist. The sdist has been shown equivalent,
    but running the shipped code object removes the last inferential step: these bytes come out
    of `agent-server@sha256:f0244fd7…` itself. `openhands.sdk.hooks.types` imports only `enum`,
    `typing` and `pydantic`, so it executes standalone without the SDK's import chain.
    """
    code = shipped_code(pyz, toc, "openhands.sdk.hooks.types")
    ns: dict = {"__name__": "openhands.sdk.hooks.types"}
    exec(code, ns)  # noqa: S102 - executing the pinned image's own module, by design
    HookEvent = ns["HookEvent"]
    HookEventType = ns["HookEventType"]

    event = HookEvent(
        event_type=HookEventType.PRE_TOOL_USE,
        tool_name="execute_bash",
        tool_input={"command": "rm -rf /"},
        session_id="s-1",
        working_dir="/workspace",
    )
    payload = json.loads(event.model_dump_json())

    fields = {}
    for name, info in HookEvent.model_fields.items():
        ann = info.annotation
        fields[name] = {
            "annotation": str(ann),
            "nullable": "None" in str(ann) or "Optional" in str(ann),
            "required": info.is_required(),
        }

    envelope = {
        "source": "openhands.sdk.hooks.types.HookEvent, verified byte-identical to the "
        "code inside agent-server@sha256:f0244fd7…",
        "serialized_keys": sorted(payload),
        "example_payload": payload,
        "fields": fields,
    }
    out.write_text(json.dumps(envelope, indent=2, sort_keys=True) + "\n")
    print(f"  ok   wrote {out}")
    return envelope


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--binary", required=True, type=Path)
    ap.add_argument("--source-root", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    pyz, toc = verify(a.binary, a.source_root)
    emit_envelope(pyz, toc, a.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
