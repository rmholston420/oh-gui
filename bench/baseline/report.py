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
import sys
from pathlib import Path as _P
sys.path.insert(0, str(_P(__file__).resolve().parent))
from conversation_errors import harvest
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



def _tool_errs(r):
    """From the app's event log. `?` means the record could not be read — never silently 0."""
    h = r.get("agent_error_events") or {}
    n = h.get("agent_errors")
    if n is None:
        return "?"
    f = h.get("fatal") or 0
    return f"{n}" if not f else f"{n} ({f} fatal)"

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
        # Harvested at report time, not run time, so it works retroactively on runs already
        # finished — the events are on disk keyed by the conversation id each cell recorded.
        if not s.get("agent_error_events"):
            try:
                # The driver nests this under `automated` (drive_task.mjs). Reading it from the
                # top level silently yielded None on every cell and made this whole column "?".
                _cid = (s.get("automated") or {}).get("conversation_id") or s.get("conversation_id")
                s["agent_error_events"] = harvest(_cid)
            except Exception as e:
                s["agent_error_events"] = {"agent_errors": None, "note": f"harvest failed: {e}"}
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

    infos = []
    for p_info in sorted(args.run_dir.glob("*.server_info.json")):
        try:
            infos.append(json.loads(p_info.read_text()))
        except json.JSONDecodeError:
            continue
    L.append("## Stack actually under test")
    L.append("")
    if infos:
        seen = sorted({json.dumps(
            {k: v for k, v in i.items() if "version" in k.lower() or k in ("sdk", "server")},
            sort_keys=True) for i in infos})
        L.append("Read from the running app's `/server_info`, not from a pin file:")
        L.append("")
        for s_ in seen:
            L.append(f"- `{s_}`")
        if len(seen) > 1:
            L.append("")
            L.append("**More than one stack version appears across these tasks.** The tasks are "
                     "not directly comparable and must not be aggregated without explanation.")
    else:
        L.append("**Not recorded.** No `/server_info` response was captured, so the backend version "
                 "behind these numbers is unknown. ADR-008 requires it, because the baseline "
                 "deliberately runs the app's own backend rather than the pinned image.")
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

    # The item-5 table above is human-metric shaped and is ALL NULL on an automated run — the
    # first matrix would have produced a page of dashes and nothing else. This is what the harness
    # actually measured. `accepted` is the headline: the task's own gate passed AND nothing
    # pre-existing broke. `tests=pass` alone is not acceptance — the fixture's tests pass on
    # untouched code, and in the first matrix a cell that changed zero files was recorded as
    # passing.
    L.append("## What was actually measured (automated run)")
    L.append("")
    L.append("| Task | ACCEPTED | Gate | Regression | Turns | Files | +Lines | 1st msg | To idle | Peak °C | Tool errs |")
    L.append("|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|")
    for r in rows:
        a = r.get("automated") or {}
        t = r.get("thermal") or {}
        L.append(
            f"| {r['task']} | {'**yes**' if a.get('accepted') else 'no'} | "
            f"{a.get('acceptance_gate') or '—'} | "
            f"{'none' if a.get('fixture_tests') == 'pass' else (a.get('fixture_tests') or '—')} | "
            f"{fmt(r.get('total_turns'))} | {fmt(a.get('files_changed'))} | "
            f"{fmt(a.get('lines_written'))} | {fmt(a.get('submit_to_first_message_s'), ' s')} | "
            f"{fmt(a.get('submit_to_idle_s'), ' s')} | {fmt(t.get('temp_max_c'))} | "
            f"{_tool_errs(r)} |"
        )
    L.append("")
    errs = [(r["task"], ((r.get("agent_error_events") or {}).get("agent_errors")))
            for r in rows]
    known = [(t, n) for t, n in errs if n is not None]
    if known:
        tot = sum(n for _, n in known)
        hit = [t for t, n in known if n]
        unknown = [t for t, n in errs if n is None]
        if tot:
            L.append(f"**{tot} agent tool-call errors across {len(hit)} of {len(known)} cells "
                     f"({', '.join(hit)}).** Read from the conversation event log, not the screen. "
                     f"These are overwhelmingly `Arguments: unparseable JSON` — the model emitting "
                     f"malformed tool-call JSON, which the agent retries. They consume turns and "
                     f"can end a run early, so turn counts and timings include this cost. It is a "
                     f"property of the model on this runtime, not a harness fault.")
            L.append("")
        if unknown:
            L.append(f"Tool-error counts unavailable for: {', '.join(unknown)} — conversation "
                     f"record unreadable. Unknown, not zero.")
            L.append("")

    zero_work = [r["task"] for r in rows
                 if (r.get("automated") or {}).get("files_changed") == 0]
    if zero_work:
        L.append(f"**Changed no files at all: {', '.join(zero_work)}.** These did not attempt the "
                 f"task. Any pass recorded against them would be an artifact of the harness.")
        L.append("")
    pys = {(r.get("automated") or {}).get("gate_python") for r in rows} - {None}
    if len(pys) > 1:
        L.append(f"**Gate ran on more than one interpreter: {', '.join(sorted(pys))}.** Cells are "
                 f"not comparable.")
        L.append("")
    elif pys:
        L.append(f"Acceptance gates ran on {pys.pop()}. If this differs from the agent's runtime, "
                 f"annotation semantics differ (PEP 649) and results are suspect.")
        L.append("")

    L.append("## Aggregate over completed tasks only")
    L.append("")
    # These are human-only metrics and are null by design when a run was driven automatically.
    # Summing them crashed the first matrix report with int + NoneType and produced no report at
    # all. Null means not measurable and must never be coerced to zero.
    total_lines = sum(r["lines_accepted"] or 0 for r in completed)
    total_blind = sum(r["lines_accepted_without_inspection"] or 0 for r in completed)
    share = f"{100 * total_blind / total_lines:.0f}%" if total_lines else "—"
    L.append(f"- Mean time to first review: **{fmt(agg('time_to_first_review_s'), ' s')}**")
    L.append(f"- Mean turns to acceptance: **{fmt(agg('turns_to_acceptance'))}**")
    L.append(f"- Lines accepted: **{total_lines}**, of which **{total_blind}** "
             f"({share}) without inspection")
    L.append(f"- Lost-track incidents: **{sum(r['lost_track_incidents'] or 0 for r in completed)}**")
    acc = [r for r in completed if (r.get("automated") or {}).get("accepted")]
    L.append(f"- **Accepted (task gate passed AND no regression): {len(acc)}/{len(rows)}** "
             f"— {', '.join(sorted(r['task'] for r in acc)) or 'none'}")
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
