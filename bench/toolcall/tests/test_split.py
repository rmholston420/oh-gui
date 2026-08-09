"""The screening/confirmatory split is the anti-selection-bias guard, so its
disjointness and determinism are asserted rather than assumed."""
from __future__ import annotations

from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
from bench.toolcall.bench_toolcall import (  # noqa: E402
    CELLS,
    CONFIRMATORY,
    SCREEN_TASK_COUNT,
    cells_in_arm,
    split_tasks,
)
from bench.toolcall.tasks import load_tasks  # noqa: E402


def test_split_is_disjoint_and_covers_the_library():
    tasks = load_tasks()
    screen, confirm = split_tasks(tasks)
    screen_ids = {t["id"] for t in screen}
    confirm_ids = {t["id"] for t in confirm}
    assert len(screen) == SCREEN_TASK_COUNT
    assert len(confirm) == len(tasks) - SCREEN_TASK_COUNT
    # A single shared task would let a challenger be scored on evidence that
    # helped select it.
    assert screen_ids.isdisjoint(confirm_ids)
    assert screen_ids | confirm_ids == {t["id"] for t in tasks}


def test_split_is_content_addressed_not_order_dependent():
    tasks = load_tasks()
    forward = [t["id"] for t in split_tasks(tasks)[0]]
    reversed_input = [t["id"] for t in split_tasks(list(reversed(tasks)))[0]]
    shuffled = [t["id"] for t in split_tasks(sorted(tasks, key=lambda t: t["goal"]))[0]]
    assert set(forward) == set(reversed_input) == set(shuffled)


def test_split_membership_is_stable_across_calls():
    tasks = load_tasks()
    assert [t["id"] for t in split_tasks(tasks)[0]] == [t["id"] for t in split_tasks(tasks)[0]]


def test_confirmatory_arm_is_baseline_plus_four_challengers():
    confirmatory = cells_in_arm(CONFIRMATORY)
    # Holm-Bonferroni in the manifest is registered over exactly k-1 = 4
    # baseline-vs-each comparisons; changing this set without changing the
    # registered family size would invalidate the correction.
    assert confirmatory == ["A", "B", "C", "D", "H"]
    assert CELLS["A"]["arm"] == CONFIRMATORY


def test_confirmatory_arm_is_not_a_single_model_family():
    # A, C and D are all Qwen. A result that held only across them could be a
    # fact about Qwen rather than about tool-call reliability, so the arm must
    # keep at least two independent lineages.
    models = [CELLS[c]["model"].lower() for c in cells_in_arm(CONFIRMATORY)]
    non_qwen = [m for m in models if "qwen" not in m]
    assert len(non_qwen) >= 2, f"confirmatory arm needs >=2 non-Qwen lineages, got {non_qwen}"


def test_every_cell_declares_an_arm():
    for cell_id, cell in CELLS.items():
        assert cell["arm"] in {"confirmatory", "exploratory"}, cell_id
