#!/usr/bin/env python3
"""Derive the trust-dial truth table from the pinned image's own policy code.

WHY THIS EXISTS
---------------
`apps/gui/src/features/first-run/trust-dial.ts` is a hand-written mirror of upstream
confirmation-policy semantics, and `trust-dial.test.ts` pins it to *the spec* — to a table a
human typed. That is the same class of artifact as the old `AuthorizeRequest`, which was pinned
to the documented envelope and turned out wrong in four of eight fields. A mirror checked
against prose is checked against the thing most likely to be wrong.

So this script does for the trust dial what `extract_image_sdk.py` did for the hook envelope:
it takes the answer from the image instead of from a document. It extracts
`openhands.sdk.security.*` from the PyInstaller bundle, proves each module matches the pinned
sdist, executes the real `AlwaysConfirm` / `NeverConfirm` / `ConfirmRisky` / 
`EnsembleSecurityAnalyzer` objects across the whole parameter space, and writes the resulting
truth table as evidence for the TypeScript gate to assert against.

WHAT IS STUBBED, AND WHY THAT IS A REDUCTION
--------------------------------------------
The security modules import machinery that has nothing to do with the decision being measured:
`rich.text.Text` (display), `openhands.sdk.utils.models.DiscriminatedUnionMixin` (serialization
and discriminated-union registration), `ActionEvent` / `Event` (typing), and the SDK logger.
Installing the full SDK to satisfy those would mean executing pip-resolved code rather than the
image's, which is the opposite of the point.

So they are stubbed: `DiscriminatedUnionMixin` becomes a plain `pydantic.BaseModel`, the rest
become inert placeholders. **This is a real reduction in strictness** and is stated here rather
than buried: if upstream ever moved confirmation logic *into* `DiscriminatedUnionMixin`, or made
`ConfirmRisky` a discriminated-union dispatch rather than a method call, this harness would keep
reporting the old answer. What it does execute — `should_confirm`, `security_risk`,
`is_riskier`, the field validator, the enum ordering — is the entire body of the decision, taken
verbatim from the image.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from types import CodeType, ModuleType

sys.path.insert(0, str(Path(__file__).resolve().parent))

from compare_bytecode import diff_code  # noqa: E402
from extract_image_sdk import (  # noqa: E402
    compile_reference,
    pyz_modules,
    read_carchive_pyz,
    shipped_code,
)

G, Y, R, X = "\033[0;32m", "\033[0;33m", "\033[0;31m", "\033[0m"

SECURITY_MODULES = (
    "openhands.sdk.security.risk",
    "openhands.sdk.security.confirmation_policy",
    "openhands.sdk.security.analyzer",
    "openhands.sdk.security.ensemble",
)

RISKS = ("LOW", "MEDIUM", "HIGH", "UNKNOWN")
THRESHOLDS = ("LOW", "MEDIUM", "HIGH")


def install_stubs() -> None:
    """Register the inert dependencies described in the module docstring."""
    import pydantic

    def mod(name: str, **attrs: object) -> None:
        m = ModuleType(name)
        for k, v in attrs.items():
            setattr(m, k, v)
        sys.modules[name] = m

    class Text:  # rich.text.Text — only used by `visualize`, never by a decision
        def __init__(self, *a: object, **k: object) -> None:
            self.parts: list = []

        def append(self, *a: object, **k: object) -> None:
            self.parts.append(a)

    class _Logger:
        def __getattr__(self, _: str):
            return lambda *a, **k: None

    class ActionEvent:  # typing only
        pass

    mod("rich", text=None)
    mod("rich.text", Text=Text)
    mod("openhands", __path__=[])
    mod("openhands.sdk", __path__=[])
    mod("openhands.sdk.security", __path__=[])
    mod("openhands.sdk.logger", get_logger=lambda *_a, **_k: _Logger())
    mod("openhands.sdk.utils", __path__=[])
    mod("openhands.sdk.utils.models", DiscriminatedUnionMixin=pydantic.BaseModel)
    mod("openhands.sdk.event", ActionEvent=ActionEvent, __path__=[])
    mod("openhands.sdk.event.base", Event=ActionEvent)
    mod("openhands.sdk.event.llm_convertible", ActionEvent=ActionEvent)


def verify_and_load(binary: Path, source_root: Path) -> dict[str, ModuleType]:
    pyz = read_carchive_pyz(binary)
    toc = pyz_modules(pyz)
    loaded: dict[str, ModuleType] = {}
    failures = 0

    for name in SECURITY_MODULES:
        rel = Path(*name.split(".")).with_suffix(".py")
        src_path = source_root / rel
        if not src_path.exists():
            print(f"{R}FAIL{X} {name}: not in the pinned sdist at {rel}")
            failures += 1
            continue
        shipped = shipped_code(pyz, toc, name)
        reference: CodeType = compile_reference(src_path.read_text(encoding="utf-8"), str(rel))
        diffs = diff_code(shipped, reference)
        if diffs:
            print(f"{R}FAIL{X} {name}: image diverges from pinned source ({len(diffs)} differences)")
            for d in diffs[:5]:
                print(f"       {d}")
            failures += 1
        else:
            print(f" {G}ok{X}   {name} matches pinned source")

    if failures:
        raise SystemExit(
            f"\n{R}FAIL{X}: {failures} security module(s) in the image do not match the pinned "
            "sdist. Do not derive the trust dial from a source the image does not run."
        )

    install_stubs()
    for name in SECURITY_MODULES:
        m = ModuleType(name)
        m.__dict__["__name__"] = name
        sys.modules[name] = m
        exec(shipped_code(pyz, toc, name), m.__dict__)  # the image's own bytecode
        loaded[name] = m
    print(f" {G}ok{X}   executed the image's own security modules")
    return loaded


def build_table(mods: dict[str, ModuleType]) -> dict:
    risk_mod = mods["openhands.sdk.security.risk"]
    pol = mods["openhands.sdk.security.confirmation_policy"]
    ens = mods["openhands.sdk.security.ensemble"]
    analyzer = mods["openhands.sdk.security.analyzer"]

    SecurityRisk = risk_mod.SecurityRisk
    r = {name: SecurityRisk[name] for name in RISKS}

    class Fixed(analyzer.SecurityAnalyzerBase):
        """A child analyzer that returns a preset level, standing in for a real detector."""

        level: str

        def security_risk(self, action: object) -> object:
            return SecurityRisk[self.level]

    def fuse(incoming: str, outside: bool) -> str:
        """What the ensemble hands the policy.

        The worktree analyzer is a child returning a concrete HIGH when the write lands outside
        the worktree. The other child passes the incoming assessment through. This is the exact
        arrangement `trust-dial.ts` claims to model.
        """
        children = [Fixed(level=incoming)]
        if outside:
            children.append(Fixed(level="HIGH"))
        return str(ens.EnsembleSecurityAnalyzer(analyzers=children).security_risk(None).value)

    # Raw upstream behaviour, no interpretation applied.
    always = {k: pol.AlwaysConfirm().should_confirm(v) for k, v in r.items()}
    never = {k: pol.NeverConfirm().should_confirm(v) for k, v in r.items()}

    confirm_risky: dict[str, bool] = {}
    for t in THRESHOLDS:
        for cu in (True, False):
            p = pol.ConfirmRisky(threshold=r[t], confirm_unknown=cu)
            for name, risk in r.items():
                confirm_risky[f"{t}|{cu}|{name}"] = p.should_confirm(risk)

    fusion = {f"{risk}|{out}": fuse(risk, out) for risk in RISKS for out in (False, True)}

    # The derived per-stop table the mirror must reproduce.
    stops: dict[str, bool] = {}
    for t in THRESHOLDS:
        for cu in (True, False):
            p = pol.ConfirmRisky(threshold=r[t], confirm_unknown=cu)
            for risk in RISKS:
                for out in (False, True):
                    key = f"{t}|{cu}|{risk}|{out}"
                    stops[f"ask-always|{key}"] = pol.AlwaysConfirm().should_confirm(r[risk])
                    stops[f"never|{key}"] = pol.NeverConfirm().should_confirm(r[risk])
                    stops[f"ask-risky|{key}"] = p.should_confirm(r[risk])
                    stops[f"ask-outside-worktree|{key}"] = p.should_confirm(
                        SecurityRisk[fuse(risk, out)]
                    )

    return {
        "source": (
            "openhands.sdk.security.{risk,confirmation_policy,analyzer,ensemble} executed from "
            "the PyInstaller bundle inside "
            "ghcr.io/openhands/agent-server@sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520"
        ),
        "sdk_version": "1.41.0",
        "caveat": (
            "DiscriminatedUnionMixin was stubbed with pydantic.BaseModel; rich.Text, the SDK "
            "logger and ActionEvent were stubbed inert. See the docstring of "
            "scripts/verify_trust_dial.py for why, and for what that does not cover."
        ),
        "key_format": "<stop>|<threshold>|<confirm_unknown>|<incoming_risk>|<writes_outside_worktree>",
        "risk_levels": list(RISKS),
        "confirm_risky_defaults": {
            "threshold": str(pol.ConfirmRisky().threshold.value),
            "confirm_unknown": pol.ConfirmRisky().confirm_unknown,
        },
        "ensemble_propagate_unknown_default": ens.EnsembleSecurityAnalyzer(
            analyzers=[Fixed(level="LOW")]
        ).propagate_unknown,
        "raw": {
            "AlwaysConfirm": always,
            "NeverConfirm": never,
            "ConfirmRisky": confirm_risky,
            "ensemble_fusion": fusion,
        },
        "stops": stops,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--binary", required=True, type=Path)
    ap.add_argument("--source-root", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()

    mods = verify_and_load(a.binary, a.source_root)
    table = build_table(mods)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(table, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f" {G}ok{X}   wrote {a.out}")

    d = table["confirm_risky_defaults"]
    print(f" {G}ok{X}   upstream ConfirmRisky defaults: threshold={d['threshold']} confirm_unknown={d['confirm_unknown']}")
    print(f" {G}ok{X}   upstream ensemble propagate_unknown default: {table['ensemble_propagate_unknown_default']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
