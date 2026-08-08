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
import { gradeCell } from "./grade.mjs";
import { pointAtModel, bindRestoreToExit } from "./default_profile.mjs";
import { checkWorkspace } from "./conversation_meta.mjs";
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

// The first matrix logged `litellm.NotFoundError: model 'devstral-small-2:24b' not found` on every
// cell: the default profile points at a model that was never pulled and is invoked mid-run by
// auxiliary machinery. Repoint it at this cell's model, with restoration that survives Ctrl-C.
// See ui/default_profile.mjs — it is a separate module because it mutates the operator's config.
bindRestoreToExit();
{
  // Must happen BEFORE the conversation exists: the app reads the default profile for title
  // generation as soon as the first message lands. Run 2 of t01 still logged a non-fatal
  // "Agent error" at 55s because this call was missing entirely — the import was present and
  // never invoked, which node --check and no-undef both accept without complaint.
  const dp = pointAtModel(PROFILE);
  if (dp.recovered) say("recovered a default-profile backup left by an interrupted run");
  say(dp.changed
    ? `default profile: ${dp.from} -> ${dp.to} (restored on exit)`
    : `default profile already ${dp.to ?? "unreadable"}`);
}
const t = { submitted_s: null, first_message_s: null, idle_s: null };
let turns = 0, transcript = "", modelObserved = null, cid = null;
// match:null = UNKNOWN. Unknown is not a pass; it is recorded as such in the summary.
let ws = { match: null, working_dir: null, reason: "workspace never checked" };
const errorsSeen = [];

