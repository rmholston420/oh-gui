/**
 * Stage 6 probe: how is the model chosen, and does the UI's claim match what Ollama loads?
 *
 * The 2x8 matrix needs to switch between qwen3.6:27b and qwen3.6:35b-a3b-mtp-q4_K_M sixteen times
 * unattended. The only handle seen so far is `chat-input-llm-profile`. Two things must hold:
 * the switcher must be drivable, and the label it shows must correspond to the model Ollama
 * actually loads. A driver that silently ran all sixteen cells on one model would produce a
 * complete, plausible, worthless report.
 *
 * No LLM call, no GPU load — inventory only.
 *
 * Run:  cd ~/dev/oh-gui/apps/gui && OH_GUI_HEADED=1 node ../../bench/baseline/ui/probe6.mjs
 */
import { openSession, ids, has, ensureConfigured } from "./session.mjs";

const INGRESS = process.env.OH_GUI_BASELINE_INGRESS || "http://127.0.0.1:8010";
const WANT = (process.env.OH_GUI_BASELINE_MODELS || "qwen3.6:27b,qwen3.6:35b-a3b-mtp-q4_K_M").split(",");

const S = await openSession("probe6");
const { page, say, shot, errs } = S;

try {
  await page.goto(INGRESS, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  await ensureConfigured(page, say, shot);

  const label = async () => (await page.locator('[data-testid="chat-input-llm-profile"]').first()
    .innerText().catch(() => "?")).replace(/\s+/g, " ").trim();
  say(`current profile label: "${await label()}"`);
  say(`(label is truncated in the UI — it is a display string, not proof of the loaded model)`);

  if (!(await has(page, "chat-input-llm-profile"))) throw new Error("no chat-input-llm-profile");
  await page.locator('[data-testid="chat-input-llm-profile"]').first().click();
  await page.waitForTimeout(2500);
  await shot("60-profile-open");

  const after = await ids(page);
  const rel = after.filter((x) => /profile|model|llm/i.test(x));
  say(`\n-- profile/model ids (${rel.length}) --`);
  rel.forEach((x) => say(`   ${x}`));

  const opts = await page.$$eval('[role="option"], [role="menuitem"], li, button', (es) => es
    .map((e) => ({ t: (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60),
                   tid: e.getAttribute("data-testid"), role: e.getAttribute("role") }))
    .filter((o) => o.t && /qwen|llama|gpt|claude|ollama|:|b\b/i.test(o.t)));
  say(`\n-- things that look like model choices (${opts.length}) --`);
  opts.slice(0, 40).forEach((o) => say(`   "${o.t}"  [${o.tid}] role=${o.role}`));

  say(`\n-- can each matrix model be selected? --`);
  for (const m of WANT) {
    const short = m.split(":").pop().slice(0, 12);
    const hit = opts.find((o) => o.t.includes(m)) || opts.find((o) => o.t.includes(short));
    say(`   ${m}`);
    say(`      exact label present: ${opts.some((o) => o.t.includes(m)) ? "YES" : "no"}`);
    say(`      fuzzy "${short}":     ${hit ? `YES -> "${hit.t}" [${hit.tid}]` : "NO MATCH"}`);
  }
  say(`\n   A fuzzy match is not good enough to drive sixteen unattended cells on. If the exact`);
  say(`   model string is absent, the driver must select by a stable testid or the profiles must`);
  say(`   be renamed so the label IS the model id.`);

  say(`\n-- profiles on disk (~/.openhands/profiles) vs what is offered here --`);
  say(`   compare manually: ls ~/.openhands/profiles/`);

  const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  say(`   screen mentions "27b":  ${body.includes("27b") ? "YES" : "no"}`);
  say(`   screen mentions "35b":  ${body.includes("35b") ? "YES" : "no"}`);
  await shot("61-profile-options");
} catch (err) {
  say(`\nPROBE6 FAILED: ${err.message}`);
  say(`   url: ${page.url()}`);
  (await ids(page).catch(() => [])).slice(0, 60).forEach((x) => say(`      ${x}`));
  await shot("99-failure");
} finally {
  say(`\n-- console errors (${errs.length}) --`);
  [...new Set(errs)].slice(0, 8).forEach((e) => say(`   ${e}`));
  await S.close();
}
