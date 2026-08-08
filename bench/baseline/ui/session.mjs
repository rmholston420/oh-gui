/**
 * Shared browser session for every baseline probe and the driver.
 *
 * The point of this file: a test's log is the author's SUMMARY of the run, not the run. Three
 * findings in this project have already been wrong because a probe reported something confidently
 * about a screen nobody looked at. So every session records the run itself, in three redundant
 * forms, and no probe gets to opt out:
 *
 *   trace.zip  — Playwright trace. Full DOM snapshot before and after EVERY action, plus the
 *                network log, console, and the source line that triggered it. Scrub through it
 *                like a video, but you can inspect and hover the real DOM at each step. This is
 *                the one that settles arguments.
 *   video.webm — plain screen recording of the whole run, for watching at normal speed.
 *   *.png      — the explicit checkpoints a probe chose to capture.
 *
 * Watch live instead of after:  OH_GUI_HEADED=1  (real window)
 *                               OH_GUI_SLOWMO=400  (ms between actions, so it is followable)
 *
 * Recording is on by default and costs a few MB per run. A test you cannot inspect is a test you
 * have to take on faith, and this project has spent too much of the day paying for that.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../apps/gui/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

export async function openSession(name) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const dir = join(process.env.HOME, ".oh-gui", "baseline", name, stamp);
  mkdirSync(dir, { recursive: true });

  const headed = !!process.env.OH_GUI_HEADED;
  const slowMo = Number(process.env.OH_GUI_SLOWMO || (headed ? 300 : 0));

  const browser = await chromium.launch({ headless: !headed, slowMo });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    recordVideo: { dir: join(dir, "video"), size: { width: 1600, height: 1000 } },
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  const page = await context.newPage();
  const lines = [];
  const t0 = Date.now();
  const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);

  const say = (s) => { lines.push(s); console.log(s); };
  const step = async (label) => {           // named marker, visible in the trace timeline
    say(`${el()}s ▸ ${label}`);
    await context.tracing.group?.(label).catch?.(() => {});
  };
  const shot = (n) => page.screenshot({ path: join(dir, `${n}.png`), fullPage: true })
    .catch((e) => say(`   (screenshot ${n}: ${e.message})`));

  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errs.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("requestfailed", (r) =>
    errs.push(`requestfailed: ${r.method()} ${r.url().slice(0, 120)} — ${r.failure()?.errorText}`));

  async function close(extra = {}) {
    const trace = join(dir, "trace.zip");
    await context.tracing.stop({ path: trace }).catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    writeFileSync(join(dir, `${name}.txt`), lines.join("\n") + "\n");
    writeFileSync(join(dir, "meta.json"), JSON.stringify(
      { name, stamp, dir, headed, slowMo, console_errors: errs, ...extra }, null, 2));
    console.log(`\n─── run artifacts ───────────────────────────────────────────`);
    console.log(`  ${dir}`);
    console.log(`\n  WATCH THE RUN (DOM at every step, network, console):`);
    console.log(`    cd ~/dev/oh-gui/apps/gui && npx playwright show-trace ${trace}`);
    console.log(`  or plain video:`);
    console.log(`    xdg-open ${join(dir, "video")}`);
    console.log(`  screenshots: ${dir}/*.png`);
    console.log(`─────────────────────────────────────────────────────────────`);
  }

  return { browser, context, page, dir, say, step, shot, el, errs, close };
}

/** Every data-testid currently in the DOM. */
export async function ids(page) {
  return page.$$eval("[data-testid]", (e) =>
    [...new Set(e.map((x) => x.getAttribute("data-testid")))]);
}
export async function has(page, id) {
  return (await page.locator(`[data-testid="${id}"]`).count()) > 0;
}
