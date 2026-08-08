/**
 * Automated driver for ONE baseline task against the stock Agent Canvas run copy.
 *
 * Replaces the operator's hands in `mark.py`, and NOTHING ELSE. run_baseline.sh still owns the
 * GPU guard, the 1 Hz thermal CSV, the `ollama ps` sampler and server_info capture; this is
 * invoked in mark.py's place so there is one set of instrumentation, not two that can drift.
 *
 * WHAT IT CANNOT MEASURE, and therefore emits as null rather than 0:
 *   time_to_first_review_s, turns_to_acceptance, lines_accepted,
 *   lines_accepted_without_inspection, accepts, accepts_without_inspection,
 *   lost_track_incidents, turns_before_first_corrective
 * Those are human judgements, and two of them additionally have no accept gate to attach to
 * (probe3: Confirmation policy is NeverConfirm, the agent writes files unprompted). A zero there
 * would read as "never happened" when the truth is "not measurable this way". `lines_written` is
 * reported instead — read from git, which is a different and weaker claim, and is labelled as one.
 *
 * Usage: node drive_task.mjs --task t01 --outdir DIR --profile qwen3.6-27b [--timeout 1800]
 */
import { openSession, ids, has, ensureConfigured } from "./session.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TASKS = join(HERE, "..", "tasks");
const INGRESS = process.env.OH_GUI_BASELINE_INGRESS || "http://127.0.0.1:8010";
const FIXTURE = process.env.OH_GUI_BASELINE_FIXTURE || `${process.env.HOME}/oh-gui-baseline/fixture`;

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const TASK = arg("task"), OUTDIR = arg("outdir"), PROFILE = arg("profile");
const TIMEOUT_S = Number(arg("timeout", 1800));
if (!TASK || !OUTDIR || !PROFILE) {
  console.error("usage: drive_task.mjs --task t01 --outdir DIR --profile <name>"); process.exit(2);
}

const git = (...a) => execFileSync("git", ["-C", FIXTURE, ...a], { encoding: "utf8" }).trim();
const card = join(TASKS, readdirSync(TASKS).find((f) => f.startsWith(`${TASK}-`)) || "");
const CARD_TEXT = readFileSync(card, "utf8").trim();

const S = await openSession(`drive_${TASK}_${PROFILE.replace(/[^\w.-]/g, "_")}`);
const { page, say, shot, el, errs } = S;

const nowISO = () => new Date().toISOString();
let outcome = "aborted", failure = null;
const t = { submitted_s: null, first_message_s: null, idle_s: null };
let turns = 0, transcript = "", modelObserved = null, cid = null;

const click = async (id) => {
  if (!(await has(page, id))) { say(`   MISSING ${id}`); return false; }
  await page.locator(`[data-testid="${id}"]`).first().click({ timeout: 15000 });
  await page.waitForTimeout(1500); return true;
};

