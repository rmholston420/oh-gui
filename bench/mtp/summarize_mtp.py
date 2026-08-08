#!/usr/bin/env python3
"""Median tok/s per model per task, plus the MTP speedup — the number ADR-010 is waiting on."""
from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    a = ap.parse_args()

    recs = [json.loads(p.read_text()) for p in sorted(a.run_dir.glob("*.json"))]
    good = [r for r in recs if not r.get("error")]
    if not good:
        print("no usable records")
        return 2

    by = defaultdict(list)
    for r in good:
        if r.get("gen_tok_per_s") is not None:
            by[(r["model"], r["task"])].append(r["gen_tok_per_s"])

    models = sorted({m for m, _ in by})
    tasks = sorted({t for _, t in by})

    print("# MTP throughput\n")
    print("Measured directly against Ollama's `/api/generate`, outside the agent loop. "
          "`eval_count / eval_duration`, which under multi-token prediction counts ACCEPTED "
          "tokens — so this is the real speedup, not a theoretical one.\n")
    print("| Task | " + " | ".join(models) + " |")
    print("|---" * (len(models) + 1) + "|")
    for t in tasks:
        cells = []
        for m in models:
            v = by.get((m, t))
            cells.append(f"{statistics.median(v):.1f} (n={len(v)})" if v else "—")
        print(f"| {t} | " + " | ".join(cells) + " |")

    # Pair each plain tag with its own MTP variant. Comparing across model SIZES here would be the
    # same mistake ADR-010 exists to prevent, so only same-base pairs are reported.
    print()
    base = lambda m: m.replace("-mtp-q4_K_M", "").replace("-mtp", "")
    pairs = [(p, m) for p in models for m in models
             if "mtp" not in p.lower() and "mtp" in m.lower() and base(p) == base(m)]
    if not pairs:
        print("**No same-base plain/MTP pair in this run — no speedup can be computed.** "
              "Comparing different model sizes here would repeat the error ADR-010 exists to stop.")
    for plain, mtp in pairs:
        print(f"**{mtp} vs {plain}**\n")
        print("| Task | plain tok/s | MTP tok/s | speedup |")
        print("|---|---:|---:|---:|")
        for t in tasks:
            a_, b_ = by.get((plain, t)), by.get((mtp, t))
            if not a_ or not b_:
                print(f"| {t} | — | — | — |")
                continue
            pa, pb = statistics.median(a_), statistics.median(b_)
            print(f"| {t} | {pa:.1f} | {pb:.1f} | **{pb / pa:.2f}x** |")
        print("\nUnsloth documents MTP at ~1.4-2.2x with no accuracy change. A measured figure "
              "outside that range is worth explaining before it is quoted.")

    temps = [r["gpu"]["temp_after_c"] for r in good if r.get("gpu")]
    if temps:
        print(f"\nPeak GPU temperature across the run: {max(temps)}C "
              f"(ceiling 83C, redline 88C).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
