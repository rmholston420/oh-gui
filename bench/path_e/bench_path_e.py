#!/usr/bin/env python3
"""Path E - quality bench for the OH-GUI planner and coder roles.

Runs ONE cell per invocation and writes exactly one JSON file. Never overwrites.
Invoked by run_path_e.sh, which owns the thermal guard and the run directory.

Why Ollama's NATIVE /api/chat and not /v1/chat/completions
----------------------------------------------------------
The OpenAI-compatible endpoint silently DROPS the `options` object. `num_ctx` would fall
back to the server default of 65536, so every 131072-context planner cell would quietly
measure a different context than the one it claims. The native endpoint also returns
`prompt_eval_count`/`prompt_eval_duration` and `eval_count`/`eval_duration`, giving exact
prefill and decode throughput instead of a wall-clock estimate. This is a deliberate
deviation from the `local-llm-bench` skeleton, which assumes an OpenAI-shaped endpoint.

Sampling comes from bench/SAMPLING.md, which derives from the Qwen model cards. It is
PER-ROLE, never per-model shorthand, and is always sent explicitly - Ollama's baked
defaults for qwen3.6 are a mix of two different official modes and match no published
recommendation.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PROMPT_DIR = REPO / "bench" / "prompts"
ENDPOINT = os.environ.get("OLLAMA_ENDPOINT", "http://localhost:11434")

# Some models emit a think block even when asked not to. Strip before scoring.
THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL)

# Below this, a tok/s figure is first-token latency wearing a throughput costume.
# This floor exists because an earlier probe reported 0.6 vs 85.8 tok/s off eval_count=2.
MIN_VALID_TOKENS = 64

TASKS = {
    "debug": PROMPT_DIR / "debug.txt",
    "arch": PROMPT_DIR / "arch.txt",
    "plan": PROMPT_DIR / "plan.txt",
}

# Per-role sampling. See bench/SAMPLING.md.
SAMPLING = {
    # Qwen3.6 thinking, general - for open-ended architecture and planning.
    "planner": dict(temperature=1.0, top_p=0.95, top_k=20, min_p=0.0,
                    presence_penalty=0.0, repeat_penalty=1.0),
    # Qwen3.6 thinking, precise coding - for the debug task.
    "precise": dict(temperature=0.6, top_p=0.95, top_k=20, min_p=0.0,
                    presence_penalty=0.0, repeat_penalty=1.0),
    # Qwen3-Coder card. No thinking mode.
    "coder": dict(temperature=0.7, top_p=0.8, top_k=20, min_p=0.0,
                  presence_penalty=0.0, repeat_penalty=1.05),
    # Mistral's published recommendation for Devstral. A justified per-model deviation,
    # not a role default - Devstral is not a Qwen model and the Qwen presets do not apply.
    "devstral": dict(temperature=0.15, top_p=0.95, top_k=20, min_p=0.0,
                     presence_penalty=0.0, repeat_penalty=1.0),
}

# (cell_id, role, model_id, tasks, num_ctx, think, num_predict)
#
# num_predict for thinking cells is 16384, NOT 8192. Run 20260808_0531 showed the
# reasoning trace alone consumes ~7.4k tokens on the debug task, so an 8192 budget left
# nothing for the answer: c04 and c05 hit the ceiling mid-thought and emitted no
# conclusion at all. The budget must cover reasoning PLUS answer, not just the answer.
#
# Ordering rationale: all cells are Ollama, which hot-swaps models, so ordering is by
# model to minimise load churn rather than by role. The 35b MTP/base parity pair sits
# adjacent so any drift between them is not confounded by everything else in between.
#
# 131072 for planner-capable models: the Qwen3.6 card advises keeping context >=128K to
# preserve thinking capability, and the measured envelope allows it.
# 65536 for the coders: qwen3-coder:30b tops out at 65536 (110 KB/token KV) and Devstral
# at 65536 (152 KB/token, the worst of the field).
CELLS = [
    ("c01_planner_ollama_qwen36_27b",    "planner",  "qwen3.6:27b",
     ["arch", "plan"], 131072, True,  16384),
    ("c02_precise_ollama_qwen36_27b",    "precise",  "qwen3.6:27b",
     ["debug"],        131072, True,  16384),
    ("c03_planner_ollama_qwen36_35bmtp", "planner",  "qwen3.6:35b-a3b-mtp-q4_K_M",
     ["arch", "plan"], 131072, True,  16384),
    ("c04_precise_ollama_qwen36_35bmtp", "precise",  "qwen3.6:35b-a3b-mtp-q4_K_M",
     ["debug"],        131072, True,  16384),
    # Parity check: is the MTP build behaviourally equivalent to the base 35b on the same
    # task? The VRAM sweep showed MTP is smaller at every context; speed is UNMEASURED.
    ("c05_precise_ollama_qwen36_35bbase", "precise", "qwen3.6:35b",
     ["debug"],        131072, True,  16384),
    # All Hands recommends qwen3.6-35b-a3b as the first local model for OpenHands, so the
    # 35b must be judged on coder work too, not only planning. c04/c05 cover that.
    ("c06_coder_ollama_qwen3coder30b",   "coder",    "qwen3-coder:30b",
     ["debug"],         65536, False, 4096),
    ("c07_coder_ollama_devstral",        "devstral",
     "hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL",
     ["debug"],         65536, False, 4096),
]

CELL_BY_ID = {c[0]: c for c in CELLS}


def http_post(path: str, payload: dict, timeout: int = 3600):
    req = urllib.request.Request(
        f"{ENDPOINT}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read().decode())
    return data, time.time() - t0


def gpu_snapshot() -> dict:
    """Temperature and power at the moment a task finishes.

    Recorded per task, not only per run: a cell that ran hot is a cell whose timing is
    suspect, and the run-level thermal CSV cannot be attributed to individual tasks.
    """
    try:
        out = subprocess.run(
            ["nvidia-smi",
             "--query-gpu=temperature.gpu,power.draw,clocks.sm,utilization.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=15, check=True).stdout.strip()
        t, p, sm, u = [x.strip() for x in out.split(",")]
        return {"temp_c": int(float(t)), "power_w": float(p),
                "sm_mhz": int(float(sm)), "util_pct": int(float(u))}
    except Exception as e:                                   # never fail a cell on this
        return {"error": str(e)}


def warmup(model: str, num_ctx: int) -> dict:
    """Load the model and allocate its KV cache BEFORE anything is timed.

    Without this, the cold weight load lands inside `prompt_eval_duration` and prefill
    throughput becomes a disk-speed measurement. In run 20260808_0531 two near-identical
    35b builds reported 4820 vs 3360 tok/s prefill on an identical prompt - a 43% spread
    that no property of the models explains - and Devstral reported 194 tok/s while
    pulling 13.5 GB off disk. Every prefill figure in that run was invalid.
    """
    t0 = time.time()
    try:
        http_post("/api/chat", {
            "model": model,
            "messages": [{"role": "user", "content": "ok"}],
            "stream": False, "think": False,
            "options": {"num_ctx": num_ctx, "num_predict": 1},
        }, timeout=900)
        return {"ok": True, "load_seconds": round(time.time() - t0, 2)}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}",
                "load_seconds": round(time.time() - t0, 2)}


def run_task(model: str, role: str, task: str, num_ctx: int, think: bool,
             num_predict: int) -> dict:
    prompt = TASKS[task].read_text()
    sampling = dict(SAMPLING[role])
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "think": think,
        "options": {"num_ctx": num_ctx, "num_predict": num_predict, **sampling},
    }
    try:
        resp, wall = http_post("/api/chat", payload)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return {"task": task, "error": f"{type(e).__name__}: {e}"}

    msg = resp.get("message", {}) or {}
    raw = msg.get("content", "") or ""
    # Ollama returns reasoning in a separate `thinking` field when think=true, but some
    # builds still inline <think> tags. Handle both; never score either.
    thinking = msg.get("thinking", "") or ""
    stripped = THINK_RE.sub("", raw).strip()
    inline_think = raw != stripped

    ev = resp.get("eval_count", 0) or 0
    ed = resp.get("eval_duration", 0) or 0            # nanoseconds
    pe = resp.get("prompt_eval_count", 0) or 0
    pd = resp.get("prompt_eval_duration", 0) or 0

    return {
        "task": task,
        "done_reason": resp.get("done_reason"),
        "wall_seconds": round(wall, 2),
        "prompt_tokens": pe,
        "prefill_tok_s": round(pe / (pd / 1e9), 1) if pd else None,
        "output_tokens": ev,
        "decode_tok_s": round(ev / (ed / 1e9), 2) if ed else None,
        "total_duration_s": round((resp.get("total_duration", 0) or 0) / 1e9, 2),
        # A cell that generated almost nothing has no interpretable throughput and
        # nothing worth scoring. Flag it loudly rather than averaging it in.
        "valid": ev >= MIN_VALID_TOKENS and len(stripped) > 0
                 and resp.get("done_reason") != "length",
        "validity_note": (
            f"INVALID: only {ev} tokens generated (floor {MIN_VALID_TOKENS})"
            if ev < MIN_VALID_TOKENS else
            "INVALID: budget consumed by reasoning, no answer emitted"
            if len(stripped) == 0 else
            "INVALID: truncated at num_predict - answer is incomplete"
            if resp.get("done_reason") == "length" else None),
        "think_requested": think,
        "thinking_chars": len(thinking),
        "inline_think_tags_stripped": inline_think,
        # Empirical answer to the open question in SAMPLING.md: does Ollama's `think`
        # field actually work on qwen3.6? If think=False and either channel carries
        # reasoning, it does not.
        "think_flag_honored": None if think else (len(thinking) == 0 and not inline_think),
        "gpu_at_finish": gpu_snapshot(),
        # A cell can burn its whole budget reasoning and emit no answer at all. That is an
        # INVALID cell, not a low-scoring one - c04/c05 of run 20260808_0531 did exactly
        # this, producing ~29k characters of reasoning and no conclusion.
        "answer_empty": len(stripped) == 0,
        "content_stripped": stripped,
        "content_stripped_chars": len(stripped),
        "content_raw_chars": len(raw),
        "thinking_raw": thinking,
    }


def run_cell(cell_id: str, out_dir: Path) -> Path:
    cell_id_, role, model, tasks, num_ctx, think, num_predict = CELL_BY_ID[cell_id]
    dest = out_dir / f"{cell_id}.json"
    if dest.exists():
        print(f"REFUSING to overwrite {dest}", file=sys.stderr)
        sys.exit(2)

    # Recorded, not just printed: if a cell started hot the driver's cool-wait timed out,
    # and that cell's timings are not comparable with the rest of the matrix.
    wu = warmup(model, num_ctx)
    if not wu["ok"]:
        print(f"   WARMUP FAILED: {wu['error']}")
    else:
        print(f"   warmup/load {wu['load_seconds']}s")
    start_gpu = gpu_snapshot()
    print(f"-- {cell_id}  model={model} role={role} ctx={num_ctx} think={think} "
          f"start={start_gpu.get('temp_c','?')}C")
    results = []
    for task in tasks:
        print(f"   task={task} ... ", end="", flush=True)
        r = run_task(model, role, task, num_ctx, think, num_predict)
        if "error" in r:
            print(f"ERROR {r['error']}")
        else:
            flag = "" if r["valid"] else "  <-- INVALID"
            print(f"{r['output_tokens']} tok  {r['decode_tok_s']} tok/s  "
                  f"prefill {r['prefill_tok_s']} tok/s  "
                  f"{r['gpu_at_finish'].get('temp_c','?')}C{flag}")
        results.append(r)

    rec = {
        "cell_id": cell_id, "role": role, "model_id": model, "runtime": "ollama",
        "endpoint": f"{ENDPOINT}/api/chat", "num_ctx": num_ctx,
        "think": think, "num_predict": num_predict,
        "sampling": SAMPLING[role],
        "power_cap_w": os.environ.get("BENCH_POWER_CAP_W", "435"),
        "warmup": wu,
        "gpu_at_start": start_gpu,
        "cold_start_target_c": int(os.environ.get("GPU_COLD_C", "40")),
        "cold_start_ok": (start_gpu.get("temp_c", 999)
                          <= int(os.environ.get("GPU_COLD_C", "40"))),
        "ts_utc": datetime.now(timezone.utc).isoformat(),
        "results": results,
    }
    dest.write_text(json.dumps(rec, indent=2))
    print(f"   -> {dest}")
    return dest


def main() -> None:
    ap = argparse.ArgumentParser(description="Path E quality bench - one cell per call.")
    ap.add_argument("cell", help="cell id, or 'list' to print the matrix")
    ap.add_argument("--out", required=False, help="run directory (set by run_path_e.sh)")
    args = ap.parse_args()

    if args.cell == "list":
        for c in CELLS:
            print(f"{c[0]:38s} role={c[1]:9s} ctx={c[4]:<7d} think={str(c[5]):5s} "
                  f"tasks={','.join(c[3])}  {c[2]}")
        return

    if args.cell not in CELL_BY_ID:
        sys.exit(f"unknown cell: {args.cell}")

    for task in CELL_BY_ID[args.cell][3]:
        if not TASKS[task].exists():
            sys.exit(f"missing prompt file: {TASKS[task]}")

    out_dir = Path(args.out) if args.out else \
        Path.home() / ".oh-gui" / "bench_path_e" / f"{datetime.now():%Y%m%d_%H%M}_run"
    out_dir.mkdir(parents=True, exist_ok=True)
    run_cell(args.cell, out_dir)


if __name__ == "__main__":
    main()
