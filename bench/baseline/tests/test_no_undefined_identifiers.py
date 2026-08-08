"""`node --check` passes on code that throws ReferenceError, because an undefined identifier is a
runtime error, not a parse error. That gap shipped twice in one day, each time in the finally block
that runs AFTER the agent work is complete and paid for. This closes it."""
import shutil, subprocess
from pathlib import Path
import pytest

HERE = Path(__file__).resolve().parents[1]
UI = HERE / "ui"
CONFIG = UI / "eslint.undef.config.mjs"
ESLINT = HERE.parents[1] / "apps" / "gui" / "node_modules" / ".bin" / "eslint"


@pytest.mark.skipif(not ESLINT.exists(), reason="eslint not installed (apps/gui deps absent)")
def test_no_undefined_identifiers_in_harness_js():
    r = subprocess.run([str(ESLINT), "--no-config-lookup", "-c", str(CONFIG),
                        *[str(p) for p in sorted(UI.glob("*.mjs"))]],
                       capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, (
        "undefined identifiers in the harness — these throw at RUNTIME and node --check "
        f"cannot see them:\n{r.stdout}\n{r.stderr}")


def test_syntax_is_valid_too():
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    for f in sorted(UI.glob("*.mjs")):
        r = subprocess.run([node, "--check", str(f)], capture_output=True, text=True)
        assert r.returncode == 0, f"{f.name} does not parse:\n{r.stderr}"
