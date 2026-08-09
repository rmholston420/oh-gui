#!/usr/bin/env python3
"""Run the pre-registered OpenHands terminal/file-editor tool-call benchmark.

Each invocation creates a new directory and writes one immutable JSON record per
cell per repetition. It intentionally has no GPU/runtime-management behavior:
run the mandatory attainability gate first, then point it at an already-selected
local OpenAI-compatible endpoint. ``--dry-run`` replaces that endpoint with an
in-process deterministic stub and makes no network or model request.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
from bench.toolcall.attainability import gate, load_registered_design  # noqa: E402
from bench.toolcall.grading import grade_message  # noqa: E402
from bench.toolcall.tasks import load_tasks  # noqa: E402

THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL)
OUT_ROOT = Path.home() / ".oh-gui" / "bench_toolcall"
REPETITIONS = 3
ESTIMATED_SECONDS_PER_REQUEST = 24
ESTIMATED_WARMUP_SECONDS = 60
ONE_HOUR_SECONDS = 60 * 60
# ADR-016 status amendment 2026-08-09: the one-hour cap is superseded for this
# benchmark only, because the one-hour design cleared ADR-013's discordant-pair
# floor solely under an optimistic outcome correlation. Operator instruction
# 2026-08-09 03:56 EDT authorises 3.5 hours for the registered 47-task design.
BUDGET_SECONDS = int(3.5 * 60 * 60)

# The Qwen3.6 precise-coding row in bench/SAMPLING.md. It is sent explicitly
# to both cells so the comparison changes the model and nothing else.
CODER_SAMPLING = {
    "temperature": 0.6,
    "top_p": 0.95,
    "top_k": 20,
    "min_p": 0.0,
    "presence_penalty": 0.0,
    "repetition_penalty": 1.0,
}
CELLS = {
    "A": "qwen3.6:35b-a3b-mtp-coder",
    "B": "hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL",
}


def estimate_total_seconds(task_count: int, cell_count: int = len(CELLS), reps: int = REPETITIONS) -> int:
    return task_count * cell_count * reps * ESTIMATED_SECONDS_PER_REQUEST + ESTIMATED_WARMUP_SECONDS


def new_run_dir(root: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    candidate = root / f"{stamp}_toolcall"
    suffix = 1
    while candidate.exists():
        candidate = root / f"{stamp}_toolcall_{suffix:02d}"
        suffix += 1
    candidate.mkdir(parents=True)
    return candidate


def http_responder(endpoint: str, payload: dict[str, Any], timeout: int) -> tuple[dict[str, Any], float]:
    request = urllib.request.Request(
        endpoint.rstrip("/") + "/chat/completions",
        data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"},
    )
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        decoded = json.loads(response.read().decode())
    return decoded, time.monotonic() - started


def stub_responder(_endpoint: str, payload: dict[str, Any], _timeout: int) -> tuple[dict[str, Any], float]:
    """Deterministic local responder used solely to exercise the full harness path."""
    # The expected predicate is local-only stub metadata; live payloads omit it.
    expected = json.loads(payload["metadata"]["expected_outcome"])
    name = expected["tool"]
    args: dict[str, Any] = {}
    constraints = expected.get("arg_constraints", {})
    for arg in expected["required_args"]:
        c = constraints.get(arg, {})
        if "equals" in c:
            args[arg] = c["equals"]
        elif arg == "path":
            args[arg] = "/workspace/stub.txt"
        elif arg == "insert_line":
            args[arg] = 0
        elif arg == "view_range":
            args[arg] = [1, 2]
        else:
            args[arg] = "stub"
    # Both schemas are present in each task, so the stub's call proves that the
    # whole request->response->think-strip->grade->record path works.
    return ({
        "choices": [{"message": {"role": "assistant", "content": "<think>dry-run trace</think>calling tool", "tool_calls": [
            {"id": "dry-run-call", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}
        ]}}],
        "usage": {"completion_tokens": 9, "prompt_tokens": 321},
    }, 0.001)


def _extract_message(response: Mapping[str, Any]) -> Mapping[str, Any] | None:
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], Mapping):
        return None
    message = choices[0].get("message")
    return message if isinstance(message, Mapping) else None


def _output_tokens(response: Mapping[str, Any]) -> int | None:
    usage = response.get("usage")
    if not isinstance(usage, Mapping):
        return None
    value = usage.get("completion_tokens")
    # Missing telemetry is null, never a fabricated zero.
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def run_task(task: Mapping[str, Any], cell_id: str, model: str, endpoint: str,
             responder: Callable[[str, dict[str, Any], int], tuple[dict[str, Any], float]]) -> dict[str, Any]:
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": task["goal"]}],
        "tools": task["tool_schemas"],
        "tool_choice": "auto",
        "stream": False,
        "max_tokens": 256,
        **CODER_SAMPLING,
        # Non-standard metadata is harmless to the dry stub. It is removed for
        # live calls below because OpenAI-compatible runtimes may reject it.
        "metadata": {"expected_outcome": json.dumps(task["expected_outcome"], sort_keys=True)},
    }
    live_payload = dict(payload)
    live_payload.pop("metadata")
    try:
        response, wall_seconds = responder(endpoint, payload if responder is stub_responder else live_payload, 300)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError) as exc:
        return {
            "task_id": task["id"], "cell_id": cell_id, "model": model,
            "resolved": None, "accepted": False,
            "tool_call_failure": None, "quality_failure": None,
            "unmeasurable_reason": "responder_error", "responder_error": f"{type(exc).__name__}: {exc}",
            "wall_seconds": None, "output_tokens": None, "prompt_tokens": None,
            "content_raw": None, "content_stripped": None,
        }
    message = _extract_message(response)
    raw = message.get("content") if isinstance(message, Mapping) else None
    raw = raw if isinstance(raw, str) else ""
    stripped = THINK_RE.sub("", raw).strip()
    # Grade the post-OpenHands content shape, never an inline reasoning trace.
    grading_message = dict(message) if isinstance(message, Mapping) else None
    if grading_message is not None:
        grading_message["content"] = stripped
    grade = grade_message(task, grading_message)
    usage = response.get("usage") if isinstance(response.get("usage"), Mapping) else {}
    prompt_tokens = usage.get("prompt_tokens") if isinstance(usage.get("prompt_tokens"), int) else None
    return {
        "task_id": task["id"], "cell_id": cell_id, "model": model,
        **grade,
        "wall_seconds": round(wall_seconds, 6),
        "output_tokens": _output_tokens(response),
        "prompt_tokens": prompt_tokens,
        "content_raw": raw,
        "content_stripped": stripped,
        "tool_calls": message.get("tool_calls") if isinstance(message, Mapping) else None,
    }


def run_cell(tasks: list[Mapping[str, Any]], cell_id: str, rep: int, endpoint: str,
             responder: Callable[[str, dict[str, Any], int], tuple[dict[str, Any], float]]) -> dict[str, Any]:
    model = CELLS[cell_id]
    results = [run_task(task, cell_id, model, endpoint, responder) for task in tasks]
    return {
        "schema_version": 1,
        "ts_utc": datetime.now(timezone.utc).isoformat(),
        "cell_id": cell_id,
        "model": model,
        "role": "coder",
        "replicate": rep,
        "sampling": CODER_SAMPLING,
        "results": results,
        "summary": {
            "accepted": sum(result["resolved"] is True for result in results),
            "quality_failures": sum(result["resolved"] is False for result in results),
            "tool_call_failures": sum(result["tool_call_failure"] is not None for result in results),
            "other_unmeasurable": sum(
                result["resolved"] is None and result["tool_call_failure"] is None for result in results),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cell", choices=[*CELLS, "all"], default="all")
    parser.add_argument("--endpoint", default="http://127.0.0.1:11434/v1")
    parser.add_argument("--out-root", type=Path, default=OUT_ROOT)
    parser.add_argument("--dry-run", action="store_true", help="exercise all paths with a local stub; no network/model call")
    args = parser.parse_args(argv)

    tasks = load_tasks()
    passed, expected = gate(load_registered_design())
    estimate = estimate_total_seconds(len(tasks))
    print(f"matrix: {len(CELLS)} cells × {len(tasks)} tasks × {REPETITIONS} reps = {len(CELLS)*len(tasks)*REPETITIONS} requests")
    print(f"estimated full-matrix wall-clock: {estimate}s ({estimate / 60:.1f} min); cap: {BUDGET_SECONDS}s ({BUDGET_SECONDS / 60:.1f} min, ADR-016 amended 2026-08-09)")
    print(f"attainability expected discordant pairs: {expected:.4f} (required >=5)")
    if not passed:
        print("NO-GO: pre-run attainability gate failed; no responder will be called.", file=sys.stderr)
        return 1
    if estimate > BUDGET_SECONDS:
        print("NO-GO: estimated matrix exceeds ADR-016's amended GPU budget; no responder will be called.", file=sys.stderr)
        return 1

    run_dir = new_run_dir(args.out_root)
    # Freeze the pre-registered design beside its immutable trial records.
    manifest_snapshot = run_dir / "MANIFEST.md"
    manifest_snapshot.write_text((Path(__file__).resolve().parent / "MANIFEST.md").read_text())
    responder = stub_responder if args.dry_run else http_responder
    cells = list(CELLS) if args.cell == "all" else [args.cell]
    print(f"output: {run_dir}")
    print("mode: dry-run stub (zero GPU/network)" if args.dry_run else f"mode: live endpoint {args.endpoint}")
    for cell_id in cells:
        for rep in range(1, REPETITIONS + 1):
            record = run_cell(tasks, cell_id, rep, args.endpoint, responder)
            target = run_dir / f"cell-{cell_id}__rep-{rep:02d}.json"
            if target.exists():
                raise FileExistsError(f"refusing to overwrite trial record: {target}")
            target.write_text(json.dumps(record, indent=2) + "\n")
            summary = record["summary"]
            print(f"cell {cell_id} rep {rep}: accepted={summary['accepted']} quality_failures={summary['quality_failures']} tool_call_failures={summary['tool_call_failures']} other_unmeasurable={summary['other_unmeasurable']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
