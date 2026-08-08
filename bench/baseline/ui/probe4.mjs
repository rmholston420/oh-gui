/**
 * Stage 4 probe: can a workspace be registered at the fixture path?
 *
 * probe3 found the new-thread picker exposes `add-workspaces-button`, `launch-no-workspace`, and an
 * input reading "Local". If a workspace can be pointed at ~/.oh-gui/baseline/fixture, that is the
 * app's own supported way to give a conversation a working directory — strictly better than
 * copying the fixture into the per-conversation subdir the agent happens to get, which works
 * behind the app's back and would make the baseline measure a setup no user would ever have.
 *
 * Read-only: opens the flow, inventories every control, and stops before committing anything.
 * Nothing here should create a workspace — that decision comes after we can see the options.
 *
 * Recorded like every session:  bash bench/baseline/ui/watch.sh probe4
 * Run:  cd ~/dev/oh-gui/apps/gui && OH_GUI_HEADED=1 node ../../bench/baseline/ui/probe4.mjs
 */
import { openSession, ids, has } from "./session.mjs";

const INGRESS = process.env.OH_GUI_BASELINE_INGRESS || "http://127.0.0.1:8010";
const FIXTURE = `${process.env.HOME}/.oh-gui/baseline/fixture`;

const S = await openSession("probe4");
const { page, say, shot, errs } = S;

const dump = async (label) => {
  say(`\n-- ${label} --`);
  say(`   url: ${page.url()}`);
  const fields = await page.$$eval("input,textarea,select,[role=combobox],[role=option]", (es) =>
    es.map((e) => ({
      tag: e.tagName.toLowerCase(), role: e.getAttribute("role"), type: e.getAttribute("type"),
      tid: e.getAttribute("data-testid"), ph: e.getAttribute("placeholder"),
      aria: e.getAttribute("aria-label"), val: e.value, txt: (e.innerText || "").slice(0, 60),
    })));
  fields.slice(0, 30).forEach((f) => say(
    `   ${f.tag}${f.role ? `[role=${f.role}]` : ""}${f.type ? `[${f.type}]` : ""} tid=${f.tid} ` +
    `ph="${f.ph || ""}" aria="${f.aria || ""}" val="${(f.val || "").slice(0, 70)}" txt="${f.txt}"`));
  const btns = await page.$$eval("button,[role=button],a[href]", (es) =>
    es.map((e) => ({ t: (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 50),
                     tid: e.getAttribute("data-testid") })).filter((b) => b.t || b.tid));
  say(`   controls (${btns.length}):`);
  btns.slice(0, 40).forEach((b) => say(`      "${b.t}"  [${b.tid}]`));
  const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  say(`   mentions fixture path: ${txt.includes(FIXTURE) ? "YES" : "no"}`);
  say(`   mentions /home/: ${txt.includes("/home/") ? "YES" : "no"}`);
};

try {
  await page.goto(INGRESS, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  say(`landed: ${page.url()} (${(await ids(page)).length} ids)`);
  if ((await ids(page)).some((x) => x.startsWith("onboarding-"))) {
    say(`!! onboarding is showing — probe4 expects a configured app. Run probe3 first.`);
    throw new Error("onboarding");
  }
  await shot("40-landed");

  if (!(await has(page, "conversation-panel-new-thread-picker"))) throw new Error("no new-thread picker");
  await page.locator('[data-testid="conversation-panel-new-thread-picker"]').first().click();
  await page.waitForTimeout(2500);
  await dump("new-thread popover");
  await shot("41-popover");

  if (await has(page, "add-workspaces-button")) {
    await page.locator('[data-testid="add-workspaces-button"]').first().click();
    await page.waitForTimeout(3000);
    await dump("add-workspaces flow");
    await shot("42-add-workspaces");
    // Does it take a typed path? Probe without committing.
    const typed = page.locator('input[type="text"]:visible, input:not([type]):visible').first();
    if (await typed.count()) {
      await typed.fill(FIXTURE).catch(() => {});
      await page.waitForTimeout(2000);
      say(`\n   typed fixture path into the first visible text input — did anything resolve?`);
      await dump("after typing fixture path");
      await shot("43-path-typed");
    } else { say(`\n   no visible text input in the add-workspaces flow`); }
    say(`\n   STOPPING before commit — not creating a workspace until we choose to.`);
  } else {
    say(`\n   MISSING add-workspaces-button on ${page.url()}`);
  }
} catch (err) {
  say(`\nPROBE4 FAILED: ${err.message}`);
  say(`   url: ${page.url()}`);
  (await ids(page)).slice(0, 60).forEach((x) => say(`      ${x}`));
  await shot("99-failure");
} finally {
  say(`\n-- console errors (${errs.length}) --`);
  [...new Set(errs)].slice(0, 10).forEach((e) => say(`   ${e}`));
  await S.close();
}
