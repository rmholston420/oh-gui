import { expect, test } from '@playwright/test';

/**
 * Operator walkthrough: Playwright drives the wizard the way a person would, and records it.
 *
 * Why this exists separately from wizard.spec.ts: that file proves each screen *renders*
 * correctly (contrast, overflow, predicate agreement) by jumping to a step. It never proves the
 * thing actually works when clicked - that navigation advances, that Back returns you, that the
 * boundary buttons are disabled at the ends, that state survives a round trip. A passing
 * assertion count is not evidence the UI works. A recording is.
 *
 * Output: video at apps/gui/test-results/**\/video.webm, plus numbered stills.
 */

test.describe.configure({ mode: 'serial' });

test.use({
  // Framed to the content. At 800px tall the wizard fills the top fifth and the recording is
  // mostly empty background, which makes it useless as something to actually watch.
  viewport: { width: 1240, height: 660 },
  video: { mode: 'on', size: { width: 1240, height: 660 } },
  launchOptions: { slowMo: 300 },
});

const HEADINGS = [
  '1. Connect a model',
  '2. What each trust-dial stop does',
  /^3\. Your default:/,
  '4. Lines accepted without inspection',
  '5. How a plan will look',
] as const;

test('an operator can click all the way through the wizard and back', async ({ page }, info) => {
  // Long enough for a person to read the screen in the recording before the next click.
  const dwell = () => page.waitForTimeout(1100);

  const shot = async (name: string) => {
    await info.attach(name, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  };

  await page.goto('/?demo=1');
  await expect(page, 'something other than OH-GUI is serving the dev port').toHaveTitle(/OH-GUI/);

  const next = page.getByRole('button', { name: 'Next' });
  const back = page.getByRole('button', { name: 'Back' });

  // --- Step 1, the entry state -------------------------------------------------------------
  await expect(page.getByText('Step 1 of 5')).toBeVisible();
  await expect(page.getByRole('heading', { name: HEADINGS[0] })).toBeVisible();
  await expect(back, 'Back must be disabled on the first step - nowhere to go').toBeDisabled();
  await expect(next).toBeEnabled();
  await shot('01-step-1-entry');
  await dwell();

  // --- Forward through every step ----------------------------------------------------------
  for (let n = 2; n <= 5; n++) {
    await next.click();
    await expect(page.getByText(`Step ${n} of 5`)).toBeVisible();
    await expect(page.getByRole('heading', { name: HEADINGS[n - 1] })).toBeVisible();
    await shot(`0${n}-step-${n}-forward`);
    await dwell();
  }

  // --- Step 5, the exit state --------------------------------------------------------------
  await expect(next, 'Next must be disabled on the last step').toBeDisabled();
  await expect(back).toBeEnabled();

  // --- The Phase 0 exit criterion, asserted where a person would read it -------------------
  await back.click();
  await back.click();
  await expect(page.getByText('Step 3 of 5')).toBeVisible();
  const defaultCard = page.getByRole('heading', { name: /^3\. Your default:/ });
  await expect(defaultCard).toContainText('Ask on risky');
  // The default stop must be stated in-UI, not merely implied (03-layout.md section 3.4 item 4).
  await expect(
    page.getByText('ConfirmRisky(threshold=HIGH, confirm_unknown=True)'),
  ).toBeVisible();
  // ...and NeverConfirm() must be marked opt-in-only, with a reason.
  await expect(page.getByText('Never is opt-in only, and here is why')).toBeVisible();
  await shot('06-back-to-step-3-default-stop');
  await dwell();

  // --- The live decision table, read off the rendered DOM ----------------------------------
  await back.click();
  await expect(page.getByText('Step 2 of 5')).toBeVisible();
  // The stop whose elevation bug was fixed this session: a LOW-risk write that lands outside
  // the worktree must pause. If this ever reads "Proceeds" the stop is inert.
  await expect(page.getByTestId('cell-ask-outside-worktree-LOW-out')).toHaveText('Pauses for you');
  await expect(page.getByTestId('cell-ask-risky-LOW-out')).toHaveText('Proceeds');
  await expect(page.getByTestId('cell-never-HIGH-in')).toHaveText('Proceeds');
  await expect(page.getByTestId('cell-ask-always-UNKNOWN-in')).toHaveText('Pauses for you');
  await shot('07-back-to-step-2-decision-table');
  await dwell();

  // --- All the way home --------------------------------------------------------------------
  await back.click();
  await expect(page.getByText('Step 1 of 5')).toBeVisible();
  await expect(back, 'Back is disabled again at the start').toBeDisabled();
  await shot('08-returned-to-step-1');
  await dwell();
});
