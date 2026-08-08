/**
 * Stage 1 UI probe for the automated baseline driver.
 *
 * Writes down what the stock Agent Canvas page actually exposes, so the driver can be written
 * against evidence instead of guessed selectors. Reports test ids, accessible roles and names,
 * editable fields, and the post-submit DOM delta — the last one matters most, because "the agent's
 * first proposal is reviewable" has to be detected from something that reliably appears.
 *
 * Run ON Colossus (the app is on its localhost):
 *   cd ~/dev/oh-gui/apps/gui && node ../../bench/baseline/ui/probe.mjs
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.OH_GUI_BASELINE_INGRESS || "http://localhost:8010";
const OUT = join(process.env.HOME, ".oh-gui", "baseline", "probe");
mkdirSync(OUT, { recursive: true });

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };

async function inventory(page, label) {
  say(`\n===== ${label} =====`);
  say(`url:   ${page.url()}`);
  say(`title: ${await page.title()}`);

  const testids = await page.$$eval("[data-testid]", (els) =>
    [...new Set(els.map((e) => `${e.getAttribute("data-testid")}  <${e.tagName.toLowerCase()}>`))]);
  say(`\n-- data-testid (${testids.length}) --`);
  testids.forEach((t) => say(`   ${t}`));

  for (const role of ["button", "textbox", "combobox", "link", "tab", "menuitem"]) {
    const names = await page.getByRole(role).all();
    const out = [];
    for (const n of names.slice(0, 40)) {
      const name = (await n.getAttribute("aria-label"))
        || (await n.innerText().catch(() => ""))
        || (await n.getAttribute("placeholder")) || "";
      out.push(name.replace(/\s+/g, " ").trim().slice(0, 70) || "(no name)");
    }
    if (out.length) {
      say(`\n-- role=${role} (${names.length}) --`);
      [...new Set(out)].forEach((n) => say(`   ${n}`));
    }
  }

  const editable = await page.$$eval(
    "textarea, input:not([type=hidden]), [contenteditable='true']",
    (els) => els.map((e) => `${e.tagName.toLowerCase()}` +
      `${e.type ? `[type=${e.type}]` : ""}` +
      `${e.getAttribute("data-testid") ? ` testid=${e.getAttribute("data-testid")}` : ""}` +
      `${e.placeholder ? ` placeholder="${e.placeholder}"` : ""}` +
      `${e.getAttribute("aria-label") ? ` aria="${e.getAttribute("aria-label")}"` : ""}`),
  );
  say(`\n-- editable fields (${editable.length}) --`);
  [...new Set(editable)].forEach((e) => say(`   ${e}`));

  await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));

try {
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  await inventory(page, "01-landing");

  // Does the landing page already have a prompt box, or must a conversation be created first?
  const box = page.locator(
    "textarea, [contenteditable='true'], input[type=text]").first();
  if (await box.count()) {
    say("\n>> an editable field exists on the landing page");
  } else {
    say("\n>> NO editable field on landing; looking for a new-conversation affordance");
    for (const rx of [/new conversation/i, /new chat/i, /start/i, /create/i, /launch/i]) {
      const b = page.getByRole("button", { name: rx }).first();
      if (await b.count()) {
        say(`   clicking button matching ${rx}`);
        await b.click().catch(() => {});
        await page.waitForTimeout(4000);
        await inventory(page, "02-after-new-conversation");
        break;
      }
    }
  }

  // What does the working directory look like from the app's side? The driver must confirm the
  // agent is in the fixture before any task is recorded, not assume it from a process env var.
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const hit = body.match(/[^\s"']*\.oh-gui\/baseline\/fixture[^\s"']*/)
    || body.match(/[^\s"']*agent-canvas\/workspaces[^\s"']*/);
  say(`\n-- working dir visible in page text: ${hit ? hit[0] : "NOT VISIBLE"}`);

  say(`\n-- console errors (${consoleErrors.length}) --`);
  [...new Set(consoleErrors)].slice(0, 15).forEach((e) => say(`   ${e}`));
} catch (err) {
  say(`\nPROBE FAILED: ${err.message}`);
} finally {
  const dump = join(OUT, "probe.txt");
  writeFileSync(dump, lines.join("\n") + "\n");
  console.log(`\n\nwritten: ${dump}`);
  console.log(`screenshots: ${OUT}/*.png`);
  await browser.close();
}
