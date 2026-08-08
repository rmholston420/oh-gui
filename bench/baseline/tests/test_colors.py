"""Colour must never change what a log SAYS, only how it looks — and must vanish when piped, or
every artifact we paste into an ADR fills with escape codes."""
import json, re, shutil, subprocess, textwrap
from pathlib import Path
import pytest

HERE = Path(__file__).resolve().parents[1]
MOD = HERE / "ui" / "colors.mjs"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not on PATH")
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def run(body, env=None):
    r = subprocess.run([NODE, "--input-type=module", "-e",
                        f'import {{ green, yellow, red, outcomeLine, colorEnabled }} from "{MOD}";\n{body}'],
                       capture_output=True, text=True, timeout=60, env=env)
    assert r.returncode == 0, r.stderr
    return r.stdout


def test_no_ansi_when_piped():
    """subprocess pipes stdout, so isTTY is false — exactly the `| tee logfile` case."""
    out = run('console.log(green("ok") + red("bad") + yellow("meh"));')
    assert not ANSI.search(out), f"escape codes leaked into a pipe: {out!r}"
    assert "okbadmeh" in out


def test_forced_on_emits_ansi():
    import os
    env = dict(os.environ, OH_GUI_COLOR="1")
    assert ANSI.search(run('console.log(green("ok"));', env))


def test_no_color_env_wins_over_force_off():
    import os
    env = dict(os.environ, NO_COLOR="1")
    env.pop("OH_GUI_COLOR", None)
    assert not ANSI.search(run('console.log(red("bad"));', env))


def test_text_is_unchanged_when_stripped():
    out = run('console.log(JSON.stringify([green("a"), yellow("b"), red("c")]));')
    assert json.loads(out) == ["a", "b", "c"]


@pytest.mark.parametrize("kw,expect", [
    (dict(accepted=True, gate="pass", fixtureTests="pass", outcome="completed", filesChanged=2),
     "ACCEPTED=yes"),
    (dict(accepted=False, gate="fail", fixtureTests="pass", outcome="completed", filesChanged=2),
     "ACCEPTED=no"),
    (dict(accepted=False, gate="pass", fixtureTests="pass", outcome="completed", filesChanged=0),
     "did not attempt"),
    (dict(accepted=False, gate="no-venv", fixtureTests="—", outcome="completed", filesChanged=0),
     "ACCEPTED=UNKNOWN"),
    (dict(accepted=False, gate="no-gate", fixtureTests="pass", outcome="completed", filesChanged=1),
     "ACCEPTED=UNKNOWN"),
    (dict(accepted=False, gate="pass", fixtureTests="pass", outcome="aborted", filesChanged=1),
     "ACCEPTED=UNKNOWN"),
])
def test_outcome_severity_mapping(kw, expect):
    out = run(f'console.log(outcomeLine({json.dumps(kw)}));')
    assert expect in out


def test_harness_faults_are_red_and_model_failure_is_not():
    """The distinction the palette exists for: a model failing is data, a gate that cannot run
    invalidates the cell."""
    import os
    env = dict(os.environ, OH_GUI_COLOR="1")
    fault = run('console.log(outcomeLine({accepted:false,gate:"no-venv",outcome:"completed",filesChanged:0}));', env)
    model = run('console.log(outcomeLine({accepted:false,gate:"fail",fixtureTests:"pass",outcome:"completed",filesChanged:3}));', env)
    assert "\x1b[31;1m" in fault, "harness fault must be red"
    assert "\x1b[33m" in model and "\x1b[31;1m" not in model, "model failure must be yellow, not red"