const profileLabel = async () => (await page.locator('[data-testid="chat-input-llm-profile"]')
  .first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();

const selectProfile = async () => {
  const stem = PROFILE.slice(0, 12);
  if ((await profileLabel()).includes(stem)) { say(`profile already ${PROFILE}`); return; }
  await click("chat-input-llm-profile");
  const optId = `chat-input-llm-profile-option-${PROFILE}`;
  if (!(await click(optId))) {
    const avail = (await ids(page)).filter((x) => x.startsWith("chat-input-llm-profile-option-"));
    throw new Error(`profile "${PROFILE}" not offered. Available: ${avail.join(", ")}`);
  }
  await page.waitForTimeout(1500);
  const label = await profileLabel();
  if (!label.includes(stem)) throw new Error(`profile did not switch: label "${label}" != "${PROFILE}"`);
  say(`profile: ${PROFILE} (label "${label}")`);
};

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
  // ---- 3. select the model FIRST, on the home screen.
  // t01 run 1: launch-workspace creates the conversation on whatever profile is already selected,
  // so the conversation was born on the 35b and its title generation ran on the 35b before the
  // switch landed — the ollama sampler caught the 35b resident from 14:00:30 to 14:00:40 during a
  // 27b cell. On a 2x8 matrix that quietly corrupts both VRAM state and timings. Set the profile
  // before the conversation exists.
  await selectProfile();
  for (let i = 0; i < 3 && !(await has(page, "launch-workspace")); i++) {
    await click("conversation-panel-new-thread-picker");
  }
  if (!(await click("launch-workspace"))) throw new Error("could not launch into the workspace");
  await page.waitForTimeout(2500);
  // Confirm it survived conversation creation rather than assuming it did.
  await selectProfile();

  // The conversation now exists, so the app has written down where it will work. Check that
  // against the directory we are about to grade, BEFORE spending a model call. A mismatch and a
  // model that does nothing both produce an empty git diff, so this cannot be caught afterwards.
  cid = (page.url().match(/conversations\/([0-9a-f-]{36})/) || [])[1] || null;
  ws = checkWorkspace(cid, FIXTURE);
  if (ws.match === true) say(`workspace confirmed: ${ws.working_dir}`);
  else if (ws.match === false) throw new Error(`WRONG WORKSPACE — ${ws.reason}`);
  else say(`workspace UNVERIFIED: ${ws.reason} — results for this cell are not auditable`);

  await shot("10-configured");

  // ---- 4. submit the task card VERBATIM
  const box = page.locator('[data-testid="chat-input"]').first();
  if (!(await box.count())) throw new Error(`no chat-input on ${page.url()}`);
  await box.click();
  await page.keyboard.insertText(CARD_TEXT);
  // Assert the text actually landed in the box before claiming it was submitted. t01's first run
  // sat for six minutes with no LLM traffic at all, and nothing in the driver could tell me
  // whether the message was never sent or the run had started and died.
  const typed = await box.inputValue().catch(async () =>
    (await box.innerText().catch(() => "")));
  say(`chat input holds ${typed.length} chars (card is ${CARD_TEXT.length})`);
  if (typed.length < 20) throw new Error(`card did not land in the chat input (got ${typed.length} chars)`);
  await page.locator('[data-testid="submit-button"]').first().click();
  await page.waitForTimeout(2000);
  const after = await box.inputValue().catch(() => "");
  say(`after submit the input holds ${after.length} chars${after.length ? " — MESSAGE MAY NOT HAVE SENT" : " (cleared)"}`);
  const userMsgs = await page.locator('[data-testid="user-message"]').count().catch(() => 0);
  say(`user-message bubbles on screen: ${userMsgs}`);
  if (userMsgs === 0) say(`   WARNING: no user message rendered — the submit may not have registered`);
  t.submitted_s = Number(el());
  say(`${t.submitted_s}s submitted ${TASK}`);

  // ---- 5. poll to idle, saying out loud what it sees
  // v2 matched any line containing "error", so it recorded the agent's own narration
  // ("Interesting - there's a TypeError in store.py") as an error event. Match only machine-shaped
  // failures and the app's own error banner.
  const ERR_RE = /^(agent error|.*\b(litellm\.[A-Za-z]*Error|NotFoundError|ConnectionError|APIError|RateLimitError)\b.*|.*\b(model .* not found|connection refused|unauthorized|context length exceeded)\b.*)$/i;
  let stall = 0, lastN = 0, idleFor = 0;
  for (let i = 0; i < TIMEOUT_S; i++) {
    await page.waitForTimeout(1000);
    const n = await page.locator('[data-testid="agent-message"]').count().catch(() => 0);

    // Heartbeat. A run that prints nothing for thirty minutes is indistinguishable from a hung one.
    // Every conversation-status-* id is present in the DOM at all times — `-error` was in the
    // very first sample, one second in, before anything had happened. Presence is not state.
    // Only visibility is.
    const running = await page.locator('[data-testid="stop-button"]').first()
      .isVisible().catch(() => false);
    if (i % 15 === 0) {
      const vis = [];
      for (const s of ["working", "active", "check", "error"]) {
        if (await page.locator(`[data-testid="conversation-status-${s}"]`).first()
          .isVisible().catch(() => false)) vis.push(s);
      }
      say(`   [${el()}s] visible-status=${vis.join(",") || "none"} | ` +
          `${running ? "RUNNING" : "not running"} | agent-messages=${n}`);
    }

    // "Agent error" is a TRANSIENT inline event: t01 run 2 hit one, recovered, and finished the
    // task correctly — and my detector killed the run and stamped it a timeout. Errors are
    // COUNTED, not fatal. Only the stall detector and idle decide when a run is over.
    if (i % 5 === 0) {
      const body = await page.locator("body").innerText().catch(() => "");
      for (const line of body.split("\n").map((l) => l.trim())) {
        if (line.length > 6 && line.length < 200 && ERR_RE.test(line)
            && !/error_detail/.test(line) && !errorsSeen.includes(line)) {
          errorsSeen.push(line); say(`   [${el()}s] error event (non-fatal, recorded): ${line}`);
        }
      }
    }

    // Nothing moving and nothing running: stop early rather than burn the timeout.
    if (n === lastN && !running) stall++; else stall = 0;
    lastN = n;
    if (stall >= 180) {
      failure = n === 0
        ? "no agent activity for 180s and nothing running — run never started"
        : `stalled: no new message for 180s with nothing running (after ${n} messages)`;
      say(`   ${failure}`); break;
    }
    if (n > turns) { turns = n; if (t.first_message_s === null) {
      t.first_message_s = Number(el()); say(`${t.first_message_s}s first agent message`);
      // Sample what Ollama actually loaded, once generation has demonstrably begun.
      try { modelObserved = execFileSync("ollama", ["ps"], { encoding: "utf8" })
        .split("\n").slice(1).map((l) => l.trim().split(/\s+/)[0]).filter(Boolean).join(","); } catch {}
    } }
    if (!running && n > 0) {
      idleFor++;
      if (idleFor >= 8) {   // 8 consecutive seconds not running — not a gap between tool calls
        t.idle_s = Number(el()); say(`${t.idle_s}s idle after ${turns} agent messages`); break;
      }
    } else idleFor = 0;
  }
  if (t.idle_s === null && !failure) { failure = `timeout after ${TIMEOUT_S}s`; say(`   ${failure}`); }
  if (t.idle_s === null) {
    // Dump what is on screen. On a failure the screen is the evidence, and it is about to close.
    say(`\n-- screen at failure --`);
    say(`   url: ${page.url()}`);
    say(`   ids: ${(await ids(page)).filter((x) => /status|message|error|stop|chat/i.test(x)).join(", ")}`);
    const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    say(`   body tail: ${body.slice(-1200)}`);
  }
  await shot("20-final");

  cid = (page.url().match(/conversations\/([0-9a-f-]{36})/) || [])[1] || cid;
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

  // Objective checks the agent cannot talk its way past. Both required for acceptance.
  const g = gradeCell({ fixture: FIXTURE, task: TASK, verifyDir: join(HERE, "..", "verify") });
  const tests = g.fixture_tests, gate = g.acceptance_gate;

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
      workspace_verified: ws.match, agent_working_dir: ws.working_dir,
      workspace_note: ws.reason || null,
      submit_to_first_message_s: t.first_message_s !== null && t.submitted_s !== null
        ? Number((t.first_message_s - t.submitted_s).toFixed(1)) : null,
      submit_to_idle_s: t.idle_s !== null && t.submitted_s !== null
        ? Number((t.idle_s - t.submitted_s).toFixed(1)) : null,
      files_changed: filesChanged, lines_written: added, lines_removed: removed,
      untracked_files: untracked, numstat,
      ...g,
      error_events_seen: errorsSeen,
      console_errors: [...new Set(errs)].slice(0, 10),
    },
  };
  writeFileSync(join(OUTDIR, `${TASK}.summary.json`), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(OUTDIR, `${TASK}.transcript.txt`), transcript);
  say(`\noutcome=${outcome} turns=${turns} files=${filesChanged} +${added}/-${removed} ` +
      `tests=${tests} gate=${gate} ACCEPTED=${g.accepted ? "yes" : "NO"}`);
  say(`summary: ${join(OUTDIR, `${TASK}.summary.json`)}`);
  if (outcome !== "completed" && process.env.OH_GUI_KEEP_OPEN === "1") {
    say(`\nOH_GUI_KEEP_OPEN=1 — leaving the browser up for 300s so you can look at it yourself.`);
    await page.waitForTimeout(300000);
  }
  await S.close();
  process.exit(outcome === "completed" ? 0 : 1);
}
