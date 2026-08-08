#!/usr/bin/env python3
"""Aggregate baseline task records into the Phase 0 baseline metrics report.

Reads every `*.summary.json` and `*.thermal.csv` in a run directory and emits markdown.

Deliberately does no interpretation. It reports what was recorded, marks what was not recorded as
absent rather than zero, and refuses to average across tasks that were abandoned. A baseline whose
gaps are papered over is worse than one with visible holes, because the holes are where Phase 1
comparisons will silently mislead.
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
from datetime import datetime
from pathlib import Path


def load_thermal(path: Path) -> dict:
    if not path.exists():
        return {}
    temps, powers, throttled = [], [], False
    with path.open() as fh:
        for row in csv.DictReader(fh):
            try:
                temps.append(int(row["temp_c"]))
                powers.append(float(row["power_w"]))
            except (ValueError, KeyError, TypeError):
                continue
            # "pcap_thermal" is a two-digit flag: first power-cap, second thermal slowdown.
            # Only the second invalidates a timing comparison.
            flag = (row.get("pcap_thermal") or "").strip()
            if len(flag) == 2 and flag[1] == "1":
                throttled = True
    if not temps:
        return {}
    return {
        "samples": len(temps),
        "temp_max_c": max(temps),
        "temp_mean_c": round(statistics.fmean(temps), 1),
        "power_max_w": round(max(powers), 1) if powers else None,
        "power_mean_w": round(statistics.fmean(powers), 1) if powers else None,
        "thermally_throttled": throttled,
    }


def fmt(v, suffix: str = "") -> str:
    if v is None:
        return "—"
    if isinstance(v, bool):
        return "yes" if v else "no"
    return f"{v}{suffix}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    summaries = sorted(args.run_dir.glob("*.summary.json"))
    if not summaries:
        print(f"no *.summary.json in {args.run_dir}")
        return 1

    rows = []
    for p in summaries:
        s = json.loads(p.read_text())
        s["thermal"] = load_thermal(args.run_dir / f"{s['task']}.thermal.csv")
        models = args.run_dir / f"{s['task']}.ollama_ps.tsv"
        s["models_observed"] = sorted(
            {
                part.split()[0]
                for line in models.read_text().splitlines()
                for part in line.split("\t")[-1].split(";")
                if part.strip()
            }
        ) if models.exists() else []
        rows.append(s)

    completed = [r for r in rows if r["outcome"] == "completed"]

    def agg(key, fn=statistics.fmean, nd=1):
        vals = [r[key] for r in completed if r.get(key) is not None]
        return round(fn(vals), nd) if vals else None

    L = []
    L.append("# Phase 0 Baseline Metrics Report")
    L.append("")
    L.append(f"**Run directory:** `{args.run_dir}`  ")
    L.append(f"**Generated:** {datetime.now().astimezone().strftime('%Y-%m-%d %H:%M %Z')}  ")
    L.append(f"**Tasks recorded:** {len(rows)} ({len(completed)} completed, "
             f"{len(rows) - len(completed)} not)")
    L.append("")
    L.append("Required by `docs/specs/02-repo-setup.md` items 5-7. Measured against the "
             "**unmodified** stock Agent Canvas run copy, driven by hand. Every figure below is "
             "either read from git, sampled from the GPU, or marked by the operator at the moment "
             "it happened. Nothing is reconstructed after the fact.")
    L.append("")

    all_models = sorted({m for r in rows for m in r["models_observed"]})
    L.append("## Models actually resident (spec item 7)")
    L.append("")
    if all_models:
        L.append("Sampled from `ollama ps` during the runs, not read from a settings screen:")
        L.append("")
        for m in all_models:
            L.append(f"- `{m}`")
    else:
        L.append("**Not recorded.** No `ollama ps` samples were captured, so the model variant "
                 "and quantization behind these numbers is unverified and item 7 is NOT satisfied.")
    L.append("")

    L.append("## Per task (spec item 5)")
    L.append("")
    L.append("| Task | Outcome | Time to first review | Turns to acceptance | Lines accepted | "
             "…without inspection | Lost track | Peak °C | Peak W | Throttled |")
    L.append("|---|---|---:|---:|---:|---:|---:|---:|---:|---|")
    for r in rows:
        t = r["thermal"]
        L.append(
            f"| {r['task']} | {r['outcome']} | {fmt(r['time_to_first_review_s'], ' s')} | "
            f"{fmt(r['turns_to_acceptance'])} | {fmt(r['lines_accepted'])} | "
            f"{fmt(r['lines_accepted_without_inspection'])} | {fmt(r['lost_track_incidents'])} | "
            f"{fmt(t.get('temp_max_c'))} | {fmt(t.get('power_max_w'))} | "
            f"{fmt(t.get('thermally_throttled'))} |"
        )
    L.append("")

    L.append("## Aggregate over completed tasks only")
    L.append("")
    total_lines = sum(r["lines_accepted"] for r in completed)
    total_blind = sum(r["lines_accepted_without_inspection"] for r in completed)
    share = f"{100 * total_blind / total_lines:.0f}%" if total_lines else "—"
    L.append(f"- Mean time to first review: **{fmt(agg('time_to_first_review_s'), ' s')}**")
    L.append(f"- Mean turns to acceptance: **{fmt(agg('turns_to_acceptance'))}**")
    L.append(f"- Lines accepted: **{total_lines}**, of which **{total_blind}** "
             f"({share}) without inspection")
    L.append(f"- Lost-track incidents: **{sum(r['lost_track_incidents'] for r in completed)}**")
    L.append("")
    L.append("Abandoned tasks are excluded from the means and listed above with their outcome. "
             "They are the more interesting data point and must not be averaged away.")
    L.append("")

    L.append("## Mental-model formation (spec item 6)")
    L.append("")
    L.append("| Task | Turns before first corrective instruction | Encoded durably? | Instruction |")
    L.append("|---|---:|---|---|")
    any_corrective = False
    for r in rows:
        for c in r["correctives"] or [{}]:
            if not c:
                continue
            any_corrective = True
            L.append(f"| {r['task']} | {fmt(r['turns_before_first_corrective'])} | "
                     f"{fmt(c.get('encoded_durably'))} | {c.get('text', '')} |")
    if not any_corrective:
        L.append("| — | — | — | none recorded |")
    L.append("")

    L.append("## Tool-call failure signatures (08-telemetry.md 8.6)")
    L.append("")
    fails = [(r["task"], f) for r in rows for f in r["tool_failures"]]
    if fails:
        L.append("| Task | Signature | Detail |")
        L.append("|---|---|---|")
        for task, f in fails:
            L.append(f"| {task} | {f.get('signature','')} | {f.get('text','')} |")
    else:
        L.append("None recorded.")
    L.append("")

    notes = [(r["task"], n) for r in rows for n in r["notes"] if n]
    if notes:
        L.append("## Operator notes")
        L.append("")
        for task, n in notes:
            L.append(f"- **{task}** — {n}")
        L.append("")

    text = "\n".join(L) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
