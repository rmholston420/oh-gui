"""The grader decides every cell in the matrix, so it is tested directly rather than through a
browser run. The first matrix shipped a grader that could not fail; the second shipped one that
threw ReferenceError at the end of every cell because `node --check` validates syntax, not
resolution. Both would have been caught here."""
import json, os, shutil, subprocess, textwrap
from pathlib import Path
import pytest

HERE = Path(__file__).resolve().parents[1]
GRADE = HERE / "ui" / "grade.mjs"
VERIFY = HERE / "verify"
NODE = shutil.which("node")

pytestmark = pytest.mark.skipif(NODE is None, reason="node not on PATH")


def grade(fixture, task, venv):
    r = subprocess.run([NODE, str(GRADE), "--fixture", str(fixture), "--task", task,
                        "--verify", str(VERIFY), "--venv", str(venv)],
                       capture_output=True, text=True, timeout=600)
    assert r.returncode == 0, f"grader itself crashed:\n{r.stderr[-2000:]}"
    return json.loads(r.stdout)


@pytest.fixture(scope="module")
def seeded(tmp_path_factory):
    root = tmp_path_factory.mktemp("grade")
    fixture, venv = root / "fixture", root / "venv"
    r = subprocess.run(["bash", str(HERE / "seed_fixture.sh")],
                       env={**os.environ, "OH_GUI_BASELINE_FIXTURE": str(fixture),
                            "OH_GUI_BASELINE_VENV": str(venv)},
                       capture_output=True, text=True, timeout=900)
    if r.returncode != 0:
        pytest.skip(f"cannot seed here: {r.stderr[-300:]}")
    return fixture, venv / "bin" / "python"


def reset(fixture):
    subprocess.run(["git", "-C", str(fixture), "checkout", "--", "."], check=True)
    subprocess.run(["git", "-C", str(fixture), "clean", "-fdq"], check=True)


DELETE_ENDPOINT = textwrap.dedent('''

    @app.delete("/notes/{note_id}", status_code=204)
    def delete_note(note_id: int) -> None:
        if not store.delete(note_id):
            raise HTTPException(status_code=404, detail="note not found")
    ''')


def test_did_nothing_is_not_accepted(seeded):
    """The defect that invalidated the first matrix: agent changes nothing, harness says pass."""
    fixture, py = seeded
    reset(fixture)
    g = grade(fixture, "t01", py)
    assert g["fixture_tests"] == "pass", "fixture must be healthy on pristine"
    assert g["acceptance_gate"] == "fail"
    assert g["accepted"] is False


def test_task_done_is_accepted(seeded):
    fixture, py = seeded
    reset(fixture)
    (fixture / "notes_api" / "app.py").open("a").write(DELETE_ENDPOINT)
    try:
        g = grade(fixture, "t01", py)
        assert g["acceptance_gate"] == "pass"
        assert g["accepted"] is True
    finally:
        reset(fixture)


def test_task_done_but_regression_is_not_accepted(seeded):
    """Passing your own task while breaking someone else's is not acceptance."""
    fixture, py = seeded
    reset(fixture)
    app = fixture / "notes_api" / "app.py"
    app.open("a").write(DELETE_ENDPOINT)
    t = app.read_text().replace(
        'raise HTTPException(status_code=404, detail="note not found")\n    return {"id": note.id',
        'return {"id": 0, "title": "", "body": "", "tags": []}\n    return {"id": note.id', 1)
    app.write_text(t)
    try:
        g = grade(fixture, "t01", py)
        assert g["fixture_tests"] == "fail"
        assert g["accepted"] is False
    finally:
        reset(fixture)


def test_missing_venv_is_reported_not_guessed(seeded):
    fixture, _ = seeded
    g = grade(fixture, "t01", "/nonexistent/bin/python")
    assert g["fixture_tests"] == "no-venv" and g["acceptance_gate"] == "no-venv"
    assert g["accepted"] is False


def test_unknown_task_reports_no_gate(seeded):
    fixture, py = seeded
    reset(fixture)
    g = grade(fixture, "t99", py)
    assert g["acceptance_gate"] == "no-gate" and g["accepted"] is False


def test_gate_leaves_no_residue(seeded):
    fixture, py = seeded
    reset(fixture)
    grade(fixture, "t01", py)
    dirty = subprocess.run(["git", "-C", str(fixture), "status", "--porcelain",
                            "--untracked-files=all"], capture_output=True, text=True).stdout
    assert dirty.strip() == "", f"grader contaminated the fixture:\n{dirty}"
