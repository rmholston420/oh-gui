#!/usr/bin/env python3
"""Static validation for the bench harness. Run before every commit that touches it.

Three layers, because the first two have each missed a real defect on their own:
  1. `bash -n` on every shell script.
  2. Byte-compile the Python heredocs embedded in those scripts - `bash -n` does not
     look inside a quoted heredoc, so a syntax error there survives to runtime.
  3. Assert on file content for invariants that neither parser can see.
"""
from __future__ import annotations

import ast
import py_compile
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BENCH = REPO / "bench"
HEREDOC_RE = re.compile(r"<<'PY'[^\n]*\n(.*?)\nPY\n", re.DOTALL)

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print(f"  FAIL  {msg}")


def ok(msg: str) -> None:
    print(f"  ok    {msg}")


print("1. bash -n")
shells = sorted(BENCH.rglob("*.sh"))
for s in shells:
    p = subprocess.run(["bash", "-n", str(s)], capture_output=True, text=True)
    if p.returncode:
        fail(f"{s.relative_to(REPO)}: {p.stderr.strip()}")
    else:
        ok(str(s.relative_to(REPO)))

print("\n2. embedded python heredocs")
found_any = False
for s in shells:
    src = s.read_text()
    for i, block in enumerate(HEREDOC_RE.findall(src)):
        found_any = True
        try:
            ast.parse(block)
            ok(f"{s.relative_to(REPO)} heredoc #{i + 1}")
        except SyntaxError as e:
            fail(f"{s.relative_to(REPO)} heredoc #{i + 1}: {e}")
if not found_any:
    print("  (none found)")

print("\n3. python modules")
for m in sorted(BENCH.rglob("*.py")):
    if "__pycache__" in m.parts:
        continue
    try:
        with tempfile.NamedTemporaryFile(suffix=".pyc") as tf:
            py_compile.compile(str(m), cfile=tf.name, doraise=True)
        ok(str(m.relative_to(REPO)))
    except py_compile.PyCompileError as e:
        fail(f"{m.relative_to(REPO)}: {e}")

print("\n4. invariants")
gpu = (BENCH / "lib" / "gpu.sh").read_text()
run = (BENCH / "path_e" / "run_path_e.sh").read_text()
harness = (BENCH / "path_e" / "bench_path_e.py").read_text()

checks = [
    (gpu, "gpu_cold_calibrate()", "gpu.sh defines gpu_cold_calibrate"),
    (gpu, 'GPU_COLD_C="${GPU_COLD_C:-}"', "cold gate defaults to calibrated, not hardcoded"),
    (gpu, "GPU_COLD_MARGIN_C", "cold margin is configurable"),
    (run, "gpu_cold_calibrate", "driver calibrates the cold gate"),
    (run, "unloading any resident models before cell 1", "driver unloads before cell 1"),
    (run, "gpu_watch_start", "driver starts the thermal watcher"),
    (run, "gpu_guard", "driver runs the start-temperature guard"),
    (harness, "gpu_before_warmup", "harness records pre-warmup temperature"),
    (harness, '"code": PROMPT_DIR / "code.txt"', "code task is registered"),
]
for src, needle, desc in checks:
    (ok if needle in src else fail)(desc)

# The unload must precede calibration, or the floor is measured on a hot card.
if run.index("gpu_unload_all") < run.index("gpu_cold_calibrate"):
    ok("unload happens before cold-gate calibration")
else:
    fail("gpu_cold_calibrate runs BEFORE the initial unload - floor would be measured hot")

# Every cell id must be unique and every referenced prompt must exist.
sys.path.insert(0, str(BENCH / "path_e"))
import bench_path_e as bpe  # noqa: E402

ids = [c[0] for c in bpe.CELLS]
if len(ids) == len(set(ids)):
    ok(f"{len(ids)} cell ids, all unique")
else:
    dupes = {i for i in ids if ids.count(i) > 1}
    fail(f"duplicate cell ids: {sorted(dupes)}")

for cid, _role, _model, tasks, *_ in bpe.CELLS:
    for t in tasks:
        if t not in bpe.TASKS:
            fail(f"{cid} references unknown task {t!r}")
        elif not bpe.TASKS[t].exists():
            fail(f"{cid} task {t!r} has no prompt file at {bpe.TASKS[t]}")
for t, p in bpe.TASKS.items():
    (ok if p.exists() else fail)(f"prompt exists: {t} -> {p.relative_to(REPO)}")

for cid, role, *_ in bpe.CELLS:
    if role not in bpe.SAMPLING:
        fail(f"{cid} uses role {role!r} with no sampling preset")

# Gold coverage: every task must have a gold answer, or it cannot be scored.
for t in bpe.TASKS:
    g = BENCH / "gold" / f"{t}.md"
    (ok if g.exists() else fail)(f"gold exists: {g.relative_to(REPO)}")

print()
if failures:
    print(f"{len(failures)} FAILURE(S)")
    sys.exit(1)
print("all checks passed")
