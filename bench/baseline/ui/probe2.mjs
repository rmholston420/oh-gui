/**
 * Stage 2 probe: complete onboarding, send one trivial task, inventory the conversation view.
 *
 * Stage 1 only saw the first-run onboarding screen. The metrics live in the conversation view,
 * which nothing has looked at yet. This probe drives the three onboarding steps found in stage 1
 * (choose-agent -> setup-llm -> say-hello), submits `pwd`, and reports what the resulting screen
 * exposes.
 *
 * Two open questions it exists to answer, both of which change the driver's shape:
 *   1. Does the app gate file edits behind an explicit accept, or does the agent just write?
 *      "Turns to acceptance" and "lines accepted" mean different things in each case.
 *   2. What signals "the agent's first proposal is reviewable" and "the agent is done"? Without a
 *      reliable pair of signals there is no time-to-first-review and no turn boundary.
 *
 * `pwd` also settles the working directory from the agent's own view, which the landing page
 * would not show.
 *
 * Run ON Colossus:
 *   cd ~/dev/oh-gui/apps/gui && node ../../bench/baseline/ui/probe2.mjs
 *
 * Env: OH_GUI_BASELINE_MODEL (default ollama_chat/qwen3.6:35b-a3b-mtp-q4_K_M)
 *      OH_GUI_OLLAMA_URL     (default http://localhost:11434)
 *      OH_GUI_HEADED=1       watch it drive
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../apps/gui/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const INGRESS = process.env.OH_GUI_BASELINE_INGRESS || "http://localhost:8010";
const MODEL = process.env.OH_GUI_BASELINE_MODEL || "ollama_chat/qwen3.6:35b-a3b-mtp-q4_K_M";
const OLLAMA = process.env.OH_GUI_OLLAMA_URL || "http://localhost:11434";
const OUT = join(process.env.HOME, ".oh-gui", "baseline", "probe2");
mkdirSync(OUT, { recursive: true });

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const shot = async (p, n) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true })
  .catch((e) => say(`   (screenshot ${n} failed: ${e.message})`));

async function tid(page, id) { return page.locator(`[data-testid="${id}"]`); }

async function clickIf(page, id, label) {
  const el = await tid(page, id);
  if (await el.count()) {
    await el.first().click({ timeout: 15000 }).catch((e) => say(`   click ${id} failed: ${e.message}`));
    say(`   clicked ${id}${label ? ` (${label})` : ""}`);
    await page.waitForTimeout(1200);
    return true;
  }
  say(`   MISSING ${id}`);
  return false;
}

async function fillIf(page, id, value) {
  const el = await tid(page, id);
  if (!(await el.count())) { say(`   MISSING ${id}`); return false; }
  await el.first().fill(value, { timeout: 15000 })
    .catch((e) => say(`   fill ${id} failed: ${e.message}`));
  say(`   filled ${id} = ${value}`);
  return true;
}

async function inventory(page, label, { max = 200 } = {}) {
  say(`\n===== ${label} =====`);
  say(`url: ${page.url()}`);
  const ids = await page.$$eval("[data-testid]", (els) =>
    [...new Set(els.map((e) => `${e.getAttribute("data-testid")} <${e.tagName.toLowerCase()}>`))]);
  say(`-- data-testid (${ids.length}) --`);
  ids.slice(0, max).forEach((t) => say(`   ${t}`));

  const btns = await page.getByRole("button").all();
  const names = [];
  for (const b of btns.slice(0, 60)) {
    const n = (await b.getAttribute("aria-label")) || (await b.innerText().catch(() => "")) || "";
    const t = await b.getAttribute("data-testid");
    const vis = await b.isVisible().catch(() => false);
    names.push(`${(n || "(unnamed)").replace(/\s+/g, " ").trim().slice(0, 50)}` +
      `${t ? `  [${t}]` : ""}${vis ? "" : "  (hidden)"}`);
  }
  say(`-- buttons (${btns.length}) --`);
  [...new Set(names)].forEach((n) => say(`   ${n}`));
  await shot(page, label);
}

const browser = await chromium.launch({ headless: !process.env.OH_GUI_HEADED });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 160)}`));

try {
  await page.goto(INGRESS, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);

  say("=== step 0: choose agent ===");
  await clickIf(page, "onboarding-agent-option-openhands", "native SDK agent, not a CLI wrapper");
  await clickIf(page, "onboarding-agent-next");
  await page.waitForTimeout(1500);

  say("\n=== step 1: LLM settings ===");
  // Report the auth-type control before touching it; stage 1 could not tell what it accepts.
  const auth = await tid(page, "llm-auth-type-input");
  if (await auth.count()) {
    const a = auth.first();
    say(`   llm-auth-type-input: tag=${await a.evaluate((e) => e.tagName.toLowerCase())} ` +
        `type=${await a.getAttribute("type")} value="${await a.inputValue().catch(() => "?")}"`);
  }
  await clickIf(page, "sdk-section-advanced-toggle", "reveal custom model + base url");
  await fillIf(page, "llm-custom-model-input", MODEL);
  await fillIf(page, "base-url-input", OLLAMA);
  await fillIf(page, "sdk-settings-llm.ollama_base_url", OLLAMA);
  await fillIf(page, "llm-api-key-input", "ollama");
  await shot(page, "10-llm-settings-filled");
  await clickIf(page, "onboarding-llm-next");
  await page.waitForTimeout(2500);
  await shot(page, "11-after-llm-next");

  say("\n=== step 2: say hello ===");
  const hello = await tid(page, "onboarding-hello-input");
  if (await hello.count()) {
    await hello.first().fill("Run pwd and report the absolute working directory. Change nothing.");
    say("   filled onboarding-hello-input");
    await clickIf(page, "submit-button");
  } else {
    say("   MISSING onboarding-hello-input — dumping what is on screen instead");
    await inventory(page, "12-unexpected-after-llm");
  }

  // The conversation view is the thing that has never been looked at. Give the model real time;
  // a 35B on a 5090 is not fast, and a short wait would report an empty screen as a finding.
  say("\n   waiting up to 240s for the agent to respond...");
  const t0 = Date.now();
  await page.waitForTimeout(8000);
  await inventory(page, "20-conversation-early");
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(10000);
    const body = await page.locator("body").innerText().catch(() => "");
    if (/\/home\/\S*/.test(body) || /oh-gui\/baseline\/fixture/.test(body)) {
      say(`   a path appeared in the transcript at ${Math.round((Date.now() - t0) / 1000)}s`);
      break;
    }
  }
  await inventory(page, "21-conversation-settled");

  const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const paths = [...new Set((body.match(/\/home\/[^\s"'`,)]{3,80}/g) || []))].slice(0, 10);
  say(`\n-- absolute paths visible in transcript --`);
  paths.length ? paths.forEach((p) => say(`   ${p}`)) : say("   NONE");
  say(`\n-- does the transcript mention the fixture? ${
    body.includes(".oh-gui/baseline/fixture") ? "YES" : "NO"} --`);

  // Anything that looks like a human-in-the-loop gate is the single most important finding here.
  const gate = [...new Set((body.match(
    /\b(accept|approve|confirm|reject|apply changes|review changes|allow|deny)\b/gi) || []))];
  say(`\n-- accept/approve vocabulary present in the UI: ${gate.length ? gate.join(", ") : "NONE"} --`);
  say(`   (NONE strongly suggests the agent writes files directly, with no accept gate,`);
  say(`    which changes what "turns to acceptance" and "lines accepted" can mean.)`);

  say(`\n-- console errors (${errs.length}) --`);
  [...new Set(errs)].slice(0, 20).forEach((e) => say(`   ${e}`));
} catch (err) {
  say(`\nPROBE2 FAILED: ${err.message}`);
  await shot(page, "99-failure");
} finally {
  writeFileSync(join(OUT, "probe2.txt"), lines.join("\n") + "\n");
  console.log(`\n\nwritten: ${join(OUT, "probe2.txt")}`);
  console.log(`screenshots: ${OUT}/*.png`);
  await browser.close();
}
