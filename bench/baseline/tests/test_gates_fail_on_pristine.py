"""A gate that passes on untouched code is not a gate.

The first matrix recorded `tests=pass` on a cell that changed zero files, because the fixture's own
tests pass on pristine code. These tests seed a clean fixture and assert that EVERY acceptance gate
fails on it — and that the fixture's own suite still passes, so a gate failure means the task was
not done rather than the fixture being broken.
"""
import os, shutil, subprocess, sys
from pathlib import Path
import pytest

HERE = Path(__file__).resolve().parents[1]
VERIFY = HERE / "verify"
TASKS = sorted(p.stem for p in VERIFY.glob("t0*.py"))


@pytest.fixture(scope="module")
def pristine(tmp_path_factory):
    root = tmp_path_factory.mktemp("baseline")
    fixture, venv = root / "fixture", root / "venv"
    env = {**os.environ, "OH_GUI_BASELINE_FIXTURE": str(fixture), "OH_GUI_BASELINE_VENV": str(venv)}
    r = subprocess.run(["bash", str(HERE / "seed_fixture.sh")], env=env,
                       capture_output=True, text=True, timeout=900)
    if r.returncode != 0:
        pytest.skip(f"fixture could not be seeded here: {r.stderr[-400:]}")
    return fixture, venv / "bin" / "python"


def test_fixture_own_suite_passes_on_pristine(pristine):
    fixture, py = pristine
    r = subprocess.run([str(py), "-m", "pytest", "-q"], cwd=fixture, capture_output=True, text=True)
    assert r.returncode == 0, f"seeded fixture is already broken:\n{r.stdout[-1500:]}"


@pytest.mark.parametrize("task", TASKS)
def test_every_gate_fails_on_pristine(pristine, task):
    fixture, py = pristine
    dest = fixture / "_acceptance_gate.py"
    shutil.copyfile(VERIFY / f"{task}.py", dest)
    try:
        r = subprocess.run([str(py), "-m", "pytest", "_acceptance_gate.py", "-q"],
                           cwd=fixture, capture_output=True, text=True)
    finally:
        dest.unlink(missing_ok=True)
    assert r.returncode != 0, (
        f"{task} gate PASSES on the pristine fixture — it cannot distinguish a model that did the "
        f"work from one that did nothing.\n{r.stdout[-1500:]}")


def test_every_task_card_has_a_gate():
    cards = {p.name.split("-")[0] for p in (HERE / "tasks").glob("t0*.md")}
    assert cards - set(TASKS) == set(), f"task cards with no acceptance gate: {cards - set(TASKS)}"
