"""The speedup number is the one that decides ADR-010, so the arithmetic and the pairing rule are
tested rather than trusted."""
import json, subprocess, sys
from pathlib import Path

SUM = Path(__file__).resolve().parents[1] / "summarize_mtp.py"


def rec(model, task, rep, tps):
    return {"model": model, "task": task, "rep": rep, "gen_tok_per_s": tps,
            "eval_count": 100, "gpu": {"temp_after_c": 70}}


def write(tmp, recs):
    for i, r in enumerate(recs):
        (tmp / f"{i:03d}.json").write_text(json.dumps(r))
    return subprocess.run([sys.executable, str(SUM), str(tmp)],
                          capture_output=True, text=True, timeout=60)


def test_speedup_uses_median_and_is_correct(tmp_path):
    recs = [rec("qwen3.6:27b", "short_gen", i, v) for i, v in enumerate([10.0, 20.0, 30.0])]
    recs += [rec("qwen3.6:27b-mtp-q4_K_M", "short_gen", i, v) for i, v in enumerate([30.0, 40.0, 50.0])]
    r = write(tmp_path, recs)
    assert r.returncode == 0, r.stderr
    assert "**2.00x**" in r.stdout          # median 40 / median 20
    assert "20.0" in r.stdout and "40.0" in r.stdout


def test_no_pair_means_no_speedup_claimed(tmp_path):
    """Two different model SIZES must not be divided by each other."""
    recs = [rec("qwen3.6:27b", "short_gen", 1, 20.0),
            rec("qwen3.6:35b-a3b-mtp-q4_K_M", "short_gen", 1, 60.0)]
    r = write(tmp_path, recs)
    assert r.returncode == 0, r.stderr
    assert "No same-base plain/MTP pair" in r.stdout
    assert "x**" not in r.stdout


def test_errored_cells_are_excluded(tmp_path):
    recs = [rec("qwen3.6:27b", "short_gen", 1, 20.0),
            {"model": "qwen3.6:27b", "task": "short_gen", "rep": 2, "error": "connection refused"},
            rec("qwen3.6:27b-mtp-q4_K_M", "short_gen", 1, 40.0)]
    r = write(tmp_path, recs)
    assert r.returncode == 0 and "(n=1)" in r.stdout


def test_missing_token_count_is_not_treated_as_zero(tmp_path):
    recs = [rec("qwen3.6:27b", "short_gen", 1, None),
            rec("qwen3.6:27b", "short_gen", 2, 20.0)]
    r = write(tmp_path, recs)
    assert r.returncode == 0 and "(n=1)" in r.stdout


def test_peak_temperature_reported(tmp_path):
    a = rec("qwen3.6:27b", "short_gen", 1, 20.0); a["gpu"]["temp_after_c"] = 81
    r = write(tmp_path, [a])
    assert "81C" in r.stdout
