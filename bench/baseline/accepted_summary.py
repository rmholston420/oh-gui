#!/usr/bin/env python3
"""One-line acceptance roll-up per model block, printed at the end of the matrix.

`accepted` means the task's own gate passed AND nothing pre-existing broke. It is deliberately the
only headline number: in the first matrix, 15 of 16 cells reported passing tests while one of them
had changed zero files.
"""
import json
import sys
from pathlib import Path


def main() -> int:
    d, prof = Path(sys.argv[1]), sys.argv[2]
    rows = []
    for f in sorted(d.glob("t*.summary.json")):
        a = json.loads(f.read_text()).get("automated") or {}
        rows.append((f.name.split(".")[0], bool(a.get("accepted")),
                     a.get("acceptance_gate"), a.get("fixture_tests")))
    if not rows:
        print(f"  {prof}: no cell summaries in {d}")
        return 0
    acc = [t for t, ok, *_ in rows if ok]
    print(f"  {prof}: {len(acc)}/{len(rows)} accepted" + (f" — {', '.join(acc)}" if acc else ""))
    for t, ok, gate, tests in rows:
        if not ok:
            print(f"      {t}: gate={gate} regression={'none' if tests == 'pass' else tests}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
