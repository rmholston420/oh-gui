#!/usr/bin/env python3
"""Measure real per-request wall time per candidate model.

The full-matrix estimate in bench_toolcall.py assumes a single flat
ESTIMATED_SECONDS_PER_REQUEST derived from 30B-class models. That number badly
overstates 2B/4B/9B candidates, and a wrong estimate feeds straight into the
ADR-016 budget gate. This probe sends one real benchmark task to each model and
reports measured seconds, so the budget is computed from evidence.

Zero grading, zero scoring, no run records written: this is budget arithmetic
only, not a benchmark, and it produces no comparative quality claim of the kind
ADR-013 clause 3 governs.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

TASKS = Path(__file__).resolve().parent / "tasks"
GREEN, RED, YELLOW, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[0m"

CANDIDATES = [
    "qwen3.6:35b-a3b-mtp-coder",
    "hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL",
    "qwen3.5:27b-q4_K_M",
    "qwen3.5:9b-q8_0",
    "qwen3.5:4b-q8_0",
    "qwen3.5:2b-q8_0",
]

# bench/SAMPLING.md precise-coding row, matching bench_toolcall.py.
SAMPLING = {
    "temperature": 0.6,
    "top_p": 0.95,
    "top_k": 20,
    "min_p": 0.0,
    "presence_penalty": 0.0,
}


def load_task(name: str) -> dict:
    path = TASKS / name
    if not path.exists():
        candidates = sorted(TASKS.glob("*.json"))
        if not candidates:
            raise SystemExit(f"no task files under {TASKS}")
        path = candidates[0]
    return json.loads(path.read_text())


def probe(model: str, task: dict, endpoint: str, timeout: int) -> dict:
    payload = {
        "model": model,
        "stream": False,
        "messages": [{"role": "user", "content": task["goal"]}],
        "tools": task["tool_schemas"],
        **SAMPLING,
    }
    request = urllib.request.Request(
        f"{endpoint}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode())
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {"model": model, "error": str(exc)[:160]}
    elapsed = time.time() - started
    message = body.get("choices", [{}])[0].get("message", {})
    usage = body.get("usage", {})
    completion = usage.get("completion_tokens") or 0
    return {
        "model": model,
        "seconds": round(elapsed, 2),
        "output_tokens": completion,
        "tok_per_s": round(completion / elapsed, 1) if elapsed > 0 and completion else None,
        "emitted_tool_calls": bool(message.get("tool_calls")),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default="http://127.0.0.1:11434/v1")
    parser.add_argument("--task", default="01-list-workspace.json")
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--reps", type=int, default=3, help="repetitions per task in the registered design")
    parser.add_argument("--task-count", type=int, default=47)
    parser.add_argument("--models", nargs="*", default=CANDIDATES)
    args = parser.parse_args(argv)

    task = load_task(args.task)
    print(f"{YELLOW}timing probe: task={task['id']} reps={args.reps} tasks={args.task_count}{RESET}\n")

    measured: list[dict] = []
    for model in args.models:
        # First call includes model load; report it separately from steady state.
        cold = probe(model, task, args.endpoint, args.timeout)
        if "error" in cold:
            print(f"{RED}ERROR{RESET} {model} -> {cold['error']}")
            continue
        warm = probe(model, task, args.endpoint, args.timeout)
        if "error" in warm:
            print(f"{RED}ERROR{RESET} {model} -> {warm['error']}")
            continue
        warm["cold_seconds"] = cold["seconds"]
        measured.append(warm)
        flag = f"{GREEN}tool_calls{RESET}" if warm["emitted_tool_calls"] else f"{RED}NO tool_calls{RESET}"
        print(
            f"  {model:52s} cold={cold['seconds']:6.2f}s warm={warm['seconds']:6.2f}s "
            f"out={warm['output_tokens']:5d} {flag}"
        )

    if not measured:
        print(f"\n{RED}no models measured; cannot compute a budget{RESET}", file=sys.stderr)
        return 1

    print(f"\n{YELLOW}projected full-matrix cost (warm seconds x tasks x reps){RESET}")
    total = 0.0
    for record in measured:
        cell = record["seconds"] * args.task_count * args.reps
        total += cell
        print(f"  {record['model']:52s} {cell/60:7.1f} min")
    print(f"  {'TOTAL':52s} {total/60:7.1f} min  ({total/3600:.2f} h)")

    out = Path("/tmp/timing_probe.json")
    out.write_text(json.dumps({"measured": measured, "total_seconds": round(total)}, indent=2))
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
