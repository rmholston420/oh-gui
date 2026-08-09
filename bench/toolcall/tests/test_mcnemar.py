"""Regression tests for the vendored paired mid-p McNemar implementation."""
from __future__ import annotations

import math
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
from bench.lib.mcnemar import _midp_two_sided, mcnemar_paired  # noqa: E402


def test_hand_computed_five_discordant_sweep_is_significant():
    """For b=0,c=5, p=2 * (1/2) * P(X=0)=1/32=0.03125."""
    baseline = {f"t{i}": False for i in range(5)}
    treatment = {f"t{i}": True for i in range(5)}
    result = mcnemar_paired(baseline, treatment)
    assert result.p_value == 0.03125
    assert result.method == "midp_exact"
    assert result.interpretation.startswith("significant")


def test_four_discordant_sweep_cannot_reach_alpha():
    assert _midp_two_sided(0, 4) == 0.0625


def test_none_is_not_a_binary_outcome_and_is_excluded_by_loader_contract():
    # mcnemar_paired is intentionally binary-only; harness folding excludes None first.
    result = mcnemar_paired({"paired": True}, {"paired": False, "only_b": True})
    assert result.n_paired == 1
    assert (result.b, result.c) == (1, 0)
    assert result.p_value == 0.5


def test_no_discordance_is_unmeasurable_not_zero_p_value():
    result = mcnemar_paired({"one": True}, {"one": True})
    assert math.isnan(result.p_value)
    assert result.method == "no_discordant_pairs"


def test_loader_drops_resolved_none_before_pairing(tmp_path):
    from bench.lib.mcnemar import _load_pass_map

    (tmp_path / "measured.json").write_text('{"instance_id":"measured","resolved":true}')
    (tmp_path / "unmeasurable.json").write_text('{"instance_id":"unmeasurable","resolved":null}')
    assert _load_pass_map(tmp_path) == {"measured": True}


def test_duplicate_task_input_is_collapsed_to_one_outcome_per_task():
    result = mcnemar_paired([("same-task", True), ("same-task", False)], [("same-task", True)])
    assert result.n_paired == 1
