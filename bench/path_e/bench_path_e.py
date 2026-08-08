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
    "code": PROMPT_DIR / "code.txt",
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

    # --- code-generation cells (added 2026-08-08) ------------------------------------
    # Run 20260808_0555 scored the coder specialists on `debug` and could say nothing
    # about them: `debug` is a diagnostic reasoning task, the coder cells ran with
    # think=False, and they emitted 1148-1575 tokens against 8905-10620 for the thinking
    # cells. That is a task mismatch being read as a capability gap. Nothing in that
    # matrix asked any model to WRITE code. These cells fix that, and are machine-scored
    # against bench/gold/code_tests.py rather than judged.
    #
    # num_predict is 8192 for the non-thinking cells, not the 4096 used by c06/c07: this
    # task requires a ~50-line module PLUS a closing commentary, and a truncated module
    # scores 0 on the test suite. A budget that can invalidate a cell is not a saving.
    ("c08_code_ollama_qwen3coder30b",     "coder",    "qwen3-coder:30b",
     ["code"],          65536, False,  8192),
    ("c09_code_ollama_devstral",          "devstral",
     "hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL",
     ["code"],          65536, False,  8192),
    # The thinking models must be measured on the same code task, or "the specialist is
    # worse" remains unfalsifiable. `precise` is the Qwen3.6 thinking coding preset.
    ("c10_code_ollama_qwen36_35bmtp",     "precise",  "qwen3.6:35b-a3b-mtp-q4_K_M",
     ["code"],         131072, True,  16384),
    ("c11_code_ollama_qwen36_27b",        "precise",  "qwen3.6:27b",
     ["code"],         131072, True,  16384),

    # --- planner replicate cells (added 2026-08-08) ----------------------------------
    # The planner verdict from run 20260808_0555 (27b 74.0 vs 35b-mtp 65.5) rests on a
    # SINGLE arch sample at temperature 1.0 / top_p 0.95, and the whole 8.5-point gap
    # comes from c03 choosing Option B in that one draw. At that sampling temperature one
    # draw is not evidence. Run each of these three times with --rep and take the median.
    ("c12_planner_arch_27b",              "planner",  "qwen3.6:27b",
     ["arch"],         131072, True,  16384),
    ("c13_planner_arch_35bmtp",           "planner",  "qwen3.6:35b-a3b-mtp-q4_K_M",
     ["arch"],         131072, True,  16384),
]

CELL_BY_ID = {c[0]: c for c in CELLS}


class OllamaError(Exception):
    """An HTTP error from Ollama, carrying the response BODY.

    `str(urllib.error.HTTPError)` is only the status line - "HTTP Error 500: Internal
    Server Error" - and discards the body, which is where Ollama puts the actual reason
    (failed KV allocation, bad option, model not found). Run 20260808_0633 recorded a bare
    500 for c12 and the cause had to be recovered from journald afterwards. Never let an
    HTTP error reach the JSON without its body.
    """


def http_post(path: str, payload: dict, timeout: int = 3600):
    req = urllib.request.Request(
        f"{ENDPOINT}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace").strip()
        except Exception:
            body = "<body unreadable>"
        try:                                   # Ollama sends {"error": "..."}
            body = json.loads(body).get("error", body)
        except Exception:
            pass
        raise OllamaError(f"HTTP {e.code} from {path}: {body[:2000]}") from None
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
             num_predict: int, sampling_name: str | None = None) -> dict:
    prompt = TASKS[task].read_text()
    # sampling_name overrides the cell's role preset. Added 2026-08-08 after run
    # 20260808_0824: `SAMPLING=precise bash run_path_e.sh c13_...` was accepted by the
    # shell, ignored by this file, and produced three cells at the planner preset that were
    # then nearly recorded as the pre-registered precise-preset test. The override is
    # explicit, validated against SAMPLING's keys, and echoed into the result JSON so no
    # future reader has to infer which preset a cell actually ran under.
    sampling = dict(SAMPLING[sampling_name or role])
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "think": think,
        "options": {"num_ctx": num_ctx, "num_predict": num_predict, **sampling},
    }
    try:
        resp, wall = http_post("/api/chat", payload)
    except (OllamaError, urllib.error.URLError, TimeoutError, OSError) as e:
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


