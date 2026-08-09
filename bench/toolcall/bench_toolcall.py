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
import hashlib
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
REPETITIONS = 5
SCREEN_REPETITIONS = 1

# Measured 2026-08-09 04:23 EDT by bench/toolcall/timing_probe.py on Colossus.
# The previous flat 24 s/request constant was a 30B-class guess and overstated
# real warm latency by roughly 40x; the budget must run on measurement.
# Recorded per model as warm seconds for one graded request.
MEASURED_WARM_SECONDS = {
    "qwen3.6:35b-a3b-mtp-coder": 0.51,
    "hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL": 0.32,
    "qwen3.5:27b-q4_K_M": 1.30,
    "qwen3.5:9b-q8_0": 0.89,
    "qwen3.5:4b-q8_0": 0.73,
    "qwen3.5:2b-q8_0": 0.65,
}
# The probe task emitted ~100 output tokens against one short goal. Real tasks
# carry larger schemas and some produce longer calls, so the projection is
# deliberately inflated rather than taken at face value.
TIMING_SAFETY_FACTOR = 5.0
DEFAULT_WARM_SECONDS = 3.0
COLD_LOAD_SECONDS = 70
ONE_HOUR_SECONDS = 60 * 60
# ADR-016 budget history. The 2026-08-09 03:56 EDT amendment to 3.5 h rested
# entirely on the 24 s/request estimate, which measurement at 04:23 EDT
# disproved. That amendment is therefore withdrawn as premise-falsified rather
# than left standing. Operator instruction 2026-08-09 04:26 EDT authorises an
# overnight window of up to 8 hours; the real limiter is now statistical power,
# not wall-clock.
BUDGET_SECONDS = int(8 * 60 * 60)

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
# Arm assignment is pre-registered and load-bearing.
#
# "confirmatory" cells are the only ones that may carry an inferential claim.
# Each is tested baseline-vs-challenger under Holm-Bonferroni across the k-1
# comparisons, on the CONFIRMATORY task split only.
#
# "exploratory" cells are descriptive. They are screened on a disjoint task
# split and reported as raw pass rates with no p-value and no "better than"
# claim, per ADR-013 clause 3.
CONFIRMATORY = "confirmatory"
EXPLORATORY = "exploratory"
BASELINE_CELL = "A"

CELLS: dict[str, dict[str, str]] = {
    # Baseline: the ADR-012 default whose tool-call behaviour motivated this bench.
    "A": {"model": "qwen3.6:35b-a3b-mtp-coder", "arm": CONFIRMATORY},
    "B": {"model": "hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL", "arm": CONFIRMATORY},
    "C": {"model": "qwen3.5:27b-q4_K_M", "arm": CONFIRMATORY},
    "D": {"model": "qwen3.5:9b-q8_0", "arm": CONFIRMATORY},
    # Subagent tier and researched candidates: descriptive only.
    "E": {"model": "qwen3.5:4b-q8_0", "arm": EXPLORATORY},
    "F": {"model": "qwen3.5:2b-q8_0", "arm": EXPLORATORY},
    "G": {"model": "laguna-xs-2.1:q4_K_M", "arm": EXPLORATORY},
    "H": {"model": "glm-4.7-flash:q4_K_M", "arm": EXPLORATORY},
    "I": {"model": "lfm2.5:8b", "arm": EXPLORATORY},
    "J": {"model": "ornith:35b", "arm": EXPLORATORY},
}


def cell_model(cell_id: str) -> str:
    return CELLS[cell_id]["model"]


def cells_in_arm(arm: str) -> list[str]:
    return [cell_id for cell_id, spec in CELLS.items() if spec["arm"] == arm]


def warm_seconds(model: str) -> float:
    """Measured warm latency, or a conservative default for unmeasured models."""
    return MEASURED_WARM_SECONDS.get(model, DEFAULT_WARM_SECONDS)


