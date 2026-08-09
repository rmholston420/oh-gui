/**
 * A headed walkthrough of the agent's own account (spec 04 §4.2).
 *
 * Run it and watch:
 *
 *   npm run watch:account                    # 2500ms dwell, the default
 *   WATCH_DWELL=1200 npm run watch:account   # brisker
 *
 * Without `WATCH` every dwell collapses to zero, so this stays a real assertion suite in the gate
 * rather than a slideshow that happens to pass. The three things worth seeing, in order:
 *
 *   1. The account sits BELOW the derived blast radius, and its heading names the agent as the
 *      speaker. The demo summary is deliberately agreeable — "Looking for recently changed
 *      TypeScript files" for a command whose blast radius is a recursive find over a whole tree.
 *      Seeing the two side by side is the point: the self-report is not the analysis.
 *   2. An untyped thought block still renders (the `edit` action). Canvas dropped that shape.
 *   3. Redacted thinking is reported as withheld, not as absent (the `unknown` action).
 */

import { expect, test } from '@playwright/test';

const WATCHING = process.env.WATCH === '1';
const DWELL = Number(process.env.WATCH_DWELL ?? 2500);

test('an operator can see the agent account stay separate from the derived reading', async ({
  page,
}) => {
  const dwell = (factor = 1) => page.waitForTimeout(WATCHING ? DWELL * factor : 0);

  // Spotlights are applied only after the assertions for a step have passed, so a green run and a
  // watched run are the same run.
  const spotlight = async (testid: string, colour: string) => {
    const target = page.getByTestId(testid).first();
    if (!WATCHING || (await target.count()) === 0) return;
    await target.evaluate((el, c) => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const s = el as HTMLElement;
      s.style.outline = `2px solid ${c}`;
      s.style.outlineOffset = '3px';
      s.style.transition = 'outline-color 250ms';
    }, colour);
    await dwell(0.8);
  };

  // ---- 1. All three fields present, below the radius -------------------------------------------
  await page.goto('/?surface=authorization&action=terminal');
  const account = page.getByTestId('agent-account');
  await expect(account).toBeVisible();
  await dwell();

  const radius = page.getByTestId('blast-radius');
  await expect(radius).toBeVisible();
  // Derived first, self-report second. Asserted, not merely arranged.
  const accountFollowsRadius = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="blast-radius"]')!;
    const a = document.querySelector('[data-testid="agent-account"]')!;
    return Boolean(r.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(accountFollowsRadius).toBe(true);

  await expect(page.getByTestId('agent-account-heading')).toContainText(/what the agent says/i);
  await expect(account).toContainText(/own words/i);
  await spotlight('blast-target', '#34d399');
  await spotlight('agent-account-heading', '#60a5fa');

  await expect(page.getByTestId('agent-summary')).toContainText('summary');
  await expect(page.getByTestId('agent-thought')).toContainText('thought');
  await expect(page.getByTestId('agent-reasoning')).toContainText('reasoning_content');
  for (const id of ['agent-summary', 'agent-thought', 'agent-reasoning']) {
    await spotlight(id, '#60a5fa');
  }
  await dwell();

  // ---- 2. An untyped thought block still renders -----------------------------------------------
  await page.goto('/?surface=authorization&action=edit');
  await expect(page.getByTestId('agent-thought')).toContainText(/dev domain to localhost/i);
  await expect(page.getByTestId('agent-reasoning')).toHaveCount(0);
  await spotlight('agent-thought', '#60a5fa');
  await dwell();

  // ---- 3. Withheld thinking says so ------------------------------------------------------------
  await page.goto('/?surface=authorization&action=unknown');
  const withheld = page.getByTestId('agent-reasoning-redacted');
  await expect(withheld).toContainText(/redacted/i);
  await expect(page.getByTestId('agent-reasoning')).toHaveCount(0);
  // The redacted payload must not be anywhere in the document, not merely out of that one block.
  await expect(page.locator('body')).not.toContainText('redacted-by-provider');
  await spotlight('agent-reasoning-redacted', '#fbbf24');
  await dwell();

  // ---- 4. Silence renders nothing, rather than an empty labelled box ----------------------------
  await page.goto('/?surface=authorization&action=none');
  await expect(page.getByTestId('agent-account')).toHaveCount(0);
  await dwell();
});
