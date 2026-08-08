"""Tests for the Phase 0 baseline harness.

The harness records the numbers that Phase 1 will be judged against, so a silent defect here
corrupts every later comparison. These pin the arithmetic and the parsing.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
sys.path.insert(0, str(BASE))

import report  # noqa: E402


def _thermal(tmp_path: Path, rows: str) -> dict:
    p = tmp_path / "t.csv"
    p.write_text("ts,temp_c,power_w,sm_mhz,util_pct,fan_pct,hotspot_c,pcap_thermal\n" + rows)
    return report.load_thermal(p)


def test_thermal_parses_peaks_and_means(tmp_path):
    got = _thermal(tmp_path, "10:00:00,60,300.0,2500,90,0,61,00\n10:00:01,70,400.0,2500,95,0,71,00\n")
    assert got["temp_max_c"] == 70
    assert got["temp_mean_c"] == 65.0
    assert got["power_max_w"] == 400.0
    assert got["thermally_throttled"] is False


def test_power_cap_alone_is_not_throttling(tmp_path):
    # "10" = at the power cap, not thermally slowed. At a 435 W cap this is the normal state
    # and must not be reported as a throttle, or every run looks invalid.
    got = _thermal(tmp_path, "10:00:00,60,435.0,2500,99,0,61,10\n")
    assert got["thermally_throttled"] is False


def test_thermal_slowdown_is_flagged(tmp_path):
    got = _thermal(tmp_path, "10:00:00,84,435.0,1900,99,0,85,01\n")
    assert got["thermally_throttled"] is True


def test_missing_thermal_log_is_absent_not_zero(tmp_path):
    assert report.load_thermal(tmp_path / "nope.csv") == {}


def test_fmt_distinguishes_absent_from_zero():
    assert report.fmt(None) == "—"
    assert report.fmt(0) == "0"


def _session(tmp_path, script: str, task: str = "t01") -> dict:
    fixture = tmp_path / "fx"
    fixture.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main", str(fixture)], check=True)
    (fixture / "a.txt").write_text("one\n")
    for args in (["add", "-A"], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "s"]):
        subprocess.run(["git", "-C", str(fixture), *args], check=True)
    (fixture / "a.txt").write_text("one\ntwo\nthree\n")
    out = tmp_path / "out"
    subprocess.run(
        [sys.executable, str(BASE / "mark.py"), "--task", task,
         "--outdir", str(out), "--fixture", str(fixture)],
        input=script, text=True, capture_output=True, check=True,
    )
    return json.loads((out / f"{task}.summary.json").read_text())


def test_lines_are_counted_from_git_not_claimed(tmp_path):
    s = _session(tmp_path, "t\nr\na\nn\nd\n")
    assert s["lines_accepted"] == 2  # two lines added to a.txt
    assert s["lines_accepted_without_inspection"] == 2
    assert s["accepts_without_inspection"] == 1


def test_inspected_accept_is_not_counted_as_blind(tmp_path):
    s = _session(tmp_path, "t\nr\na\ny\nd\n")
    assert s["lines_accepted"] == 2
    assert s["lines_accepted_without_inspection"] == 0


def test_turns_to_acceptance_counts_only_turns_before_done(tmp_path):
    s = _session(tmp_path, "t\nt\nr\nt\na\ny\nd\n")
    assert s["turns_to_acceptance"] == 3
    assert s["total_turns"] == 3


def test_abandoned_task_has_no_acceptance_turn_count(tmp_path):
    s = _session(tmp_path, "t\nr\nq\ngave up\n")
    assert s["outcome"] == "abandoned"
    assert s["turns_to_acceptance"] is None


def test_corrective_records_durability(tmp_path):
    s = _session(tmp_path, "t\nc\nrun tests first\ny\nd\n")
    assert s["turns_before_first_corrective"] == 1
    assert s["corrective_encoded_durably"] is True


def test_server_info_absent_is_called_out_not_skipped(tmp_path, capsys):
    (tmp_path / "t01.summary.json").write_text(json.dumps({
        "task": "t01", "outcome": "completed", "time_to_first_review_s": 1.0,
        "turns_to_acceptance": 1, "lines_accepted": 1,
        "lines_accepted_without_inspection": 0, "lost_track_incidents": 0,
        "turns_before_first_corrective": None, "correctives": [], "tool_failures": [],
        "notes": [], "wall_seconds": 1,
    }))
    sys.argv = ["report.py", str(tmp_path)]
    report.main()
    out = capsys.readouterr().out
    assert "Not recorded" in out and "backend version" in out


def test_server_info_is_reported_when_present(tmp_path, capsys):
    (tmp_path / "t01.summary.json").write_text(json.dumps({
        "task": "t01", "outcome": "completed", "time_to_first_review_s": 1.0,
        "turns_to_acceptance": 1, "lines_accepted": 1,
        "lines_accepted_without_inspection": 0, "lost_track_incidents": 0,
        "turns_before_first_corrective": None, "correctives": [], "tool_failures": [],
        "notes": [], "wall_seconds": 1,
    }))
    (tmp_path / "t01.server_info.json").write_text(json.dumps({"sdk_version": "1.40.1"}))
    sys.argv = ["report.py", str(tmp_path)]
    report.main()
    assert "1.40.1" in capsys.readouterr().out


def test_accept_with_no_changes_is_shouted_about(tmp_path):
    """A baseline of zeros looks exactly like a baseline, so this must never pass quietly."""
    fixture = tmp_path / "fx"
    fixture.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main", str(fixture)], check=True)
    (fixture / "a.txt").write_text("one\n")
    for args in (["add", "-A"], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "s"]):
        subprocess.run(["git", "-C", str(fixture), *args], check=True)
    out = tmp_path / "out"
    # No edit between start and accept: the agent worked somewhere else.
    proc = subprocess.run(
        [sys.executable, str(BASE / "mark.py"), "--task", "t01",
         "--outdir", str(out), "--fixture", str(fixture)],
        input="t\nr\na\ny\nd\n", text=True, capture_output=True, check=True,
    )
    assert "ACCEPT CHANGED NOTHING IN THE FIXTURE" in proc.stdout
    assert "VITE_WORKING_DIR" in proc.stdout
    s = json.loads((out / "t01.summary.json").read_text())
    assert s["lines_accepted"] == 0
