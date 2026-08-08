/**
 * Stage 5 probe: select the fixture as a workspace, then find out where the agent actually works.
 *
 * THE QUESTION. With VITE_WORKING_DIR, the agent did NOT work in the directory given — it worked
 * in a fresh per-conversation subdirectory beneath it (proved by asking `pwd`, and by
 * `FileEditor initialized with cwd:` in the log). If selecting a workspace behaves the same way,
 * every task starts in an empty directory and the fixture is invisible to the agent, which would
 * invalidate all eight tasks. If instead the conversation works IN the workspace, the fixture is
 * live and the driver must restore it between tasks or task N+1 inherits task N's edits.
 *
 * Those two outcomes need opposite driver designs, so this asks rather than assumes.
 *
 * Read-only in intent: it creates one workspace and one conversation, and the only thing it asks
 * the agent to do is report its location and list what it can see.
 *
 * Recorded:  bash bench/baseline/ui/watch.sh probe5
 * Run:  cd ~/dev/oh-gui/apps/gui && OH_GUI_HEADED=1 node ../../bench/baseline/ui/probe5.mjs
 */
import { openSession, ids, has, ensureConfigured } from "./session.mjs";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname } from "node:path";

const INGRESS = process.env.OH_GUI_BASELINE_INGRESS || "http://127.0.0.1:8010";
const FIXTURE = process.env.OH_GUI_BASELINE_FIXTURE || `${process.env.HOME}/oh-gui-baseline/fixture`;

const S = await openSession("probe5");
const { page, say, shot, el, errs } = S;

// probe5 v1 clicked the picker to "reopen" it and actually toggled it SHUT, then reported the
// launch controls absent while looking at the home screen. A toggle is not an opener. This checks
// the destination state and only clicks when the popover is genuinely closed.
const popoverOpen = async () =>
  (await has(page, "add-workspaces-button")) || (await has(page, "launch-no-workspace"));
