#!/usr/bin/env python3
"""Measure generation throughput directly against Ollama, outside the agent loop.

WHY THIS EXISTS SEPARATELY FROM THE BASELINE MATRIX
---------------------------------------------------
ADR-010 needs tok/s to compare `qwen3.6:27b` against `qwen3.6:27b-mtp-q4_K_M`, but the baseline
harness cannot supply it: Ollama through litellm reports `completion_tokens: 0` on every call in the
conversation event log, so no token count survives the agent loop. Even if it did, wall-clock in an
agent run is dominated by tool calls, file I/O and retries after malformed tool-call JSON — not by
generation. Those are two different questions and they get two different instruments:

    the matrix  -> does the model DO THE TASK        (acceptance)
    this script -> how fast does it GENERATE         (throughput)

Ollama's own `/api/generate` returns `eval_count` and `eval_duration` per request, which is the
honest measurement. Under multi-token prediction `eval_count` counts ACCEPTED tokens, so
eval_count/eval_duration is exactly the speedup MTP is claimed to deliver.

THERMAL DISCIPLINE (standing operator rule)
-------------------------------------------
Any script that drives the LLM monitors GPU temperature. Redline is 88C; this aborts at 83C and
waits for the card to reach 45C before each cell so no cell is measured on a hot start.

Usage:
  python3 bench_mtp.py --models qwen3.6:27b,qwen3.6:27b-mtp-q4_K_M --reps 3
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROMPTS = HERE / "prompts"
OUT_ROOT = Path.home() / ".oh-gui" / "bench_mtp"

GPU_MAX_C = 83     # abort
GPU_COLD_C = 45    # start-of-cell gate, raised from 36 on operator instruction
GPU_WARN_C = 80

# Ollama Modelfile params govern (ADR-009): temperature 1, top_p 0.95, top_k 20, min_p 0,
# presence_penalty 1.5. We pin them explicitly so a Modelfile change cannot silently move the
# baseline, and set seed for run-to-run stability. num_predict is capped so a runaway generation
# cannot skew a cell — a truncated generation still yields a valid tok/s.
SAMPLING = {"temperature": 1.0, "top_p": 0.95, "top_k": 20, "min_p": 0.0,
            "presence_penalty": 1.5, "repeat_penalty": 1.0, "num_ctx": 32768,
            "num_predict": 1024, "seed": 1}


def gpu_temp_c() -> int | None:
    """Edge temperature. On RTX 50 only the core reading is trustworthy — fan reads 0% while
    physically spinning, so it is never consulted."""
    exe = shutil.which("nvidia-smi")
    if not exe:
        return None
    try:
        out = subprocess.run([exe, "--query-gpu=temperature.gpu", "--format=csv,noheader"],
                             capture_output=True, text=True, timeout=10).stdout.strip()
        return int(out.splitlines()[0])
    except Exception:
        return None


def wait_cold(target: int = GPU_COLD_C, limit_s: int = 240) -> dict:
    t0 = time.time()
    first = gpu_temp_c()
    while True:
        t = gpu_temp_c()
        if t is None or t <= target or time.time() - t0 > limit_s:
            return {"start_c": first, "end_c": t, "waited_s": round(time.time() - t0, 1),
                    "timed_out": bool(t is not None and t > target)}
        time.sleep(2)


def post(url: str, payload: dict, timeout: int = 1800) -> dict:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def unload(model: str, host: str) -> None:
    """Free VRAM between models. Two 18-23 GB models will not co-reside in 32 GB."""
    try:
        post(f"{host}/api/generate", {"model": model, "prompt": "", "keep_alive": 0}, timeout=120)
    except Exception:
        pass


def run_cell(model: str, task: str, rep: int, host: str) -> dict:
    prompt = (PROMPTS / f"{task}.txt").read_text()
    cold = wait_cold()
    peak = [gpu_temp_c() or 0]

    t0 = time.time()
    try:
        r = post(f"{host}/api/generate",
                 {"model": model, "prompt": prompt, "stream": False,
                  "options": SAMPLING, "keep_alive": "5m"})
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return {"model": model, "task": task, "rep": rep, "error": str(e)}
    wall = time.time() - t0
    t_after = gpu_temp_c() or 0
    peak.append(t_after)

    ev_n, ev_ns = r.get("eval_count"), r.get("eval_duration")
    pp_n, pp_ns = r.get("prompt_eval_count"), r.get("prompt_eval_duration")
    # None, never 0, when the runtime did not report it — a missing count is not zero tokens.
    gen_tps = round(ev_n / (ev_ns / 1e9), 2) if ev_n and ev_ns else None
    pre_tps = round(pp_n / (pp_ns / 1e9), 2) if pp_n and pp_ns else None

    return {
        "model": model, "task": task, "rep": rep,
        "ts_utc": datetime.now(timezone.utc).isoformat(),
        "wall_s": round(wall, 2),
        "eval_count": ev_n, "eval_duration_s": round(ev_ns / 1e9, 3) if ev_ns else None,
        "gen_tok_per_s": gen_tps,
        "prompt_eval_count": pp_n, "prefill_tok_per_s": pre_tps,
        "load_duration_s": round(r.get("load_duration", 0) / 1e9, 3) or None,
        "response_chars": len(r.get("response") or ""),
        "gpu": {"cold_gate": cold, "temp_after_c": t_after,
                "peak_seen_c": max(x for x in peak if x),
                "over_warn": bool(t_after >= GPU_WARN_C),
                "over_ceiling": bool(t_after >= GPU_MAX_C)},
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True, help="comma-separated ollama tags")
    ap.add_argument("--tasks", default="short_gen,long_gen,prefill_heavy")
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--host", default="http://localhost:11434")
    a = ap.parse_args()

    models = [m.strip() for m in a.models.split(",") if m.strip()]
    tasks = [t.strip() for t in a.tasks.split(",") if t.strip()]
    for t in tasks:
        if not (PROMPTS / f"{t}.txt").exists():
            print(f"no prompt file for task {t!r}", file=sys.stderr)
            return 2

    out = OUT_ROOT / datetime.now().strftime("%Y%m%d_%H%M_run")
    out.mkdir(parents=True, exist_ok=True)
    print(f"output: {out}")

    for model in models:
        for task in tasks:
            for rep in range(1, a.reps + 1):
                cid = f"{model.replace(':', '_').replace('/', '_')}__{task}__r{rep}"
                print(f"  {cid} ...", flush=True)
                rec = run_cell(model, task, rep, a.host)
                (out / f"{cid}.json").write_text(json.dumps(rec, indent=2))
                if rec.get("error"):
                    print(f"    ERROR {rec['error']}")
                    continue
                g = rec["gpu"]
                if g["over_ceiling"]:
                    print(f"    ABORT: {g['temp_after_c']}C at or over the {GPU_MAX_C}C ceiling")
                    return 1
                print(f"    gen {rec['gen_tok_per_s']} tok/s over {rec['eval_count']} tokens, "
                      f"prefill {rec['prefill_tok_per_s']} tok/s, {rec['wall_s']}s, "
                      f"{g['temp_after_c']}C")
        unload(model, a.host)

    print(f"\ndone: {out}\nsummarise with:  python3 {HERE / 'summarize_mtp.py'} {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
