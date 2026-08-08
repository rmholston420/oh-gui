"""The error harvester was keyed on a field the driver writes in a DIFFERENT PLACE, so it returned
None on every real cell while its own unit tests passed — they fed it a cid directly. These tests
read the cid the way the driver writes it, against a summary shaped like a real one.

Same defect shape as meta.json's working_dir (nested under `workspace`, read at top level). A unit
test that supplies the value bypasses the only thing that was broken: finding it.
"""
import json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
DRIVER = HERE / "ui" / "drive_task.mjs"


def test_driver_writes_cid_under_automated():
    """If the driver is ever changed to write it top-level, the readers below must change too."""
    src = DRIVER.read_text()
    auto = src.split("automated: {", 1)[1]
    assert re.search(r"conversation_id:\s*cid", auto), \
        "driver no longer writes conversation_id inside `automated` — update report.py and compare_blocks.py"


def _summary(cid):
    """Shaped like a real summary — every field report.py indexes directly, so a fixture gap
    cannot masquerade as a wiring failure."""
    return {"task": "t01", "outcome": "completed", "wall_seconds": 42.0,
            "total_turns": 3, "tool_failures": [], "event_count": 3, "notes": [],
            "time_to_first_review_s": None, "turns_to_acceptance": None,
            "lines_accepted": None, "lines_accepted_without_inspection": None,
            "accepts": None, "accepts_without_inspection": None,
            "lost_track_incidents": None, "turns_before_first_corrective": None,
            "corrective_encoded_durably": None, "correctives": [],
            "automated": {"profile": "p", "conversation_id": cid, "accepted": True,
                          "acceptance_gate": "pass", "fixture_tests": "pass",
                          "files_changed": 2, "lines_written": 10, "lines_removed": 0,
                          "submit_to_first_message_s": 5.0, "submit_to_idle_s": 42.0,
                          "workspace_verified": True, "error_events_seen": 0,
                          "console_errors": [], "untracked_files": [], "numstat": ""}}


def _run(script, run_dir):
    return subprocess.run([sys.executable, str(HERE / script), str(run_dir)],
                          capture_output=True, text=True, timeout=120)


def test_report_finds_nested_cid(tmp_path, monkeypatch):
    d = tmp_path / "20260808_1547_m_run"; d.mkdir()
    (d / "t01.summary.json").write_text(json.dumps(_summary("abc-123")))
    # A conversation store with one clean conversation: harvest must return 0, not None.
    root = tmp_path / "conv"; (root / "abc123" / "events").mkdir(parents=True)
    (root / "abc123" / "events" / "0.json").write_text('{"kind":"MessageEvent"}')
    monkeypatch.setenv("OH_GUI_CONV_ROOT", str(root))
    r = _run("report.py", d)
    assert r.returncode == 0, r.stderr
    row = [l for l in r.stdout.splitlines() if l.startswith("| t01 |") and "pass" in l]
    assert row, r.stdout
    # A readable, clean conversation is 0 errors. "?" here means the cid was never resolved.
    assert "?" not in row[-1], f"cid not resolved from nested field: {row[-1]}"


def test_compare_blocks_finds_nested_cid(tmp_path, monkeypatch):
    for name, cid in (("20260808_1547_a_run", "aaa"), ("20260808_1547_b_run", "bbb")):
        d = tmp_path / name; d.mkdir()
        (d / "t01.summary.json").write_text(json.dumps(_summary(cid)))
        s = tmp_path / "conv" / cid
        (s / "events").mkdir(parents=True)
        (s / "events" / "0.json").write_text('{"kind":"MessageEvent"}')
    monkeypatch.setenv("OH_GUI_CONV_ROOT", str(tmp_path / "conv"))
    r = subprocess.run([sys.executable, str(HERE / "compare_blocks.py"),
                        str(tmp_path / "20260808_1547_a_run"), str(tmp_path / "20260808_1547_b_run")],
                       capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    tool_err_col = [l for l in r.stdout.splitlines() if l.startswith("| a ")]
    assert tool_err_col, r.stdout
    assert "?" not in tool_err_col[0], f"cid not resolved, column still unknown: {tool_err_col[0]}"


def test_missing_cid_still_reports_unknown_not_zero(tmp_path):
    """A summary with no cid must read as unknown. Absence of a count is not a count of zero."""
    for name in ("20260808_1547_a_run", "20260808_1547_b_run"):
        d = tmp_path / name; d.mkdir()
        (d / "t01.summary.json").write_text(json.dumps(_summary(None)))
    r = subprocess.run([sys.executable, str(HERE / "compare_blocks.py"),
                        str(tmp_path / "20260808_1547_a_run"), str(tmp_path / "20260808_1547_b_run")],
                       capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    assert "| ? |" in r.stdout or "? |" in r.stdout