try {
  // ---- 1. restore the fixture. Non-negotiable: without this, task N+1 measures task N's edits.
  const seed = git("rev-list", "--max-parents=0", "HEAD");
  git("reset", "--hard", seed);
  git("clean", "-fdx");
  const dirty = git("status", "--porcelain");
  if (dirty) throw new Error(`fixture not clean after restore:\n${dirty}`);
  say(`fixture restored to ${seed.slice(0, 7)} — clean`);

  // ---- 2. open, configure, land in the workspace
  await page.goto(INGRESS, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  await ensureConfigured(page, say, shot);
  for (let i = 0; i < 3 && !(await has(page, "launch-workspace")); i++) {
    await click("conversation-panel-new-thread-picker");
  }
  if (!(await click("launch-workspace"))) throw new Error("could not launch into the workspace");
  await page.waitForTimeout(2500);

  // ---- 3. select the model, then VERIFY the selection took.
  // Selecting and assuming is how sixteen cells silently run on one model.
  await click("chat-input-llm-profile");
  const optId = `chat-input-llm-profile-option-${PROFILE}`;
  if (!(await click(optId))) {
    const avail = (await ids(page)).filter((x) => x.startsWith("chat-input-llm-profile-option-"));
    throw new Error(`profile "${PROFILE}" not offered. Available: ${avail.join(", ")}`);
  }
  await page.waitForTimeout(1500);
  const label = (await page.locator('[data-testid="chat-input-llm-profile"]').first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const stem = PROFILE.slice(0, 12);
  if (!label.includes(stem)) throw new Error(`profile did not switch: label "${label}" != "${PROFILE}"`);
  say(`profile: ${PROFILE} (label "${label}")`);
  await shot("10-configured");

  // ---- 4. submit the task card VERBATIM
  const box = page.locator('[data-testid="chat-input"]').first();
  if (!(await box.count())) throw new Error(`no chat-input on ${page.url()}`);
  await box.click();
  await page.keyboard.insertText(CARD_TEXT);
  await page.locator('[data-testid="submit-button"]').first().click();
  t.submitted_s = Number(el());
  say(`${t.submitted_s}s submitted ${TASK}`);

  // ---- 5. poll to idle
  for (let i = 0; i < TIMEOUT_S; i++) {
    await page.waitForTimeout(1000);
    const cur = await ids(page);
    const n = await page.locator('[data-testid="agent-message"]').count().catch(() => 0);
    if (n > turns) { turns = n; if (t.first_message_s === null) {
      t.first_message_s = Number(el()); say(`${t.first_message_s}s first agent message`);
      // Sample what Ollama actually loaded, once generation has demonstrably begun.
      try { modelObserved = execFileSync("ollama", ["ps"], { encoding: "utf8" })
        .split("\n").slice(1).map((l) => l.trim().split(/\s+/)[0]).filter(Boolean).join(","); } catch {}
    } }
    if (cur.includes("conversation-status-check") && !cur.includes("stop-button") && n > 0) {
      t.idle_s = Number(el()); say(`${t.idle_s}s idle after ${turns} agent messages`); break;
    }
  }
  if (t.idle_s === null) { failure = `timeout after ${TIMEOUT_S}s`; say(`   ${failure}`); }
  await shot("20-final");

  cid = (page.url().match(/conversations\/([0-9a-f-]{36})/) || [])[1] || null;
  transcript = (await page.locator('[data-testid="chat-scroll-container"]').innerText()
    .catch(() => "")).replace(/\r/g, "");
  outcome = t.idle_s !== null ? "completed" : "timeout";
} catch (err) {
  failure = err.message; outcome = "aborted";
  say(`\nDRIVER FAILED: ${err.message}`);
  await shot("99-failure");
} finally {
  // ---- 6. read what changed from git, not from the transcript's account of itself
  let numstat = "", filesChanged = 0, added = 0, removed = 0, untracked = [];
  try {
    numstat = git("diff", "--numstat");
    for (const line of numstat.split("\n").filter(Boolean)) {
      const [a, r] = line.split("\t"); filesChanged++;
      added += Number(a) || 0; removed += Number(r) || 0;
    }
    untracked = git("status", "--porcelain", "--untracked-files=all")
      .split("\n").filter((l) => l.startsWith("??")).map((l) => l.slice(3));
    for (const f of untracked) {
      try { added += readFileSync(join(FIXTURE, f), "utf8").split("\n").length; filesChanged++; } catch {}
    }
  } catch (e) { say(`   git read failed: ${e.message}`); }

  // Objective check the agent cannot talk its way past.
  let tests = null;
  try {
    execFileSync("python3", ["-m", "pytest", "-q"], { cwd: FIXTURE, encoding: "utf8", timeout: 300000 });
    tests = "pass";
  } catch (e) {
    tests = e.status === undefined ? "not-run" : "fail";
  }

  const summary = {
    task: TASK, outcome,
    started_utc: nowISO(), wall_seconds: Number(el()),
    // --- item 5 metrics that require a human, or an accept gate that does not exist ---
    time_to_first_review_s: null, turns_to_acceptance: null,
    lines_accepted: null, lines_accepted_without_inspection: null,
    accepts: null, accepts_without_inspection: null, lost_track_incidents: null,
    // --- item 6 ---
    turns_before_first_corrective: null, corrective_encoded_durably: null, correctives: [],
    // --- measured ---
    total_turns: turns, tool_failures: [], event_count: turns,
    notes: [
      "Automated run (drive_task.mjs). Single-shot: the task card is submitted verbatim once and " +
      "the agent runs unattended to idle. No human review, no follow-up turns, no accept gate " +
      "(Confirmation policy is NeverConfirm). Null metrics above are NOT ZERO — they are not " +
      "measurable this way.",
      failure ? `failure: ${failure}` : "",
    ].filter(Boolean),
    automated: {
      profile: PROFILE, model_observed_in_ollama: modelObserved,
      conversation_id: cid,
      submit_to_first_message_s: t.first_message_s !== null && t.submitted_s !== null
        ? Number((t.first_message_s - t.submitted_s).toFixed(1)) : null,
      submit_to_idle_s: t.idle_s !== null && t.submitted_s !== null
        ? Number((t.idle_s - t.submitted_s).toFixed(1)) : null,
      files_changed: filesChanged, lines_written: added, lines_removed: removed,
      untracked_files: untracked, numstat,
      fixture_tests: tests,
      console_errors: [...new Set(errs)].slice(0, 10),
    },
  };
  writeFileSync(join(OUTDIR, `${TASK}.summary.json`), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(OUTDIR, `${TASK}.transcript.txt`), transcript);
  say(`\noutcome=${outcome} turns=${turns} files=${filesChanged} +${added}/-${removed} tests=${tests}`);
  say(`summary: ${join(OUTDIR, `${TASK}.summary.json`)}`);
  await S.close();
  process.exit(outcome === "completed" ? 0 : 1);
}
