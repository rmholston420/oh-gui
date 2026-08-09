"""The local stub exercises the harness grading path without a model request."""
from __future__ import annotations

from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
from bench.toolcall.bench_toolcall import (  # noqa: E402
    ONE_HOUR_SECONDS,
    estimate_total_seconds,
    run_task,
    stub_responder,
)
from bench.toolcall.tasks import load_tasks  # noqa: E402


def test_stub_path_accepts_every_expanded_task_without_a_model_or_network():
    records = [
        run_task(task, "A", "fixture-model", "http://fixture.invalid/v1", stub_responder)
        for task in load_tasks()
    ]
    assert len(records) == 120
    assert all(record["resolved"] is True and record["accepted"] is True for record in records)
    assert all(record["output_tokens"] == 9 and record["wall_seconds"] == 0.001 for record in records)
    assert all(record["content_stripped"] == "calling tool" for record in records)


def test_expanded_set_exceeds_the_unchanged_harness_one_hour_cap():
    assert estimate_total_seconds(len(load_tasks())) > ONE_HOUR_SECONDS
