#!/usr/bin/env python3
"""Machine-score the `code` task: extract each cell's module and execute the hidden tests.

    python3 bench/path_e/score_code.py ~/.oh-gui/bench_path_e/<STAMP>_run

Awards the 60 executed-test points of bench/gold/code.md. The remaining 40 (commentary,
contract adherence, quality) stay human/model judgment and are not touched here.

SAFETY: this executes code written by a local model. The task is a text parser and the
suite calls only those two functions, but the module is imported, so top-level statements
run. Execution is confined to a fresh temp directory, runs with `-s` (no user
site-packages) and a scrubbed environment whose PYTHONPATH is exactly that temp
directory, and is killed after a timeout. That is containment, not a sandbox. Do not
point this at outputs from an untrusted source.

Note for anyone tempted to "harden" this with `-I`: that flag also removes the working
directory from sys.path, so `candidate` and `code_tests` become unimportable and every
cell scores 0 with a misleading FAILURES status. This was caught by running the scorer
against the known-good reference solution, which is why that fixture check exists.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TESTS = REPO / "bench" / "gold" / "code_tests.py"
TOTAL_TESTS = 30
TEST_POINTS = 60
TIMEOUT_S = 120

FENCE_RE = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.DOTALL)
RAN_RE = re.compile(r"^Ran (\d+) tests?", re.MULTILINE)


def extract_module(text: str) -> str | None:
    """Pull the candidate module out of the answer.

    Prefer a fenced block defining both required functions; fall back to the longest
    fenced block; fall back to raw text if it already looks like a module. Models
    sometimes emit a second block showing example usage, so 'first block' is wrong.
    """
    blocks = [b for b in FENCE_RE.findall(text)]
    both = [b for b in blocks
            if "def parse_perf_flags" in b and "def decode_flag" in b]
    if both:
        return max(both, key=len)
    if blocks:
        return max(blocks, key=len)
    if "def parse_perf_flags" in text and "def decode_flag" in text:
        return text          # unfenced but plausibly a module
    return None


def run_suite(module_src: str) -> dict:
    with tempfile.TemporaryDirectory(prefix="ohgui_codescore_") as td:
        d = Path(td)
        (d / "candidate.py").write_text(module_src)
        shutil.copy(TESTS, d / "code_tests.py")
        env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
               "HOME": str(d), "PYTHONPATH": str(d), "PYTHONDONTWRITEBYTECODE": "1",
               "LC_ALL": "C.UTF-8", "LANG": "C.UTF-8"}
        try:
            p = subprocess.run(
                [sys.executable, "-s", "-m", "unittest", "code_tests", "-v"],
                cwd=d, env=env, capture_output=True, text=True, timeout=TIMEOUT_S)
        except subprocess.TimeoutExpired:
            return {"ran": 0, "passed": 0, "failed": TOTAL_TESTS,
                    "status": "TIMEOUT", "detail": f"exceeded {TIMEOUT_S}s"}

    out = p.stdout + p.stderr
    m = RAN_RE.search(out)
    if not m:
        head = out.strip().splitlines()
        return {"ran": 0, "passed": 0, "failed": TOTAL_TESTS,
                "status": "IMPORT_ERROR",
                "detail": " | ".join(head[-4:]) if head else "no output"}

    ran = int(m.group(1))
    # A unittest ERROR line naming the MODULE rather than a test method means the import
    # itself blew up - report that as such instead of as 30 ordinary test failures.
    if re.search(r"^ERROR: (code_tests|candidate)\b", out, re.MULTILINE):
        detail = re.findall(r"^(?:\w+Error|Exception): .*$", out, re.MULTILINE)
        return {"ran": ran, "passed": 0, "failed": TOTAL_TESTS,
                "status": "IMPORT_ERROR",
                "detail": detail[-1] if detail else "module failed to import"}

    fails = len(re.findall(r"^(FAIL|ERROR): ", out, re.MULTILINE))
    passed = max(0, ran - fails)
    failed_names = re.findall(r"^(?:FAIL|ERROR): (\w+)", out, re.MULTILINE)
    return {"ran": ran, "passed": passed, "failed": fails,
            "status": "OK" if fails == 0 else "FAILURES",
            "failed_tests": sorted(set(failed_names))}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir")
    args = ap.parse_args()
    run_dir = Path(args.run_dir).expanduser()

    if not TESTS.exists():
        sys.exit(f"missing hidden test suite: {TESTS}")

    rows = []
    for jf in sorted(run_dir.glob("*.json")):
        rec = json.loads(jf.read_text())
        for r in rec.get("results", []):
            if r.get("task") != "code":
                continue
            src = extract_module(r.get("content_stripped", "") or "")
            if src is None:
                res = {"ran": 0, "passed": 0, "failed": TOTAL_TESTS,
                       "status": "NO_CODE_BLOCK", "detail": ""}
            else:
                res = run_suite(src)
            res["points"] = round(TEST_POINTS * res["passed"] / TOTAL_TESTS)
            res["cell"] = rec["cell_id"]
            res["model"] = rec["model_id"]
            res["decode_tok_s"] = r.get("decode_tok_s")
            rows.append(res)

    if not rows:
        sys.exit("no `code` task results found in that run directory")

    rows.sort(key=lambda r: (-r["points"], r["cell"]))
    print(f"\n{'cell':40s} {'pass':>7s} {'/60':>5s} {'tok/s':>8s}  status")
    print("-" * 78)
    for r in rows:
        print(f"{r['cell']:40s} {r['passed']:>3d}/{TOTAL_TESTS:<3d} "
              f"{r['points']:>5d} {str(r['decode_tok_s'] or '-'):>8s}  {r['status']}")
        if r.get("failed_tests"):
            print(f"{'':40s} failed: {', '.join(r['failed_tests'])}")
        if r.get("detail"):
            print(f"{'':40s} {r['detail']}")

    dest = run_dir / "code_test_scores.json"
    dest.write_text(json.dumps(rows, indent=2))
    print(f"\n-> {dest}")
    print("Remaining 40 points (commentary 15, contract 15, quality 10) are judged "
          "against bench/gold/code.md.")


if __name__ == "__main__":
    main()
