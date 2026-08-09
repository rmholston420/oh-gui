#!/usr/bin/env python3
"""Re-grade a completed run from its persisted responses. Zero GPU, zero network.

Every replicate stores the assistant `tool_calls` verbatim, so a change to the grading predicate
does not require re-spending GPU time on the same responses. This exists because the 2026-08-09
amendment (ADR-016) reclassified argument errors from unmeasurable to measured, and the screening
run was worth rescoring rather than rerunning.

Writes `<run>/regraded/` beside the originals and never mutates a captured replicate.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from grading import grade_message  # noqa: E402
from tasks import load_tasks  # noqa: E402

GREEN, RED, YELLOW, DIM, OFF = "\033[1;32m", "\033[1;31m", "\033[1;33m", "\033[2m", "\033[0m"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path, nargs="?",
                    help="run directory; defaults to the newest run that actually contains the "
                         "requested mode. Picking the newest directory outright selects an aborted "
                         "stage that never wrote a replicate.")
    ap.add_argument("--mode", default="screen")
    args = ap.parse_args()

    if args.run_dir is None:
        root = Path.home() / ".oh-gui" / "bench_toolcall"
        candidates = [d for d in sorted(root.glob("*/"), reverse=True)
                      if any(d.glob(f"{args.mode}__cell-*.json"))]
        if not candidates:
            print(f"{RED}no run under {root} contains {args.mode} replicates{OFF}", file=sys.stderr)
            return 1
        args.run_dir = candidates[0]
        print(f"{DIM}run: {args.run_dir}{OFF}")

    by_id = {task["id"]: task for task in load_tasks()}
    files = sorted(args.run_dir.glob(f"{args.mode}__cell-*.json"))
    if not files:
        print(f"{RED}no {args.mode} replicates in {args.run_dir}{OFF}", file=sys.stderr)
        return 1

    out_dir = args.run_dir / "regraded"
    out_dir.mkdir(exist_ok=True)
    print(f"{DIM}re-grading {len(files)} replicate file(s) -> {out_dir}{OFF}\n")
    print(f"  {'cell':<6} {'model':<52} {'was':>7} {'now':>7} {'measured':>9} {'dropped':>8}")

    rows = []
    for path in files:
        record = json.loads(path.read_text())
        results = record["results"]
        old_accepted = sum(r["accepted"] for r in results)
        old_measured = sum(r["resolved"] is not None for r in results)
        for result in results:
            task = by_id.get(result["task_id"])
            if task is None:
                continue
            calls = result.get("tool_calls")
            message = None if calls is None and result.get("content_raw") is None else {
                "content": result.get("content_stripped") or "",
                "tool_calls": calls,
            }
            result.update(grade_message(task, message))
        new_accepted = sum(r["accepted"] for r in results)
        measured = sum(r["resolved"] is not None for r in results)
        record["regraded"] = {"predicate": "ADR-016 amendment 2026-08-09", "source": path.name}
        (out_dir / path.name).write_text(json.dumps(record, indent=2) + "\n")

        old_rate = old_accepted / old_measured if old_measured else 0.0
        new_rate = new_accepted / measured if measured else 0.0
        colour = RED if new_rate < old_rate - 0.02 else (GREEN if measured > old_measured else YELLOW)
        rows.append((record["cell_id"], new_rate, measured, len(results)))
        print(f"  {record['cell_id']:<6} {record['model'][:52]:<52} "
              f"{old_rate * 100:6.1f}% {colour}{new_rate * 100:6.1f}%{OFF} "
              f"{measured:>6}/{len(results):<3} {len(results) - measured:>8}")

    rows.sort(key=lambda row: row[1], reverse=True)
    print(f"\n{GREEN}ranking on the amended predicate (screening only — not a verdict){OFF}")
    for rank, (cell, rate, measured, total) in enumerate(rows, 1):
        # Coverage is printed next to every rate and low coverage is called out, because a rate
        # computed on a subset the model selected for itself is not comparable to one computed on
        # the whole set. lfm2.5:8b ranked first on 4 of 40 tasks before the second amendment.
        coverage = measured / total if total else 0.0
        flag = "" if coverage >= 0.90 else (
            f"  {RED}<- {coverage * 100:.0f}% coverage: not comparable{OFF}")
        print(f"  {rank}. cell {cell}  {rate * 100:5.1f}%  ({measured}/{total} measured){flag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
