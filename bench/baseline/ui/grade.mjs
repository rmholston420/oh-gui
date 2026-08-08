/**
 * Grading for one baseline cell. Deliberately separate from drive_task.mjs and free of any
 * browser dependency, so it can be tested directly — see tests/test_grade_module.py.
 *
 * Two independent checks, and BOTH are required for acceptance:
 *   fixture_tests   — did anything pre-existing break? (regression)
 *   acceptance_gate — was the assigned task actually done? (verify/<task>.py)
 *
 * The fixture's own tests pass on untouched code, so `fixture_tests` alone cannot tell a model
 * that did the work from one that did nothing. In the first matrix a cell that changed zero files
 * in one turn was recorded as passing. Every gate in verify/ is proven to fail on the pristine
 * fixture by tests/test_gates_fail_on_pristine.py.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const classify = (e) =>
  e.status === 1 ? "fail"
  : e.status === 5 ? "no-tests"
  : e.status === undefined ? "not-run"
  // 2/3/4 are collection or usage errors: the HARNESS is broken, not the agent's code. t01 run 2
  // reported tests=fail when the truth was that the interpreter had no fastapi.
  : `harness-error(exit ${e.status})`;

export function gradeCell({ fixture, task, verifyDir, venvPy, timeoutMs = 300000 }) {
  venvPy = venvPy || join(dirname(fixture), "venv", "bin", "python");
  const out = {
    fixture_tests: null, fixture_tests_detail: null,
    acceptance_gate: "not-run", acceptance_gate_detail: null,
    accepted: false, gate_python: null,
  };

  if (!existsSync(venvPy)) {
    out.fixture_tests = "no-venv"; out.acceptance_gate = "no-venv"; return out;
  }
  try { out.gate_python = execFileSync(venvPy, ["--version"], { encoding: "utf8" }).trim(); } catch {}

  try {
    execFileSync(venvPy, ["-m", "pytest", "-q"], { cwd: fixture, encoding: "utf8", timeout: timeoutMs });
    out.fixture_tests = "pass";
  } catch (e) {
    out.fixture_tests_detail = `${e.stdout || ""}${e.stderr || ""}`.slice(-1500);
    out.fixture_tests = classify(e);
  }

  const src = join(verifyDir, `${task}.py`);
  if (!existsSync(src)) { out.acceptance_gate = "no-gate"; return out; }
  const dest = join(fixture, "_acceptance_gate.py");
  copyFileSync(src, dest);
  try {
    execFileSync(venvPy, ["-m", "pytest", "_acceptance_gate.py", "-q"],
      { cwd: fixture, encoding: "utf8", timeout: timeoutMs });
    out.acceptance_gate = "pass";
  } catch (e) {
    out.acceptance_gate_detail = `${e.stdout || ""}${e.stderr || ""}`.slice(-2000);
    out.acceptance_gate = e.status === 1 ? "fail" : `gate-error(exit ${e.status})`;
  } finally {
    rmSync(dest, { force: true });
  }

  // Task done AND nothing pre-existing broken. Either alone is not acceptance.
  out.accepted = out.acceptance_gate === "pass" && out.fixture_tests === "pass";
  return out;
}

// CLI so the grader can be run by hand against a fixture, and by the python tests.
if (process.argv[1] && process.argv[1].endsWith("grade.mjs")) {
  const a = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
  console.log(JSON.stringify(gradeCell({
    fixture: a("fixture"), task: a("task"),
    verifyDir: a("verify", join(dirname(new URL(import.meta.url).pathname), "..", "verify")),
    venvPy: a("venv"),
  }), null, 2));
}
