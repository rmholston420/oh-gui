import { expect, test } from '@playwright/test';

/**
 * Operator walkthrough: the four blast-radius states, driven at human speed.
 *
 * Why this exists separately from blast-radius.spec.ts. That file navigates and asserts, which is
 * the right shape for a gate but the wrong shape for watching: `slowMo` only delays *actions*, and
 * a spec made of `goto` plus expectations has almost none, so a headed run of it finishes in five
 * seconds and shows the operator essentially nothing. A green tick is not a demonstration.
 *
 * This spec dwells, scrolls, resizes, and outlines the two regions ADR-023 requires to stay
 * distinguishable, so the separation can be *seen* rather than inferred from a passing count.
 *
 * Watch it:
 *   npm run watch:blast              # ~40s, framed and paced for reading
 *   WATCH_DWELL=2000 npm run watch:blast
 *
 * It also runs in the normal gate, where every dwell collapses to zero and the outlining is
 * skipped, so it costs the headless suite almost nothing and still exercises the same paths.
 */

test.describe.configure({ mode: 'serial' });

test.use({
  viewport: { width: 1240, height: 720 },
  video: { mode: 'on', size: { width: 1240, height: 720 } },
});

const WATCHING = Boolean(process.env.WATCH);
const DWELL = Number(process.env.WATCH_DWELL ?? 1400);

test('an operator can see derived and echoed values stay apart across all four states', async ({
  page,
}, info) => {
  // Zero in the gate: the assertions below are the point there, the pacing is the point here.
  const dwell = (factor = 1) => page.waitForTimeout(WATCHING ? DWELL * factor : 0);

  /**
   * Outline a region so the viewer can see which claim it is making. Watch-only and applied
   * strictly after the assertions for that state, so it can never influence a result — an
   * inline style that changed layout before a measurement would be a test that lies.
   */
  const spotlight = async (testid: string, colour: string) => {
    if (!WATCHING) return;
    await page
      .getByTestId(testid)
      .first()
      .evaluate((el, c) => {
        (el as HTMLElement).style.outline = `3px solid ${c}`;
        (el as HTMLElement).style.outlineOffset = '3px';
      }, colour);
  };

  const shot = async (name: string) => {
    await info.attach(name, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  };

  // ---- 1. Projected: a formula ran, and its inputs are shown separately ------------------------
  await page.goto('/?surface=authorization&action=edit');
  const radius = page.getByTestId('blast-radius');
  await expect(radius).toHaveAttribute('data-status', 'projected');
  await expect(page.getByTestId('blast-target')).toHaveText(/\/etc\/hosts/);
  await dwell();

  // Green = we worked this out. Amber = the agent said it and we are only repeating it.
  await spotlight('blast-target', '#34d399');
  await spotlight('native-readings-heading', '#fbbf24');
  await dwell(1.6);
  await shot('1-projected');

  // ---- 2. No projection: the same card, with nothing derived at all ---------------------------
  await page.goto('/?surface=authorization&action=terminal');
  await expect(radius).toHaveAttribute('data-status', 'no-projection');
  // The claim worth seeing: no green box appears anywhere on this card.
  await expect(page.getByTestId('blast-target')).toHaveCount(0);
  await expect(page.getByTestId('native-readings-heading')).toContainText('not analysed');
  await spotlight('native-readings-heading', '#fbbf24');
  await dwell(1.6);
  await shot('2-no-projection');

  // ---- 3. Unknown action: a gap in our coverage, not a clean bill of health -------------------
  await page.goto('/?surface=authorization&action=unknown');
  await expect(radius).toHaveAttribute('data-status', 'unknown-action');
  await expect(radius).toContainText('QuantumAction');
  await dwell(1.4);
  await shot('3-unknown');

  // ---- 4. Non-executable: says so, rather than showing an empty radius ------------------------
  await page.goto('/?surface=authorization&action=none');
  await expect(radius).toHaveAttribute('data-status', 'not-executable');
  await expect(page.getByTestId('native-reading')).toHaveCount(0);
  await dwell(1.4);
  await shot('4-not-executable');

  // ---- 5. The narrow viewport, resized live ---------------------------------------------------
  // Watching the reflow is the point: this is where a long echoed command would push the card wide
  // and hide the very thing being authorized.
  await page.goto('/?surface=authorization&action=terminal');
  await dwell();
  for (const width of [900, 640, 390]) {
    await page.setViewportSize({ width, height: 720 });
    await dwell(0.6);
  }
  await expect(page.getByTestId('blast-radius')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'the card overflows a 390px viewport').toBeLessThanOrEqual(0);

  // The read-only notice and the blast radius must be legible together at this width — the whole
  // premise of ADR-022 is that you can read what will happen before you are allowed to act.
  await expect(page.getByTestId('narrow-viewport-notice')).toBeVisible();
  await dwell(1.6);
  await shot('5-narrow');
});
