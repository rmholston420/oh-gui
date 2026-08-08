"""A cell that graded the wrong directory and a model that did nothing both leave an empty git
diff. This is the only thing that can tell them apart, so it is tested directly."""
import json, shutil, subprocess, textwrap
from pathlib import Path
import pytest

HERE = Path(__file__).resolve().parents[1]
MOD = HERE / "ui" / "conversation_meta.mjs"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not on PATH")

CID = "93b1aa1d-8b4e-4fce-b9d9-27665a1e0686"
UNDASHED = CID.replace("-", "")


def check(cid, fixture, root):
    script = textwrap.dedent(f"""
        import {{ checkWorkspace }} from "{MOD}";
        console.log(JSON.stringify(checkWorkspace({json.dumps(cid)},
            {json.dumps(str(fixture))}, {{ root: {json.dumps(str(root))} }})));
    """)
    r = subprocess.run([NODE, "--input-type=module", "-e", script],
                       capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def write_meta(root, wd, cid=UNDASHED):
    d = root / cid
    d.mkdir(parents=True, exist_ok=True)
    # working_dir is nested under `workspace`, NOT top level — reading the top level is why an
    # earlier probe reported "NO CONVERSATION DIR" for a directory that existed.
    (d / "meta.json").write_text(json.dumps({"workspace": {"working_dir": str(wd),
                                                           "kind": "LocalWorkspace"}}))
    return d


def test_matching_workspace_passes(tmp_path):
    fixture = tmp_path / "fixture"; fixture.mkdir()
    write_meta(tmp_path / "conv", fixture)
    assert check(CID, fixture, tmp_path / "conv")["match"] is True


def test_dashed_id_resolves_to_undashed_directory(tmp_path):
    """The URL gives a dashed uuid; the directory on disk has no dashes."""
    fixture = tmp_path / "fixture"; fixture.mkdir()
    write_meta(tmp_path / "conv", fixture)
    r = check(CID, fixture, tmp_path / "conv")
    assert r["match"] is True and r["working_dir"] == str(fixture)


def test_wrong_workspace_is_a_hard_mismatch(tmp_path):
    fixture = tmp_path / "fixture"; fixture.mkdir()
    write_meta(tmp_path / "conv", tmp_path / "somewhere-else")
    r = check(CID, fixture, tmp_path / "conv")
    assert r["match"] is False and "somewhere-else" in r["reason"]


def test_missing_conversation_is_unknown_not_pass(tmp_path):
    """Unknown must never be silently treated as agreement."""
    fixture = tmp_path / "fixture"; fixture.mkdir()
    (tmp_path / "conv").mkdir()
    assert check(CID, fixture, tmp_path / "conv")["match"] is None


def test_meta_without_working_dir_is_unknown(tmp_path):
    fixture = tmp_path / "fixture"; fixture.mkdir()
    d = (tmp_path / "conv" / UNDASHED); d.mkdir(parents=True)
    (d / "meta.json").write_text(json.dumps({"conversation_id": CID}))
    r = check(CID, fixture, tmp_path / "conv")
    assert r["match"] is None and "working_dir" in r["reason"]


def test_no_conversation_id_is_unknown(tmp_path):
    fixture = tmp_path / "fixture"; fixture.mkdir()
    assert check(None, fixture, tmp_path / "conv")["match"] is None