def run_cell(cell_id: str, out_dir: Path, rep: int | None = None,
             only_tasks: list[str] | None = None,
             sampling_name: str | None = None) -> Path:
    cell_id_, role, model, tasks, num_ctx, think, num_predict = CELL_BY_ID[cell_id]
    if only_tasks:
        tasks = only_tasks
    stem = cell_id if rep is None else f"{cell_id}_r{rep}"
    dest = out_dir / f"{stem}.json"
    if dest.exists():
        print(f"REFUSING to overwrite {dest}", file=sys.stderr)
        sys.exit(2)

    # Sampled BEFORE warmup. The old code recorded start temperature only after the
    # warmup request, which itself heats the card, so `cold_start_ok` was false on every
    # cell of run 20260808_0555 and the warning it produced carried no information. The
    # cooldown had in fact worked - the run log showed 45 C reached before each cell.
    # Both are now recorded: the gate is judged on the pre-warmup reading, and the
    # post-warmup reading is kept because it is the temperature the timed work started at.
    pre_gpu = gpu_snapshot()
    wu = warmup(model, num_ctx)
    if not wu["ok"]:
        print(f"   WARMUP FAILED: {wu['error']}")
    else:
        print(f"   warmup/load {wu['load_seconds']}s")
    start_gpu = gpu_snapshot()
    eff_preset = sampling_name or role
    if sampling_name:
        print(f"   SAMPLING OVERRIDE: preset={sampling_name} (cell role is {role})")
    print(f"-- {stem}  model={model} role={role} preset={eff_preset} "
          f"ctx={num_ctx} think={think} "
          f"pre-warmup={pre_gpu.get('temp_c','?')}C start={start_gpu.get('temp_c','?')}C")
    results = []
    for task in tasks:
        print(f"   task={task} ... ", end="", flush=True)
        r = run_task(model, role, task, num_ctx, think, num_predict,
                     sampling_name=sampling_name)
        if "error" in r:
            print(f"ERROR {r['error']}")
        else:
            flag = "" if r["valid"] else "  <-- INVALID"
            print(f"{r['output_tokens']} tok  {r['decode_tok_s']} tok/s  "
                  f"prefill {r['prefill_tok_s']} tok/s  "
                  f"{r['gpu_at_finish'].get('temp_c','?')}C{flag}")
        results.append(r)

    cold_target = int(os.environ.get("GPU_COLD_C", "45"))
    rec = {
        "cell_id": cell_id, "rep": rep,
        "role": role, "model_id": model, "runtime": "ollama",
        "endpoint": f"{ENDPOINT}/api/chat", "num_ctx": num_ctx,
        "think": think, "num_predict": num_predict,
        "sampling": SAMPLING[eff_preset],
        "sampling_preset": eff_preset,
        "sampling_override": sampling_name,
        "power_cap_w": os.environ.get("BENCH_POWER_CAP_W", "435"),
        "warmup": wu,
        "gpu_before_warmup": pre_gpu,
        "gpu_at_start": start_gpu,
        "cold_start_target_c": cold_target,
        # Judged on the PRE-warmup reading - see the comment at the top of run_cell.
        "cold_start_ok": pre_gpu.get("temp_c", 999) <= cold_target,
        "warmup_temp_rise_c": (
            start_gpu.get("temp_c") - pre_gpu.get("temp_c")
            if isinstance(start_gpu.get("temp_c"), int)
            and isinstance(pre_gpu.get("temp_c"), int) else None),
        "ts_utc": datetime.now(timezone.utc).isoformat(),
        "results": results,
    }
    dest.write_text(json.dumps(rec, indent=2))
    print(f"   -> {dest}")
    return dest


def main() -> None:
    ap = argparse.ArgumentParser(description="Path E quality bench - one cell per call.")
    ap.add_argument("cell", help="cell id, 'list' to print the matrix, "
                                 "or 'models' to print every model id it needs")
    ap.add_argument("--out", required=False, help="run directory (set by run_path_e.sh)")
    ap.add_argument("--rep", type=int, default=None,
                    help="replicate index; writes <cell>_r<N>.json instead of <cell>.json")
    ap.add_argument("--tasks", default=None,
                    help="comma-separated subset of this cell's tasks")
    ap.add_argument("--sampling", default=None, choices=sorted(SAMPLING),
                    help="override the cell's role sampling preset (recorded in the JSON)")
    args = ap.parse_args()

    # Emitted for run_path_e.sh's preflight, which verifies every one of these resolves on
    # the serving instance before burning a single cell. Deduplicated but order-stable.
    if args.cell == "models":
        for m in dict.fromkeys(c[2] for c in CELLS):
            print(m)
        return

    if args.cell == "presets":
        for k in sorted(SAMPLING):
            print(k)
        return

    if args.cell == "list":
        for c in CELLS:
            print(f"{c[0]:34s} role={c[1]:9s} ctx={c[4]:<7d} think={str(c[5]):5s} "
                  f"tasks={','.join(c[3]):11s} {c[2]}")
        return

    if args.cell not in CELL_BY_ID:
        sys.exit(f"unknown cell: {args.cell}")

    only = [t.strip() for t in args.tasks.split(",")] if args.tasks else None
    if only:
        unknown = [t for t in only if t not in CELL_BY_ID[args.cell][3]]
        if unknown:
            sys.exit(f"cell {args.cell} does not define task(s): {', '.join(unknown)}")
    for task in (only or CELL_BY_ID[args.cell][3]):
        if not TASKS[task].exists():
            sys.exit(f"missing prompt file: {TASKS[task]}")

    out_dir = Path(args.out) if args.out else \
        Path.home() / ".oh-gui" / "bench_path_e" / f"{datetime.now():%Y%m%d_%H%M}_run"
    out_dir.mkdir(parents=True, exist_ok=True)
    run_cell(args.cell, out_dir, rep=args.rep, only_tasks=only,
             sampling_name=args.sampling)


if __name__ == "__main__":
    main()
