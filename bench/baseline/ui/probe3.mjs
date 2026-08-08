/**
 * Stage 3 probe: the new-thread picker, and whether an edit is gated.
 *
 * Fully recorded — see session.mjs. After any run:
 *   cd ~/dev/oh-gui/apps/gui && bash ../../bench/baseline/ui/watch.sh probe3
 * Watch it live instead:  OH_GUI_HEADED=1 OH_GUI_SLOWMO=400 node ...
 *
 * Q1 WORKSPACE SELECTION. `conversation-panel-new-thread-picker` is labelled "Create thread folder
 *    — choose workspace or repository". If a conversation can be aimed at an existing directory,
 *    that beats copying the fixture into a per-conversation subdir behind the app's back.
 *
 * Q2 IS AN EDIT GATED. Two probes have now reported "accept vocabulary: NONE" from screens where
 *    nothing was ever offered for approval — first onboarding, then a read-only `pwd`. Absence is
 *    only evidence if the thing could have appeared. So this asks for a real file write.
 *
 * Also captures the driver's timing signals: first agent-message, working -> check transition,
 * and whether stop-button presence tracks "agent is running".
 *
 * GPU sampled throughout. Operator rule: redline 88 C, stay under 83.
 *
 * Run ON Colossus:  cd ~/dev/oh-gui/apps/gui && node ../../bench/baseline/ui/probe3.mjs
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { openSession, ids, has } from "./session.mjs";

const INGRESS = process.env.OH_GUI_BASELINE_INGRESS || "http://127.0.0.1:8010";
const GPU_MAX_C = Number(process.env.GPU_MAX_C || 83);

function gpu() {
  try {
    const o = execSync(
      "nvidia-smi --query-gpu=temperature.gpu,power.draw,memory.used --format=csv,noheader,nounits",
      { encoding: "utf8" }).trim().split("\n")[0].split(",").map((s) => s.trim());
    return { tempC: Number(o[0]), watts: Number(o[1]), memMiB: Number(o[2]) };
  } catch { return null; }
}

const S = await openSession("probe3");
const { page, say, shot, el, errs, dir } = S;
const gpuSamples = [];
const gpuTimer = setInterval(() => {
  const g = gpu(); if (!g) return;
  gpuSamples.push({ t: Number(el()), ...g });
  if (g.tempC >= GPU_MAX_C) say(`${el()}s !! GPU ${g.tempC}C >= ${GPU_MAX_C}C LIMIT`);
}, 5000);

let result = {};
try {
  const g0 = gpu();
  say(`GPU at start: ${g0 ? `${g0.tempC}C ${g0.watts}W ${g0.memMiB}MiB` : "unavailable"}`);
  await page.goto(INGRESS, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);

  const cors = errs.filter((e) => /CORS|ERR_FAILED|Access-Control/i.test(e));
  if (cors.length) { say(`!! API BLOCKED: ${cors[0]} — nothing below is valid`); throw new Error("api blocked"); }

  // Name the screen BEFORE reporting anything about it.
  const first = await ids(page);
  say(`\nlanded on: ${page.url()}  (${first.length} test ids)`);
  const isOnboarding = first.some((x) => x.startsWith("onboarding-"));
  say(`onboarding wizard: ${isOnboarding ? "YES — driving it" : "no"}`);
  await shot("10-landed");

  const click = async (id) => {
    if (await has(page, id)) {
      await page.locator(`[data-testid="${id}"]`).first().click();
      await page.waitForTimeout(1500); say(`   clicked ${id}`); return true;
    }
    say(`   MISSING ${id}`); return false;
  };
  const fill = async (id, v) => {
    if (await has(page, id)) {
      await page.locator(`[data-testid="${id}"]`).first().fill(v);
      say(`   filled ${id} = ${v}`); return true;
    }
    say(`   MISSING ${id}`); return false;
  };

  if (isOnboarding) {
    say(`\n-- onboarding --`);
    await click("onboarding-agent-option-openhands");
    await click("onboarding-agent-next");
    await page.waitForTimeout(1500);
    await click("sdk-section-advanced-toggle");
    await fill("llm-custom-model-input",
      process.env.OH_GUI_BASELINE_MODEL || "ollama_chat/qwen3.6:35b-a3b-mtp-q4_K_M");
    await fill("base-url-input", process.env.OH_GUI_OLLAMA_URL || "http://localhost:11434");
    await fill("llm-api-key-input", "ollama");
    await click("onboarding-llm-next");
    await page.waitForTimeout(2000);
    // Skip hello: it seeds a conversation and burns a model call. We want one we drive.
    if (!(await click("onboarding-skip"))) await click("onboarding-hello-close");
    await page.waitForTimeout(3000);
    const after = await ids(page);
    say(`   after onboarding: ${page.url()} (${after.length} ids), still onboarding: ${
      after.some((x) => x.startsWith("onboarding-")) ? "YES" : "no"}`);
    await shot("11-after-onboarding");
  }

  // ---------- Q1 ----------
  say(`\n===== Q1: new-thread picker =====`);
  const before = await ids(page);
  if (await has(page, "conversation-panel-new-thread-picker")) {
    await page.locator('[data-testid="conversation-panel-new-thread-picker"]').first().click();
    await page.waitForTimeout(2500);
    const gained = (await ids(page)).filter((x) => !before.includes(x));
    say(`-- ids that APPEARED (${gained.length}) --`);
    gained.forEach((x) => say(`   ${x}`));
    const fields = await page.$$eval("input,textarea,select", (es) => es.map((e) => ({
      tag: e.tagName.toLowerCase(), type: e.getAttribute("type"), tid: e.getAttribute("data-testid"),
      ph: e.getAttribute("placeholder"), aria: e.getAttribute("aria-label"), val: e.value,
    })).filter((f) => f.tid || f.ph || f.aria));
    say(`-- fields --`);
    fields.slice(0, 25).forEach((f) => say(
      `   ${f.tag}[${f.type}] tid=${f.tid} ph="${f.ph || ""}" aria="${f.aria || ""}" val="${(f.val || "").slice(0, 60)}"`));
    const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    say(`-- mentions --`);
    ["workspace", "repository", "folder", "directory", "path", "/home/"].forEach((k) =>
      say(`   ${k}: ${txt.toLowerCase().includes(k.toLowerCase()) ? "YES" : "no"}`));
    result.picker_ids = gained;
    await shot("30-new-thread-picker");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
  } else {
    say(`   MISSING conversation-panel-new-thread-picker on ${page.url()}`);
    say(`   (statement about THIS screen only)`);
  }

  // ---------- Q2 ----------
  say(`\n===== Q2: write task — is an edit gated? =====`);
  const box = page.locator('[data-testid="chat-input"]').first();
  if (!(await box.count())) {
    say(`   MISSING chat-input on ${page.url()} — cannot request a write.`);
    say(`   That is a claim about THIS screen, not about the app lacking a chat input.`);
    throw new Error("no chat-input on " + page.url());
  }
  await box.click();
  await page.keyboard.type(
    "Create a new file named probe_calc.py containing a single function add(a, b) that returns a + b. " +
    "Then stop and tell me you are done.");
  await shot("31-write-task-typed");
  await page.locator('[data-testid="submit-button"]').first().click();
  say(`${el()}s submitted write task`);

  let firstAgentMsg = null, firstWorking = null, firstDone = null, sawStop = false;
  const gate = new Set();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(5000);
    const cur = await ids(page);
    if (!firstWorking && cur.includes("conversation-status-working")) { firstWorking = el(); say(`${el()}s status -> working`); }
    if (!sawStop && cur.includes("stop-button")) { sawStop = true; say(`${el()}s stop-button present`); }
    if (!firstAgentMsg && cur.includes("agent-message")) {
      firstAgentMsg = el(); say(`${el()}s FIRST agent-message`); await shot("32-first-agent-message");
    }
    const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    (body.match(/\b(accept|approve|confirm|reject|apply changes|review changes|allow|deny)\b/gi) || [])
      .forEach((m) => gate.add(m.toLowerCase()));
    if (cur.includes("conversation-status-check") && !cur.includes("stop-button")) {
      firstDone = el(); say(`${el()}s status -> check (idle)`); break;
    }
  }
  await page.waitForTimeout(2000);
  await shot("33-settled");

  say(`\n-- gate vocabulary during a REAL write: ${gate.size ? [...gate].join(", ") : "NONE"} --`);
  say(`   Precondition holds this time: a write was actually requested.`);

  if (await has(page, "conversation-tab-files")) {
    await page.locator('[data-testid="conversation-tab-files"]').first().click();
    await page.waitForTimeout(2500);
    if (await has(page, "files-tab-refresh")) {
      await page.locator('[data-testid="files-tab-refresh"]').first().click();
      await page.waitForTimeout(2500);
    }
    const ftxt = (await page.locator('[data-testid="files-tab-content"]').innerText()
      .catch(() => "")).replace(/\s+/g, " ").slice(0, 900);
    say(`\n-- files-tab --\n   ${ftxt || "(empty)"}`);
    say(`   probe_calc.py visible: ${ftxt.includes("probe_calc") ? "YES" : "NO"}`);
    await shot("34-files-tab");
  }

  const url = page.url();
  const cid = (url.match(/conversations\/([0-9a-f-]{36})/) || [])[1];
  say(`\nconversation: ${cid || "NOT PARSED"}`);
  if (cid) say(`expected cwd: ${process.env.HOME}/.oh-gui/baseline/fixture/${cid.replace(/-/g, "")}`);
  say(`\n-- timings --`);
  say(`   first agent-message: ${firstAgentMsg || "never"}s`);
  say(`   status->working:     ${firstWorking || "never"}s`);
  say(`   status->idle:        ${firstDone || "never"}s`);
  result = { ...result, conversation_id: cid, gate: [...gate], firstAgentMsg, firstWorking, firstDone };
} catch (err) {
  say(`\nPROBE3 FAILED: ${err.message}`);
  say(`   url: ${page.url()}`);
  try {
    const seen = await ids(page);
    say(`   ${seen.length} ids on the failing screen:`);
    seen.slice(0, 80).forEach((x) => say(`      ${x}`));
    say(`   text: ${(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600)}`);
  } catch (e2) { say(`   (inventory failed: ${e2.message})`); }
  await shot("99-failure");
  result.error = err.message;
} finally {
  clearInterval(gpuTimer);
  if (gpuSamples.length) {
    const t = gpuSamples.map((s) => s.tempC);
    say(`\n-- GPU (${gpuSamples.length} samples) --`);
    say(`   temp max ${Math.max(...t)}C  power max ${Math.max(...gpuSamples.map((s) => s.watts))}W  vram max ${Math.max(...gpuSamples.map((s) => s.memMiB))}MiB`);
    if (Math.max(...t) >= GPU_MAX_C) say(`   !! EXCEEDED ${GPU_MAX_C}C`);
  }
  say(`\n-- console errors (${errs.length}) --`);
  [...new Set(errs)].slice(0, 10).forEach((e) => say(`   ${e}`));
  writeFileSync(join(dir, "gpu.json"), JSON.stringify(gpuSamples, null, 2));
  await S.close({ gpu_max_c: gpuSamples.length ? Math.max(...gpuSamples.map((s) => s.tempC)) : null, ...result });
}
