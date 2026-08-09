#!/usr/bin/env python3
"""Executable runner for `docs/specs/13-hard-constraints.md` (ADR-018).

The spec file is the source of truth. This runner reconciles it against
`scripts/hard_constraints/registry.py` and executes every `STATIC` predicate.

Exit codes
----------
0  every STATIC gate passes and the registry reconciles
1  at least one red condition

Red conditions (ADR-018)
------------------------
1. a gate in the spec with no registry entry, or a registry entry matching no gate
2. a `PHASE` gate owned by a phase already recorded closed
3. a `WITNESS` gate naming no artifact, or a `RETIRED` gate naming no ADR
4. a failing `STATIC` predicate
5. a struck spec line not registered `RETIRED`, or a `RETIRED` entry whose line is not struck
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hard_constraints.checks import REGISTRY_CHECKS
from hard_constraints.parse import parse
from hard_constraints.registry import (
    CLOSED_PHASES,
    REGISTRY,
    unused_checks,
    validate_registry,
)


class Palette:
    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled

    def _wrap(self, code: str, text: str) -> str:
        return f"\033[{code}m{text}\033[0m" if self.enabled else text

    def green(self, t: str) -> str:
        return self._wrap("32", t)

    def yellow(self, t: str) -> str:
        return self._wrap("33", t)

    def red(self, t: str) -> str:
        return self._wrap("31", t)

    def dim(self, t: str) -> str:
        return self._wrap("2", t)


def run(spec_path: Path | None = None, *, colour: bool = True, quiet: bool = False) -> int:
    c = Palette(colour)
    reds: list[str] = []
    yellows: list[str] = []
    greens: list[str] = []

    def out(line: str) -> None:
        if not quiet:
            print(line)

    for problem in validate_registry():
        reds.append(f"registry: {problem}")
    for name in unused_checks():
        yellows.append(c.yellow("unused") + f"   predicate {name}() is registered against no gate")

    gates = parse(spec_path)
    seen: set[str] = set()

    for gate in gates:
        seen.add(gate.gate_id)
        entry = REGISTRY.get(gate.gate_id)

        if entry is None:
            reds.append(
                f"UNREGISTERED gate at line {gate.line}: {gate.short}\n"
                f"    add to scripts/hard_constraints/registry.py as: "
                f'"{gate.gate_id}": _p("Phase N"),'
            )
            continue

        if gate.retired and entry.tier != "RETIRED":
            reds.append(
                f"{gate.gate_id}: spec line {gate.line} is struck but registered {entry.tier}"
            )
            continue
        if entry.tier == "RETIRED" and not gate.retired:
            reds.append(
                f"{gate.gate_id}: registered RETIRED but spec line {gate.line} is not struck"
            )
            continue

        if entry.tier == "RETIRED":
            greens.append(f"{c.dim('retired')}  {gate.short}")
        elif entry.tier == "STATIC":
            if entry.check not in REGISTRY_CHECKS:
                # Already reported by validate_registry(); do not also crash on it.
                continue
            failure = REGISTRY_CHECKS[entry.check]()
            if failure:
                reds.append(f"FAILED {entry.check}: {failure}\n    gate: {gate.short}")
            else:
                greens.append(f"{c.green('pass')}     {gate.short}")
        elif entry.tier == "PHASE":
            if entry.owner in CLOSED_PHASES:
                reds.append(
                    f"{gate.gate_id}: deferred to {entry.owner}, which is CLOSED. "
                    f"A closed phase cannot leave a gate unproven.\n    gate: {gate.short}"
                )
            else:
                note = f" — {entry.note}" if entry.note else ""
                yellows.append(f"{c.yellow('deferred')} [{entry.owner}] {gate.short}{note}")
        elif entry.tier == "WITNESS":
            owner = f"[{entry.owner}] " if entry.owner else ""
            yellows.append(f"{c.yellow('witness')}  {owner}{gate.short}\n    recorded in: {entry.artifact}")

    for gate_id in sorted(set(REGISTRY) - seen):
        reds.append(
            f"ORPHANED registry entry {gate_id}: matches no gate in the checklist. "
            "The gate was reworded or deleted; re-register it deliberately."
        )

    out("")
    out(f"=== hard constraints: {len(gates)} gates in docs/specs/13-hard-constraints.md ===")
    out("")
    for line in greens:
        out("  " + line)
    if yellows:
        out("")
        for line in yellows:
            out("  " + line)
    if reds:
        out("")
        for line in reds:
            out("  " + c.red("RED") + " " + line)

    n_static = sum(1 for e in REGISTRY.values() if e.tier == "STATIC")
    n_phase = sum(1 for e in REGISTRY.values() if e.tier == "PHASE")
    n_witness = sum(1 for e in REGISTRY.values() if e.tier == "WITNESS")
    n_retired = sum(1 for e in REGISTRY.values() if e.tier == "RETIRED")

    out("")
    out(
        f"  {n_static} enforced now · {n_phase} deferred to a named phase · "
        f"{n_witness} operator-witnessed · {n_retired} retired"
    )
    if reds:
        out(c.red(f"=== FAILED with {len(reds)} red condition(s) ==="))
        out("")
        return 1
    out(c.green("=== PASSED ==="))
    out("")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--no-color", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--spec", type=Path, default=None, help="override the checklist path")
    args = ap.parse_args()
    return run(args.spec, colour=not args.no_color and sys.stdout.isatty(), quiet=args.quiet)


if __name__ == "__main__":
    raise SystemExit(main())
