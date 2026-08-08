"""Summed floats leaked a binary repetend tail (`535.8000000000001 s`) into a committed
comparison table. Cosmetic, but these tables are documents of record.
"""
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "compare_blocks", Path(__file__).resolve().parents[1] / "compare_blocks.py")
cb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cb)


def test_summed_float_does_not_leak_repetend():
    assert cb._n(93.0 + 106.3 + 336.5, " s") == "535.8 s"


def test_whole_floats_lose_the_point_zero():
    assert cb._n(386.0, " s") == "386 s"


def test_ints_are_untouched():
    assert cb._n(17) == "17"


def test_none_is_question_mark_not_zero():
    assert cb._n(None) == "?"
    assert cb._n(None, " s") == "?"


def test_zero_is_zero_not_question_mark():
    """A measured zero is a real datum and must not be confused with unmeasurable."""
    assert cb._n(0) == "0"