const openPicker = async () => {
  for (let i = 0; i < 3; i++) {
    if (await popoverOpen()) { say(`   picker open (attempt ${i})`); return true; }
    await page.locator('[data-testid="conversation-panel-new-thread-picker"]').first()
      .click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  say(`   picker WOULD NOT OPEN — anything below about its contents is unreliable`);
  return false;
};

const click = async (id, why = "") => {
  if (await has(page, id)) {
    await page.locator(`[data-testid="${id}"]`).first().click({ timeout: 10000 });
    await page.waitForTimeout(1800); say(`   clicked ${id}${why ? ` (${why})` : ""}`); return true;
  }
  say(`   MISSING ${id}`); return false;
};

try {
  say(`fixture: ${FIXTURE}`);
  say(`exists on disk: ${existsSync(FIXTURE) ? "YES" : "NO — move it first"}`);
  if (existsSync(FIXTURE)) say(`contents: ${readdirSync(FIXTURE).join(", ")}`);
  if (!existsSync(FIXTURE)) throw new Error("fixture missing");

  await page.goto(INGRESS, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  await ensureConfigured(page, say, shot);

  // ---- register the fixture as a workspace ----
  say(`\n===== registering workspace =====`);
  await click("conversation-panel-new-thread-picker");
  await click("add-workspaces-button");
  await page.waitForTimeout(2000);

  // Navigate from Home down to the fixture, one path segment at a time.
  const segs = [];
  for (let d = FIXTURE; d && d !== process.env.HOME && d !== "/"; d = dirname(d)) segs.unshift(basename(d));
  say(`   navigating from Home: ${segs.join(" / ")}`);
  await click("folder-browser-sidebar-home");
  for (const seg of segs) {
    const cur = await page.locator('[data-testid="folder-browser-current-path"]').innerText().catch(() => "?");
    say(`   at: ${cur.replace(/\s+/g, " ")}`);
    if (!(await click(`folder-browser-entry-${seg}`, `into ${seg}`))) {
      const avail = (await ids(page)).filter((x) => x.startsWith("folder-browser-entry-"))
        .map((x) => x.replace("folder-browser-entry-", ""));
      say(`   !! "${seg}" not listed. Visible here: ${avail.slice(0, 30).join(", ")}`);
      throw new Error(`cannot navigate into ${seg}`);
    }
  }
  const finalPath = await page.locator('[data-testid="folder-browser-current-path"]').innerText().catch(() => "?");
  say(`   current path before Use: ${finalPath.replace(/\s+/g, " ")}`);
  await shot("50-at-fixture");
  // "Use this folder", NOT add-all-subdirs — one workspace, not one per subdirectory.
  if (!(await click("folder-browser-use", "use this folder"))) throw new Error("no folder-browser-use");
  await page.waitForTimeout(3000);
  await shot("51-workspace-added");

  // ---- did the server actually record it? ----
  // Ask the backend rather than the UI. The UI already fooled me once here, and if registration
  // failed outright I want to know that before interpreting anything on screen.
  say(`\n===== server state =====`);
  for (const ep of ["/api/workspaces", "/api/conversations/workspaces", "/api/settings"]) {
    const r = await page.request.get(`${INGRESS}${ep}`).catch((e) => ({ status: () => `ERR ${e.message}` }));
    const st = typeof r.status === "function" ? r.status() : "?";
    let body = ""; try { body = (await r.text()).slice(0, 600); } catch {}
    const hit = body.includes("oh-gui-baseline") || body.includes("fixture");
    say(`   ${ep} -> ${st}${hit ? "  [MENTIONS THE FIXTURE]" : ""}`);
    if (st === 200 && body) say(`      ${body.replace(/\s+/g, " ").slice(0, 400)}`);
  }

  // ---- what the picker shows, once it is provably open ----
  say(`\n===== picker after adding =====`);
  const opened = await openPicker();
  await shot("52-picker-with-workspace");
  if (opened) {
    const btns = await page.$$eval("button", (es) => es.map((e) => ({
      t: (e.innerText || e.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 50),
      tid: e.getAttribute("data-testid") })));
    const inPop = btns.filter((b) => /workspace|launch|fixture|baseline|thread|folder/i.test(
      `${b.t} ${b.tid || ""}`));
    say(`   workspace/launch controls (${inPop.length}):`);
    inPop.forEach((b) => say(`      "${b.t}"  [${b.tid}]`));
    const popTxt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    say(`   screen mentions "fixture":         ${popTxt.includes("fixture") ? "YES" : "no"}`);
    say(`   screen mentions "oh-gui-baseline": ${popTxt.includes("oh-gui-baseline") ? "YES" : "no"}`);

    const launch = inPop.map((b) => b.tid).filter(Boolean)
      .find((x) => /fixture|baseline/i.test(x))
      || btns.find((b) => /fixture|baseline/i.test(b.t))?.tid
      || inPop.map((b) => b.tid).find((x) => x && x.startsWith("launch-") && x !== "launch-no-workspace");
    if (launch) { say(`   launching via ${launch}`); await click(launch); }
    else {
      // Fall back to the home screen's own Open Workspace control before giving up — it is a
      // second, separate route into a workspace and has not been tried.
      say(`   no launch control names the fixture; trying open-workspace-button instead`);
      if (await click("open-workspace-button")) {
        await page.waitForTimeout(2500); await shot("52b-open-workspace");
        const ws = (await ids(page)).filter((x) => /workspace|folder|fixture|baseline/i.test(x));
        say(`   after Open Workspace, relevant ids: ${ws.join(", ") || "(none)"}`);
        const pick = ws.find((x) => /fixture|baseline/i.test(x));
        if (pick) { say(`   selecting ${pick}`); await click(pick); }
        else throw new Error("workspace registered but no control selects it");
      } else throw new Error("cannot launch into workspace");
    }
  } else throw new Error("picker would not open");
  await page.waitForTimeout(3000);
  await shot("53-launched");

  // ---- ask the agent where it is ----
  say(`\n===== asking the agent where it is =====`);
  const box = page.locator('[data-testid="chat-input"]').first();
  if (!(await box.count())) throw new Error(`no chat-input on ${page.url()}`);
  await box.click();
  await page.keyboard.type(
    "Run pwd and then ls -a in the current directory. Report the exact output of both. " +
    "Do not create, modify or delete anything.");
  await page.locator('[data-testid="submit-button"]').first().click();
  say(`${el()}s submitted`);

  let done = false;
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(1000);
    const cur = await ids(page);
    if (cur.includes("conversation-status-check") && !cur.includes("stop-button")
        && cur.includes("agent-message")) { done = true; say(`${el()}s agent idle`); break; }
  }
  if (!done) say(`   (agent still working after 300s — reporting what is on screen)`);
  await page.waitForTimeout(2000);
  await shot("54-answer");

  const transcript = (await page.locator('[data-testid="chat-scroll-container"]').innerText()
    .catch(() => "")).replace(/\s+/g, " ");
  say(`\n-- transcript tail --\n   ${transcript.slice(-1400)}`);

  const url = page.url();
  const cid = (url.match(/conversations\/([0-9a-f-]{36})/) || [])[1];
  const flat = cid ? cid.replace(/-/g, "") : "";
  say(`\n===== ANSWER =====`);
  say(`   conversation: ${cid || "?"}`);
  say(`   transcript contains the fixture path exactly:      ${transcript.includes(FIXTURE) ? "YES" : "no"}`);
  say(`   transcript contains a per-conversation subdir:     ${flat && transcript.includes(flat) ? "YES" : "no"}`);
  say(`   transcript mentions fixture contents (notes_api):  ${transcript.includes("notes_api") ? "YES" : "no"}`);
  say(`   -> subdir YES  = same trap as VITE_WORKING_DIR; agent starts in an empty dir.`);
  say(`   -> fixture YES + notes_api YES = agent works IN the fixture; driver must restore`);
  say(`      it between tasks or task N+1 inherits task N's edits.`);
  say(`\n   on-disk children of the fixture now: ${readdirSync(FIXTURE).join(", ")}`);
} catch (err) {
  say(`\nPROBE5 FAILED: ${err.message}`);
  say(`   url: ${page.url()}`);
  (await ids(page).catch(() => [])).slice(0, 70).forEach((x) => say(`      ${x}`));
  await shot("99-failure");
} finally {
  say(`\n-- console errors (${errs.length}) --`);
  [...new Set(errs)].slice(0, 10).forEach((e) => say(`   ${e}`));
  await S.close();
}
