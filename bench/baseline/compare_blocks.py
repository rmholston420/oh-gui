#!/usr/bin/env python3
"""Compare model blocks against each other — the question ADR-008 and ADR-010 actually ask.

`report.py` describes one block. Nothing until now put two side by side, so the verdict would have
been eyeballed across two markdown files. This prints one table per task and one summary row per
model, and it refuses to declare a winner on speed when the models are not speed-comparable.

MTP parity (ADR-010): `qwen3.6:27b` has no multi-token-prediction heads and
`qwen3.6:35b-a3b-mtp-q4_K_M` does, so a throughput comparison between them is rigged. Any pair
where exactly one side is an MTP tag is flagged and its speed comparison suppressed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from conversation_errors import harvest  # noqa: E402


def is_mtp(profile: str) -> bool:
    return "mtp" in profile.lower()


def load_block(run_dir: Path) -> dict:
    profile = run_dir.name.split("_", 2)[-1].removesuffix("_run")
    cells = {}
    for p in sorted(run_dir.glob("*.summary.json")):
        s = json.loads(p.read_text())
        a = s.get("automated") or {}
        h = s.get("agent_error_events") or harvest(a.get("conversation_id"))
        cells[s["task"]] = {
            "accepted": a.get("accepted"),
            "gate": a.get("acceptance_gate"),
            "tests": a.get("fixture_tests"),
            "turns": s.get("total_turns"),
            "files": a.get("files_changed"),
            "lines": a.get("lines_written"),
            "idle_s": a.get("submit_to_idle_s"),
            "errors": (h or {}).get("agent_errors"),
        }
    return {"profile": profile, "dir": run_dir, "cells": cells, "mtp": is_mtp(profile)}


def _n(v, suffix=""):
    return "?" if v is None else f"{v}{suffix}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dirs", nargs="+", type=Path)
    a = ap.parse_args()

    blocks = [load_block(d) for d in a.run_dirs if d.is_dir()]
    if len(blocks) < 2:
        print("need at least two run directories to compare")
        return 2
    tasks = sorted({t for b in blocks for t in b["cells"]})

    print("# Baseline block comparison\n")
    print("## Acceptance by task\n")
    print("| Task | " + " | ".join(b["profile"] for b in blocks) + " |")
    print("|---" * (len(blocks) + 1) + "|")
    for t in tasks:
        row = []
        for b in blocks:
            c = b["cells"].get(t)
            if not c:
                row.append("—")
            elif c["accepted"]:
                row.append("**yes**")
            elif c["gate"] in ("no-venv", "no-gate") or c["files"] == 0:
                row.append(f"UNKNOWN ({c['gate'] or 'no files'})")
            else:
                row.append(f"no ({c['gate']}/{c['tests']})")
        print(f"| {t} | " + " | ".join(row) + " |")

    print("\n## Per model\n")
    print("| Model | Accepted | Turns | Lines | Wall to idle | Tool errors | MTP |")
    print("|---|---:|---:|---:|---:|---:|:--:|")
    for b in blocks:
        cs = list(b["cells"].values())
        acc = sum(1 for c in cs if c["accepted"])
        def total(k):
            vals = [c[k] for c in cs if c[k] is not None]
            return sum(vals) if vals else None
        print(f"| {b['profile']} | {acc}/{len(cs)} | {_n(total('turns'))} | "
              f"{_n(total('lines'))} | {_n(total('idle_s'), ' s')} | "
              f"{_n(total('errors'))} | {'yes' if b['mtp'] else 'no'} |")

    mtp = [b["profile"] for b in blocks if b["mtp"]]
    plain = [b["profile"] for b in blocks if not b["mtp"]]
    print()
    if mtp and plain:
        print(f"**Speed comparison suppressed across the MTP boundary (ADR-010).** "
              f"{', '.join(mtp)} {'has' if len(mtp) == 1 else 'have'} multi-token-prediction heads; "
              f"{', '.join(plain)} {'does' if len(plain) == 1 else 'do'} not. Wall-clock differences "
              f"between those groups are not a model comparison. Compare within a group: "
              f"{' vs '.join(mtp) if len(mtp) > 1 else '(only one MTP block present)'}.")
    elif len(mtp) > 1:
        print("All blocks are MTP variants — speed is comparable between them.")
    else:
        print("No MTP variants present — speed is comparable between all blocks.")

    print("\n**Wall-clock is not throughput.** Time to idle is dominated by tool calls, file I/O "
          "and retries after malformed tool-call JSON, not by generation speed. Nothing in this "
          "harness counts tokens, so no tok/s figure appears here and none should be quoted from it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