def estimate_cell_seconds(cell_id: str, task_count: int, reps: int) -> float:
    """Projected wall-clock for one cell, from measured latency plus safety factor."""
    per_request = warm_seconds(cell_model(cell_id)) * TIMING_SAFETY_FACTOR
    return task_count * reps * per_request + COLD_LOAD_SECONDS


def estimate_total_seconds(task_count: int, cell_ids: list[str] | None = None,
                           reps: int = REPETITIONS) -> int:
    selected = list(CELLS) if cell_ids is None else cell_ids
    return int(sum(estimate_cell_seconds(cell_id, task_count, reps) for cell_id in selected))


# Pre-registered disjoint task split.
#
# Screening every candidate and then running the confirmatory test on the SAME
# tasks would let a challenger be selected for noise and then credited for it.
# The split is therefore fixed in advance and content-addressed: membership
# depends only on the task id and this salt, never on file order, directory
# listing order, or anything observed during a run.
SPLIT_SALT = "oh-gui/toolcall/split/v1"
SCREEN_TASK_COUNT = 40


def split_tasks(tasks: list[Mapping[str, Any]],
                screen_count: int = SCREEN_TASK_COUNT,
                salt: str = SPLIT_SALT) -> tuple[list[Mapping[str, Any]], list[Mapping[str, Any]]]:
    """Return (screening_tasks, confirmatory_tasks) as a deterministic partition."""
    ranked = sorted(
        tasks,
        key=lambda task: hashlib.sha256(f"{salt}:{task['id']}".encode()).hexdigest(),
    )
    screen = sorted(ranked[:screen_count], key=lambda task: task["id"])
    confirm = sorted(ranked[screen_count:], key=lambda task: task["id"])
    return screen, confirm


