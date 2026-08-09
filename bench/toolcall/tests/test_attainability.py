"""Mutation tests for the mandatory pre-GPU attainability gate."""
from __future__ import annotations

from pathlib import Path
import math
import sys

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
from bench.toolcall.attainability import Design, expected_discordant_pairs, gate, load_registered_design  # noqa: E402


def test_registered_manifest_passes_floor():
    design = load_registered_design()
    passed, expected = gate(design)
    assert passed
    # Pinned to the confirmatory split, not the task library: power comes only
    # from the held-out tasks the inferential test consumes.
    assert design.task_count == 80
    assert design.total_task_files == 120
    assert design.screening_task_count == 40
    assert math.isclose(expected, 8.646531292375329, rel_tol=0, abs_tol=1e-12)


def test_confirmatory_split_passes_floor_at_rho_point_eight():
    passed, expected = gate(Design(80, 0.60, 0.50, 0.80))
    assert passed
    assert math.isclose(expected, 8.646531292375329, rel_tol=0, abs_tol=1e-12)


def test_scoring_the_whole_library_would_overstate_power():
    """Guards the specific error this split is designed to prevent."""
    _, split = gate(Design(80, 0.60, 0.50, 0.80))
    _, library = gate(Design(120, 0.60, 0.50, 0.80))
    assert library > split * 1.4


def test_mutant_too_small_task_set_fails():
    registered = load_registered_design()
    passed, expected = gate(Design(19, registered.acceptance_a, registered.acceptance_b, registered.correlation))
    assert not passed
    assert expected < 5


def test_mutant_ceiling_effect_fails():
    passed, expected = gate(Design(20, 0.90, 0.90, 0.80))
    assert not passed
    assert math.isclose(expected, 0.72, rel_tol=0, abs_tol=1e-12)


def test_invalid_correlation_is_rejected():
    try:
        expected_discordant_pairs(Design(20, 0.6, 0.5, 1.1))
    except ValueError as exc:
        assert "correlation" in str(exc)
    else:
        raise AssertionError("invalid correlation must not pass")
