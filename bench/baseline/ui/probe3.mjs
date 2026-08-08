/**
 * Stage 3 probe: the new-thread picker, and whether an edit is gated.
 *
 * Two questions left before the driver can be written.
 *
 * 1. WORKSPACE SELECTION. `conversation-panel-new-thread-picker` is labelled "Create thread folder
 *    — choose workspace or repository". If a conversation can be pointed at an existing directory,
 *    that is the correct answer to the fixture problem. Copying the fixture into a per-conversation
 *    subdirectory behind the app's back is the fallback, not the plan.
 *
 * 2. IS AN EDIT GATED. Twice now a probe has reported "accept vocabulary: NONE" from a screen where
 *    no edit was ever proposed — first from onboarding, then from a read-only `pwd` task. Absence
 *    of a gate is only meaningful if something was actually offered for approval. So this asks for
 *    a real file write and watches what appears.
 *
 * Also captures the driver's timing signals, since these are the metrics: when the first
 * agent-message appears, when conversation-status-working flips to conversation-status-check, and
 * whether stop-button presence tracks "agent is running".
 *
 * GPU is sampled throughout. Operator rule: redline 88 C, keep below 83.
 *
 * Run ON Colossus:  cd ~/dev/oh-gui/apps/gui && node ../../bench/baseline/ui/probe3.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(new URL("../../../apps/gui/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const INGRESS = process.env.OH_GUI_BASELINE_INGRESS || "http://127.0.0.1:8010";
const GPU_MAX_C = Number(process.env.GPU_MAX_C || 83);
const OUT = join(process.env.HOME, ".oh-gui", "baseline", "probe3");
mkdirSync(OUT, { recursive: true });

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
const shot = (p, n) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true })
  .catch((e) => say(`   (screenshot ${n}: ${e.message})`));

function gpu() {
  try {
    const q = "temperature.gpu,power.draw,memory.used";
    const o = execSync(`nvidia-smi --query-gpu=${q} --format=csv,noheader,nounits`,
      { encoding: "utf8" }).trim().split("\n")[0].split(",").map((s) => s.trim());
    return { tempC: Number(o[0]), watts: Number(o[1]), memMiB: Number(o[2]) };
  } catch { return null; }
}

const gpuSamples = [];
const gpuTimer = setInterval(() => {
  const g = gpu();
  if (!g) return;
  gpuSamples.push({ t: Number(el()), ...g });
  if (g.tempC >= GPU_MAX_C) say(`${el()}s !! GPU ${g.tempC}C >= ${GPU_MAX_C}C LIMIT`);
}, 5000);

async function has(page, id) { return (await page.locator(`[data-testid="${id}"]`).count()) > 0; }

async function ids(page) {
  return page.$$eval("[data-testid]", (e) =>
    [...new Set(e.map((x) => x.getAttribute("data-testid")))]);
}

const browser = await chromium.launch({ headless: !process.env.OH_GUI_HEADED });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));

try {
  const g0 = gpu();
  say(`GPU at start: ${g0 ? `${g0.tempC}C ${g0.watts}W ${g0.memMiB}MiB` : "unavailable"}`);
  await page.goto(INGRESS, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);

  const cors = errs.filter((e) => /CORS|ERR_FAILED|Access-Control/i.test(e));
  if (cors.length) { say(`!! API BLOCKED: ${cors[0]} — nothing below is valid`); throw new Error("blocked"); }

  // ---------- Q1: the new-thread picker ----------
  say(`\n===== Q1: new-thread picker =====`);
  const before = await ids(page);
  if (await has(page, "conversation-panel-new-thread-picker")) {
    await page.locator('[data-testid="conversation-panel-new-thread-picker"]').first().click();
    await page.waitForTimeout(2500);
    const after = await ids(page);
    const gained = after.filter((x) => !before.includes(x));
    say(`-- test ids that APPEARED (${gained.length}) --`);
    gained.forEach((x) => say(`   ${x}`));
    const fields = await page.$$eval("input,textarea,select", (es) => es.map((e) => ({
      tag: e.tagName.toLowerCase(), type: e.getAttribute("type"),
      tid: e.getAttribute("data-testid"), ph: e.getAttribute("placeholder"),
      aria: e.getAttribute("aria-label"), val: e.value,
    })).filter((f) => f.tid || f.ph || f.aria));
    say(`-- fields in the picker --`);
    fields.slice(0, 25).forEach((f) => say(
      `   ${f.tag}[${f.type}] tid=${f.tid} ph="${f.ph || ""}" aria="${f.aria || ""}" val="${(f.val||"").slice(0,60)}"`));
    const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    say(`-- does it mention a path, folder, workspace or repo? --`);
    ["workspace", "repository", "folder", "directory", "path", "/home/"].forEach((k) =>
      say(`   ${k}: ${txt.toLowerCase().includes(k.toLowerCase()) ? "YES" : "no"}`));
    await shot(page, "30-new-thread-picker");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
  } else { say("   MISSING conversation-panel-new-thread-picker"); }

  // ---------- Q2: is a WRITE gated ----------
  say(`\n===== Q2: write task — is an edit gated? =====`);
  const box = page.locator('[data-testid="chat-input"]').first();
  if (!(await box.count())) { say("   MISSING chat-input — cannot ask for a write"); throw new Error("no input"); }
  await box.click();
  await page.keyboard.type(
    "Create a new file named probe_calc.py containing a single function add(a, b) that returns a + b. " +
    "Then stop and tell me you are done.");
  await page.waitForTimeout(500);
  await shot(page, "31-write-task-typed");
  await page.locator('[data-testid="submit-button"]').first().click();
  say(`${el()}s submitted write task`);

  // Watch the signals the driver will depend on.
  let firstAgentMsg = null, firstWorking = null, firstDone = null, sawStop = false;
  const gateSeen = new Set();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(5000);
    const cur = await ids(page);
    if (!firstWorking && cur.includes("conversation-status-working")) {
      firstWorking = el(); say(`${el()}s status -> working`);
    }
    if (!sawStop && cur.includes("stop-button")) { sawStop = true; say(`${el()}s stop-button present`); }
    if (!firstAgentMsg && cur.includes("agent-message")) {
      firstAgentMsg = el(); say(`${el()}s FIRST agent-message`); await shot(page, "32-first-agent-message");
    }
    const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    (body.match(/\b(accept|approve|confirm|reject|apply changes|review changes|allow|deny)\b/gi) || [])
      .forEach((m) => gateSeen.add(m.toLowerCase()));
    if (cur.includes("conversation-status-check") && !cur.includes("stop-button")) {
      firstDone = el(); say(`${el()}s status -> check (idle) — agent finished`); break;
    }
  }
  await page.waitForTimeout(2000);
  await shot(page, "33-settled");

  say(`\n-- gate vocabulary seen DURING a real write: ${
    gateSeen.size ? [...gateSeen].join(", ") : "NONE"} --`);
  say(`   This time the precondition holds: a write was actually requested. If NONE, the agent`);
  say(`   writes without asking, matching the log's "Confirmation policy set to: NeverConfirm".`);

  // Did the file land, and does the Files tab show a diff?
  if (await has(page, "conversation-tab-files")) {
    await page.locator('[data-testid="conversation-tab-files"]').first().click();
    await page.waitForTimeout(2500);
    if (await has(page, "files-tab-refresh")) {
      await page.locator('[data-testid="files-tab-refresh"]').first().click();
      await page.waitForTimeout(2500);
    }
    const ftxt = (await page.locator('[data-testid="files-tab-content"]').innerText()
      .catch(() => "")).replace(/\s+/g, " ").slice(0, 900);
    say(`\n-- files-tab content --\n   ${ftxt || "(empty)"}`);
    say(`   probe_calc.py present in Files tab: ${ftxt.includes("probe_calc") ? "YES" : "NO"}`);
    await shot(page, "34-files-tab");
  }

  const url = page.url();
  say(`\nconversation url: ${url}`);
  const cid = (url.match(/conversations\/([0-9a-f-]{36})/) || [])[1];
  say(`conversation id: ${cid || "NOT PARSED"}`);
  if (cid) say(`expected cwd: ${process.env.HOME}/.oh-gui/baseline/fixture/${cid.replace(/-/g, "")}`);

  say(`\n-- timings --`);
  say(`   first agent-message: ${firstAgentMsg || "never"}s`);
  say(`   status->working:     ${firstWorking || "never"}s`);
  say(`   status->idle:        ${firstDone || "never"}s`);
} catch (err) {
  say(`\nPROBE3 FAILED: ${err.message}`);
  await shot(page, "99-failure");
} finally {
  clearInterval(gpuTimer);
  if (gpuSamples.length) {
    const t = gpuSamples.map((s) => s.tempC), w = gpuSamples.map((s) => s.watts);
    say(`\n-- GPU (${gpuSamples.length} samples) --`);
    say(`   temp  max ${Math.max(...t)}C  min ${Math.min(...t)}C`);
    say(`   power max ${Math.max(...w)}W`);
    say(`   vram  max ${Math.max(...gpuSamples.map((s) => s.memMiB))}MiB`);
    if (Math.max(...t) >= GPU_MAX_C) say(`   !! EXCEEDED ${GPU_MAX_C}C LIMIT`);
  }
  say(`\n-- console errors (${errs.length}) --`);
  [...new Set(errs)].slice(0, 10).forEach((e) => say(`   ${e}`));
  writeFileSync(join(OUT, "probe3.txt"), lines.join("\n") + "\n");
  writeFileSync(join(OUT, "gpu.json"), JSON.stringify(gpuSamples, null, 2));
  console.log(`\nwritten: ${join(OUT, "probe3.txt")}`);
  await browser.close();
}
