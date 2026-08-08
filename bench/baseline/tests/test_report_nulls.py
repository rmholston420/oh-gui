"""report.py crashed on int + NoneType and the first matrix ended with no report at all."""
import json, subprocess, sys
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]

CELL = {
    "task": "t01", "outcome": "completed", "wall_seconds": 300.0, "total_turns": 4,
    "event_count": 4, "started_utc": "2026-08-08T19:00:00Z",
    "time_to_first_review_s": None, "turns_to_acceptance": None, "lines_accepted": None,
    "lines_accepted_without_inspection": None, "accepts": None,
    "accepts_without_inspection": None, "lost_track_incidents": None,
    "turns_before_first_corrective": None, "corrective_encoded_durably": None,
    "correctives": [], "tool_failures": [], "notes": [],
    "automated": {"profile": "p", "files_changed": 2, "lines_written": 18, "accepted": True,
                  "acceptance_gate": "pass", "fixture_tests": "pass", "error_events_seen": 0,
                  "submit_to_first_message_s": 50.0, "submit_to_idle_s": 280.0,
                  "gate_python": "Python 3.12.7"},
}


def _run(tmp_path, cells):
    for c in cells:
        (tmp_path / f"{c['task']}.summary.json").write_text(json.dumps(c))
    r = subprocess.run([sys.executable, str(HERE / "report.py"), str(tmp_path)],
                       capture_output=True, text=True)
    assert r.returncode == 0, f"report crashed on nulls again:\n{r.stderr[-1500:]}"
    return r.stdout


def test_report_survives_all_null_human_metrics(tmp_path):
    out = _run(tmp_path, [CELL])
    assert "Accepted (task gate passed AND no regression): 1/1" in out


def test_report_flags_a_cell_that_changed_nothing(tmp_path):
    dud = json.loads(json.dumps(CELL))
    dud["task"] = "t04"
    dud["automated"].update(files_changed=0, lines_written=0, accepted=False,
                            acceptance_gate="fail")
    out = _run(tmp_path, [dud])
    assert "Changed no files at all: t04" in out
    assert "Accepted (task gate passed AND no regression): 0/1" in out
