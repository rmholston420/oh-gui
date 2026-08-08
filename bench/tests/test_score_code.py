#!/usr/bin/env python3
"""Regression tests for bench/path_e/score_code.py.

WHY THIS FILE EXISTS
--------------------
score_code.py once scored the known-good reference solution 0/30, because it ran the
suite under `python3 -I` and that flag strips the working directory from sys.path. The
bug was invisible: the output looked like an ordinary FAILURES result. Had it shipped,
every cell in the round-2 code task would have scored 0 of the 60 machine points and the
coder verdict would have been decided entirely by judged points, while looking legitimate.

A scorer that has not been run against a known-good input is not a scorer. This file is
that run, made permanent. The reference solution MUST score 60/60 here or the harness is
broken, regardless of what any model output looks like.

    python3 bench/tests/test_score_code.py

Exits non-zero on any failure. No third-party dependencies.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCORER = REPO / "bench" / "path_e" / "score_code.py"
REFERENCE = REPO / "bench" / "gold" / "reference" / "code_reference.py"

failures: list[str] = []


def check(cond: bool, desc: str, detail: str = "") -> None:
    if cond:
        print(f"  ok    {desc}")
    else:
        failures.append(desc)
        print(f"  FAIL  {desc}" + (f"\n          {detail}" if detail else ""))


# ---------------------------------------------------------------- fixtures

# A plausible-but-wrong implementation. Two defects, both deliberate:
#   * `endswith("Active")` is true for BOTH "Active" and "Not Active" - the exact trap the
#     code task is built around, and a defect this repo really shipped in awk.
#   * decode_flag indexes position 1 with no length check, so a 1-char field raises.
NAIVE = '''
def parse_perf_flags(text: str) -> dict[str, bool]:
    out = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        label, _, value = line.partition(":")
        out["_".join(label.split()).lower()] = value.strip().endswith("Active")
    return out


def decode_flag(field):
    if not field:
        return (False, False)
    return (field[0] == "1", field[1] == "1")
'''

# Raises while being imported. Must be reported as IMPORT_ERROR, not as 30 test failures -
# that distinction is what makes the `-I` class of bug visible instead of silent.
EXPLODES = '''
raise RuntimeError("boom at import time")


def parse_perf_flags(text):
    return {}


def decode_flag(field):
    return (False, False)
'''


def cell(cell_id: str, model: str, answer: str, tok_s: float = 100.0) -> dict:
    return {"cell_id": cell_id, "model_id": model,
            "results": [{"task": "code", "decode_tok_s": tok_s,
                         "content_stripped": answer}]}


def fenced(src: str) -> str:
    return "Here is the module.\n\n```python\n" + src + "\n```\n"


def build_run_dir(d: Path) -> None:
    ref = REFERENCE.read_text()
    cases = {
        # The known-good input. This is the assertion that matters most.
        "c90_reference": cell("c90_reference", "reference", fenced(ref)),
        # Same solution, but followed by a usage-example block. Models do this constantly;
        # taking the *first* fenced block would score the example instead of the module.
        "c91_trailing_example": cell(
            "c91_trailing_example", "reference+example",
            fenced(ref) + "\nExample:\n\n```python\nprint(parse_perf_flags(open('x').read()))\n```\n"),
        # Unfenced but plausibly a module - the extractor is documented to accept this.
        "c92_unfenced": cell("c92_unfenced", "reference-unfenced", ref),
        "c93_naive": cell("c93_naive", "strawman-naive", fenced(NAIVE), 300.0),
        "c94_prose": cell("c94_prose", "strawman-prose",
                          "I would parse it with a regular expression.", 50.0),
        "c95_explodes": cell("c95_explodes", "strawman-import-error", fenced(EXPLODES)),
    }
    for name, rec in cases.items():
        (d / f"{name}.json").write_text(json.dumps(rec))


def score(d: Path) -> dict[str, dict]:
    p = subprocess.run([sys.executable, str(SCORER), str(d)],
                       capture_output=True, text=True, timeout=600)
    if p.returncode != 0:
        print(p.stdout)
        print(p.stderr, file=sys.stderr)
        sys.exit("scorer exited non-zero")
    rows = json.loads((d / "code_test_scores.json").read_text())
    return {r["cell"]: r for r in rows}


# ---------------------------------------------------------------- assertions

def main() -> int:
    if not REFERENCE.exists():
        sys.exit(f"missing reference solution: {REFERENCE}")

    with tempfile.TemporaryDirectory(prefix="ohgui_scorer_test_") as td:
        d = Path(td)
        build_run_dir(d)
        r = score(d)

    print("reference solution")
    ref = r["c90_reference"]
    check(ref["passed"] == 30 and ref["failed"] == 0,
          "reference passes 30/30", f"got {ref['passed']}/30 status={ref['status']}")
    check(ref["points"] == 60, "reference earns the full 60 machine points",
          f"got {ref['points']}")
    check(ref["status"] == "OK", "reference status is OK", f"got {ref['status']}")

    print("\nmodule extraction")
    check(r["c91_trailing_example"]["passed"] == 30,
          "picks the module over a trailing usage-example block",
          f"got {r['c91_trailing_example']['passed']}/30")
    check(r["c92_unfenced"]["passed"] == 30,
          "accepts an unfenced module",
          f"got {r['c92_unfenced']['passed']}/30")
    check(r["c94_prose"]["status"] == "NO_CODE_BLOCK" and r["c94_prose"]["points"] == 0,
          "prose-only answer is NO_CODE_BLOCK and scores 0",
          f"got {r['c94_prose']['status']} / {r['c94_prose']['points']}")

    print("\ndiscrimination")
    naive = r["c93_naive"]
    check(0 < naive["passed"] < 30,
          "naive implementation scores partial credit, not 0 and not full",
          f"got {naive['passed']}/30")
    check("test_not_active_is_false" in naive.get("failed_tests", []),
          "the 'Not Active' trap actually discriminates",
          f"failed: {naive.get('failed_tests')}")
    check(naive["points"] < ref["points"],
          "reference outscores the naive implementation",
          f"{ref['points']} vs {naive['points']}")

    print("\nimport failure is distinguishable")
    boom = r["c95_explodes"]
    check(boom["status"] == "IMPORT_ERROR",
          "a module that raises at import reports IMPORT_ERROR, not FAILURES",
          f"got {boom['status']}")
    check(boom["points"] == 0, "import failure scores 0", f"got {boom['points']}")

    print()
    if failures:
        print(f"{len(failures)} FAILURE(S): {'; '.join(failures)}")
        return 1
    print("all scorer tests passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
