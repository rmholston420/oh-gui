#!/usr/bin/env python3
"""Pre-GPU ADR-013 discordance-headroom gate for the tool-call benchmark."""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path

MANIFEST = Path(__file__).resolve().parent / "MANIFEST.md"
MARKER = re.compile(r"<!-- attainability: (\{.*?\}) -->")


@dataclass(frozen=True)
class Design:
    task_count: int
    acceptance_a: float
    acceptance_b: float
    correlation: float
    minimum_discordant_pairs: float = 5.0


def expected_discordant_fraction(a: float, b: float, correlation: float) -> float:
    """Return P(A != B) using the correlated-Bernoulli joint-success identity."""
    if not 0 <= a <= 1 or not 0 <= b <= 1 or not -1 <= correlation <= 1:
        raise ValueError("acceptance rates and correlation must be within [-1, 1]/[0, 1]")
    q = a + b - 2 * a * b - 2 * correlation * math.sqrt(a * (1 - a) * b * (1 - b))
    if q < -1e-12 or q > 1 + 1e-12:
        raise ValueError("rates/correlation do not define a feasible Bernoulli pairing")
    return max(0.0, min(1.0, q))


def expected_discordant_pairs(design: Design) -> float:
    if design.task_count <= 0:
        raise ValueError("task_count must be positive")
    return design.task_count * expected_discordant_fraction(
        design.acceptance_a, design.acceptance_b, design.correlation)


def gate(design: Design) -> tuple[bool, float]:
    expected = expected_discordant_pairs(design)
    return expected >= design.minimum_discordant_pairs, expected


def load_registered_design(path: Path = MANIFEST) -> Design:
    match = MARKER.search(path.read_text())
    if not match:
        raise ValueError(f"no machine-readable attainability marker in {path}")
    return Design(**json.loads(match.group(1)))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--task-count", type=int)
    parser.add_argument("--acceptance-a", type=float)
    parser.add_argument("--acceptance-b", type=float)
    parser.add_argument("--correlation", type=float)
    args = parser.parse_args(argv)
    try:
        registered = load_registered_design(args.manifest)
        design = Design(
            task_count=args.task_count if args.task_count is not None else registered.task_count,
            acceptance_a=args.acceptance_a if args.acceptance_a is not None else registered.acceptance_a,
            acceptance_b=args.acceptance_b if args.acceptance_b is not None else registered.acceptance_b,
            correlation=args.correlation if args.correlation is not None else registered.correlation,
            minimum_discordant_pairs=registered.minimum_discordant_pairs,
        )
        passed, expected = gate(design)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"NO-GO: invalid attainability design: {exc}", file=sys.stderr)
        return 2
    print("attainability design:", design)
    print(f"expected discordant pairs: {expected:.4f}; required: >= {design.minimum_discordant_pairs:.1f}")
    if passed:
        print("GO: pre-registered design clears ADR-013's >=5 expected-discordant-pair floor.")
        return 0
    print("NO-GO: design cannot reach ADR-013's >=5 expected-discordant-pair floor; do not spend GPU time.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
