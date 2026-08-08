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
import { openSession, ids, has, ensureConfigured } from "./session.mjs";

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
  // Onboarding completion lives in localStorage, so a fresh context is always a first run.
  // Drive it rather than refusing; session.mjs persists the state so later runs skip it.
  await ensureConfigured(page, say, shot);
  await shot("40-landed");

  if (!(await has(page, "conversation-panel-new-thread-picker"))) throw new Error("no new-thread picker");
  say(`\nfixture on disk: ${FIXTURE}`);
  await page.locator('[data-testid="conversation-panel-new-thread-picker"]').first().click();
  await page.waitForTimeout(2500);
  await dump("new-thread popover");
  await shot("41-popover");

  if (await has(page, "add-workspaces-button")) {
    await page.locator('[data-testid="add-workspaces-button"]').first().click();
    await page.waitForTimeout(3000);
    await shot("42-folder-browser");

    // Enumerate the folder browser itself, not the whole page. probe4 v1 typed into "the first
    // visible text input", which turned out to be the BACKEND SELECTOR combobox reading "Local",
    // outside the dialog entirely. It cleared it and surfaced Add Backend / Manage Backends.
    // Nothing was committed, but a blind global heuristic can reach controls that change app
    // state unrelated to what is being probed. Scope to the component under test.
    const fb = (await ids(page)).filter((x) => /folder|workspace|browser|dir|path|repo/i.test(x));
    say(`\n-- every folder/workspace test id (${fb.length}) --`);
    fb.forEach((x) => say(`   ${x}`));

    const sidebar = fb.filter((x) => x.startsWith("folder-browser-sidebar-"))
      .map((x) => x.replace("folder-browser-sidebar-", ""));
    say(`\n-- sidebar shortcuts (${sidebar.length}) --`);
    say(`   ${sidebar.join(", ")}`);

    // THE question: can it see hidden directories? The fixture is under ~/.oh-gui, and if
    // dotfiles are not listed the fixture must move before the baseline can use a workspace.
    const dotted = sidebar.filter((x) => x.startsWith("."));
    say(`\n-- hidden directories --`);
    say(`   dot-entries in sidebar: ${dotted.length ? dotted.join(", ") : "NONE"}`);
    const bodyTxt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    say(`   ".oh-gui" appears anywhere on screen: ${bodyTxt.includes(".oh-gui") ? "YES" : "no"}`);
    say(`   -> if NONE/no, the fixture at ~/.oh-gui/baseline/fixture is unreachable by this`);
    say(`      browser and must move to a visible path before a workspace can point at it.`);

    // Is there a path input INSIDE the dialog?
    const dlg = page.locator('[role="dialog"], [data-testid*="folder-browser"]').first();
    if (await dlg.count()) {
      const dlgFields = await dlg.locator("input,textarea").evaluateAll((es) => es.map((e) => ({
        type: e.getAttribute("type"), tid: e.getAttribute("data-testid"),
        ph: e.getAttribute("placeholder"), aria: e.getAttribute("aria-label"), val: e.value })));
      say(`\n-- inputs INSIDE the dialog (${dlgFields.length}) --`);
      dlgFields.forEach((f) => say(
        `   input[${f.type}] tid=${f.tid} ph="${f.ph || ""}" aria="${f.aria || ""}" val="${f.val || ""}"`));
      const dlgBtns = await dlg.locator("button").evaluateAll((es) => es.map((e) => ({
        t: (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 40),
        tid: e.getAttribute("data-testid") })).filter((b) => b.t || b.tid));
      say(`-- buttons INSIDE the dialog (${dlgBtns.length}) --`);
      dlgBtns.slice(0, 60).forEach((b) => say(`   "${b.t}"  [${b.tid}]`));
      say(`-- dialog text --`);
      say(`   ${(await dlg.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 700)}`);
    } else {
      say(`\n   no [role=dialog] found — the folder browser is not a modal;`);
      say(`   scoping will need a different container selector.`);
    }
    say(`\n   STOPPING before commit — no workspace created.`);
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