def available_models(endpoint: str, timeout: int = 10) -> set[str] | None:
    """Model tags the runtime reports, or None when the listing cannot be read."""
    base = endpoint.rstrip("/")
    if base.endswith("/v1"):
        base = base[: -len("/v1")]
    try:
        with urllib.request.urlopen(f"{base}/api/tags", timeout=timeout) as response:
            payload = json.loads(response.read().decode())
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None
    models = payload.get("models")
    if not isinstance(models, list):
        return None
    return {entry.get("name", "") for entry in models if isinstance(entry, Mapping)}


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
    model = cell_model(cell_id)
    results = [run_task(task, cell_id, model, endpoint, responder) for task in tasks]
    return {
        "schema_version": 1,
        "ts_utc": datetime.now(timezone.utc).isoformat(),
        "cell_id": cell_id,
        "model": model,
        "arm": CELLS[cell_id]["arm"],
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
    parser.add_argument("--mode", choices=["screen", "confirm"], default="screen",
                        help="screen: all cells, 1 rep, screening split. confirm: confirmatory cells, full reps, held-out split.")
    parser.add_argument("--run-dir", type=Path, default=None,
                        help="resume into an existing run directory; completed cell/rep records are skipped")
    args = parser.parse_args(argv)

    all_tasks = load_tasks()
    design = load_registered_design()
    # A manifest that claims a task count the repository does not contain is a
    # silent pre-registration violation, so it stops the run rather than
    # quietly benchmarking a different design than the one registered.
    if design.total_task_files is not None and design.total_task_files != len(all_tasks):
        print(f"NO-GO: manifest registers {design.total_task_files} task files but {len(all_tasks)} exist.",
              file=sys.stderr)
        return 1

    screen_count = design.screening_task_count or SCREEN_TASK_COUNT
    screen_tasks, confirm_tasks = split_tasks(all_tasks, screen_count)
    # The gate scores the confirmatory split; a mismatch means the registered
    # power figure describes a different design than the one about to run.
    if design.task_count != len(confirm_tasks):
        print(f"NO-GO: manifest registers a {design.task_count}-task confirmatory split "
              f"but the split yields {len(confirm_tasks)}.", file=sys.stderr)
        return 1
    if args.mode == "screen":
        tasks, reps = screen_tasks, SCREEN_REPETITIONS
        cells = list(CELLS) if args.cell == "all" else [args.cell]
    else:
        tasks, reps = confirm_tasks, REPETITIONS
        cells = cells_in_arm(CONFIRMATORY) if args.cell == "all" else [args.cell]

    passed, expected = gate(design)
    estimate = estimate_total_seconds(len(tasks), cells, reps)
    print(f"mode: {args.mode}  split: {len(screen_tasks)} screening / {len(confirm_tasks)} confirmatory (disjoint, salt-fixed)")
    print(f"matrix: {len(cells)} cells x {len(tasks)} tasks x {reps} reps = {len(cells)*len(tasks)*reps} requests")
    print(f"projected wall-clock: {estimate}s ({estimate / 60:.1f} min) at {TIMING_SAFETY_FACTOR:g}x measured latency; cap {BUDGET_SECONDS / 3600:.1f} h")
    print(f"attainability expected discordant pairs: {expected:.4f} (required >={design.minimum_discordant_pairs:.0f})")
    if args.mode == "confirm" and not passed:
        print("NO-GO: pre-run attainability gate failed; no responder will be called.", file=sys.stderr)
        return 1
    if estimate > BUDGET_SECONDS:
        print("NO-GO: projected matrix exceeds the authorised GPU budget; no responder will be called.", file=sys.stderr)
        return 1

    if not args.dry_run:
        present = available_models(args.endpoint)
        if present is not None:
            missing = [c for c in cells if cell_model(c) not in present]
            blocking = [c for c in missing if CELLS[c]["arm"] == CONFIRMATORY]
            if blocking:
                names = ", ".join(f"{c}={cell_model(c)}" for c in blocking)
                print(f"NO-GO: confirmatory model(s) not present on the runtime: {names}", file=sys.stderr)
                return 1
            for cell_id in missing:
                print(f"skip: exploratory cell {cell_id} ({cell_model(cell_id)}) not pulled")
            cells = [c for c in cells if c not in missing]

    run_dir = args.run_dir if args.run_dir is not None else new_run_dir(args.out_root)
    run_dir.mkdir(parents=True, exist_ok=True)
    # Freeze the pre-registered design beside its immutable trial records.
    (run_dir / "MANIFEST.md").write_text((Path(__file__).resolve().parent / "MANIFEST.md").read_text())
    responder = stub_responder if args.dry_run else http_responder
    print(f"output: {run_dir}")
    print("mode: dry-run stub (zero GPU/network)" if args.dry_run else f"endpoint: {args.endpoint}")

    started = time.monotonic()
    total_units = len(cells) * reps
    done_units = 0
    for cell_id in cells:
        for rep in range(1, reps + 1):
            target = run_dir / f"{args.mode}__cell-{cell_id}__rep-{rep:02d}.json"
            done_units += 1
            if target.exists():
                # Immutable records are never rewritten; resuming skips them.
                print(f"[{done_units}/{total_units}] cell {cell_id} rep {rep}: already recorded, skipping")
                continue
            cell_started = time.monotonic()
            record = run_cell(tasks, cell_id, rep, args.endpoint, responder)
            record["mode"] = args.mode
            record["task_split"] = args.mode
            record["task_ids"] = [task["id"] for task in tasks]
            target.write_text(json.dumps(record, indent=2) + "\n")
            summary = record["summary"]
            graded = summary["accepted"] + summary["quality_failures"]
            rate = f"{summary['accepted'] / graded:.0%}" if graded else "n/a"
            elapsed = time.monotonic() - cell_started
            print(f"[{done_units}/{total_units}] cell {cell_id} ({cell_model(cell_id)}) rep {rep}: "
                  f"accepted={summary['accepted']} pass_rate={rate} "
                  f"quality_failures={summary['quality_failures']} "
                  f"tool_call_failures={summary['tool_call_failures']} "
                  f"unmeasurable={summary['other_unmeasurable']} [{elapsed:.1f}s]", flush=True)
    print(f"done in {(time.monotonic() - started) / 60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
