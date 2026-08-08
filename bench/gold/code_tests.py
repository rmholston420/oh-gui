"""Hidden test suite for the `code` bench task.

NOT shown to any model. Executed against each cell's extracted module by
bench/path_e/score_code.py, which drops the candidate in as `candidate.py`.

stdlib `unittest`, deliberately: this runs on Colossus against whatever interpreter is
to hand, and requiring a pip install inside a scoring step is how scoring steps get
skipped. No venv needed.

Every assertion traces to an explicit clause of bench/prompts/code.txt. Nothing here
tests behaviour the brief did not state. Parametrised cases are expanded into separate
methods so the pass count is an exact test count, not a subtest count.

30 tests. The suite total is normalised to 60 of the task's 100 points.
"""
from __future__ import annotations

import unittest

from candidate import decode_flag, parse_perf_flags  # type: ignore

FIXTURE = """==============NVSMI LOG==============

Timestamp                                 : Sat Aug  8 06:05:11 2026
Driver Version                            : 610.57.04
CUDA Version                              : 13.0

Attached GPUs                             : 1
GPU 00000000:01:00.0
    Performance State                     : P0
    Clocks Event Reasons
        Idle                              : Not Active
        Applications Clocks Setting       : Not Active
        SW Power Cap                      : Active
        HW Slowdown                       : Not Active
            HW Thermal Slowdown           : Not Active
            HW Power Brake Slowdown       : Not Active
        Sync Boost                        : Not Active
        SW Thermal Slowdown               : Not Active
        Display Clock Setting             : Not Active
"""

EXPECTED = {
    "idle": False,
    "applications_clocks_setting": False,
    "sw_power_cap": True,
    "hw_slowdown": False,
    "hw_thermal_slowdown": False,
    "hw_power_brake_slowdown": False,
    "sync_boost": False,
    "sw_thermal_slowdown": False,
    "display_clock_setting": False,
}

SYNC_BOOST_LINE = "        Sync Boost                        : Not Active"


class TestParsePerfFlags(unittest.TestCase):

    def test_basic_fixture_exact(self):
        """The whole block, and nothing but the block."""
        self.assertEqual(parse_perf_flags(FIXTURE), EXPECTED)

    def test_not_active_is_false(self):
        """'Not Active' ends in 'Active'. A naive endswith/$NF parser reports every
        idle sample as throttled - a bug this repo actually shipped."""
        got = parse_perf_flags(FIXTURE)
        self.assertIs(got["idle"], False)

    def test_active_is_true(self):
        self.assertIs(parse_perf_flags(FIXTURE)["sw_power_cap"], True)

    def test_excludes_fields_outside_block(self):
        got = parse_perf_flags(FIXTURE)
        for k in ("performance_state", "timestamp", "driver_version",
                  "cuda_version", "attached_gpus"):
            self.assertNotIn(k, got)

    def test_deeper_nesting_is_flattened(self):
        got = parse_perf_flags(FIXTURE)
        self.assertIn("hw_thermal_slowdown", got)
        self.assertIn("hw_power_brake_slowdown", got)

    def test_older_driver_block_label(self):
        txt = FIXTURE.replace("Clocks Event Reasons", "Clocks Throttle Reasons")
        self.assertEqual(parse_perf_flags(txt), EXPECTED)

    def test_unknown_future_reason_appears(self):
        """No whitelists: a reason this code has never seen must still come through."""
        txt = FIXTURE.replace(
            SYNC_BOOST_LINE,
            SYNC_BOOST_LINE + "\n        Fabric Manager Slowdown           : Active")
        self.assertIs(parse_perf_flags(txt)["fabric_manager_slowdown"], True)

    def test_na_maps_to_false(self):
        txt = FIXTURE.replace(
            SYNC_BOOST_LINE,
            "        Sync Boost                        : N/A")
        self.assertIs(parse_perf_flags(txt)["sync_boost"], False)

    def test_unparseable_value_raises(self):
        txt = FIXTURE.replace(
            SYNC_BOOST_LINE,
            "        Sync Boost                        : Partially Active")
        with self.assertRaises(ValueError):
            parse_perf_flags(txt)

    def test_missing_block_returns_empty_dict(self):
        txt = "\n".join(l for l in FIXTURE.splitlines()
                        if "Clocks Event Reasons" not in l
                        and not l.startswith("        "))
        self.assertEqual(parse_perf_flags(txt), {})

    def test_crlf_line_endings(self):
        self.assertEqual(parse_perf_flags(FIXTURE.replace("\n", "\r\n")), EXPECTED)

    def test_block_terminates_at_dedent(self):
        """A later section at the block's own indent level is not part of the block."""
        txt = FIXTURE + "    Utilization\n        Gpu                    : 0 %\n"
        got = parse_perf_flags(txt)
        self.assertNotIn("gpu", got)
        self.assertEqual(got, EXPECTED)


class TestDecodeFlag(unittest.TestCase):

    def test_00(self):
        self.assertEqual(decode_flag("00"), (False, False))

    def test_01(self):
        self.assertEqual(decode_flag("01"), (False, True))

    def test_10(self):
        self.assertEqual(decode_flag("10"), (True, False))

    def test_11(self):
        self.assertEqual(decode_flag("11"), (True, True))

    def test_none(self):
        self.assertEqual(decode_flag(None), (False, False))

    def test_empty_string(self):
        self.assertEqual(decode_flag(""), (False, False))

    def test_spaces_only(self):
        self.assertEqual(decode_flag("   "), (False, False))

    def test_tab_only(self):
        self.assertEqual(decode_flag("\t"), (False, False))

    def test_short_pads_right_true(self):
        self.assertEqual(decode_flag("1"), (True, False))

    def test_short_pads_right_false(self):
        self.assertEqual(decode_flag("0"), (False, False))

    def test_long_truncates_three(self):
        self.assertEqual(decode_flag("110"), (True, True))

    def test_long_truncates_four(self):
        self.assertEqual(decode_flag("1011"), (True, False))

    def test_strips_surrounding_spaces(self):
        self.assertEqual(decode_flag(" 10 "), (True, False))

    def test_strips_tabs_and_newlines(self):
        self.assertEqual(decode_flag("\t01\n"), (False, True))

    def test_bad_char_digit(self):
        with self.assertRaises(ValueError):
            decode_flag("2")

    def test_bad_char_alpha(self):
        with self.assertRaises(ValueError):
            decode_flag("0x")

    def test_bad_char_all_alpha(self):
        with self.assertRaises(ValueError):
            decode_flag("ab")

    def test_bad_char_sign(self):
        with self.assertRaises(ValueError):
            decode_flag("-1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
