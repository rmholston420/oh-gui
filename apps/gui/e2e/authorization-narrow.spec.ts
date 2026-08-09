import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Headed gate for the 900px read-only rule (docs/specs/03-layout.md section 3.2,
 * docs/specs/13-hard-constraints.md lines 49 and 101, ADR-022).
 *
 * Why this exists on top of the Vitest suite: jsdom has no layout engine and no viewport. It can
 * be told `innerWidth = 800`, but it cannot tell you whether the card actually fits, whether the
 * read-only notice is visible rather than clipped, or whether the disabled controls still read
 * legibly. Only a real browser at a real viewport can. Run it headed to watch it drive:
 *
 *   cd apps/gui && npx playwright test authorization-narrow --headed
 */

const URL = '/?demo=1&surface=authorization';
const ACTIONS = ['approve', 'reject', 'approve-and-relax'] as const;

/** iPhone-ish and tablet-ish, plus the two cells either side of the boundary. */
const NARROW = [
  { w: 390, h: 844, label: 'phone portrait' },
  { w: 820, h: 1180, label: 'tablet portrait' },
  { w: 899, h: 900, label: 'one pixel below the breakpoint' },
] as const;

test.describe('below 900px the authorization surface is read-only', () => {
  for (const { w, h, label } of NARROW) {
    test(`${label} (${w}px): every action is unavailable`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(URL);
      await expect(page, 'something other than OH-GUI is serving the dev port').toHaveTitle(
        /OH-GUI/,
      );

      const card = page.getByTestId('authorization-card');
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute('data-can-act', 'false');

      for (const id of ACTIONS) await expect(page.getByTestId(id)).toBeDisabled();
      await expect(page.getByTestId('reject-reason')).toBeDisabled();

      // The reason must be on screen, not merely in the DOM. A notice scrolled out of view at the
      // exact width where it matters explains nothing.
      const notice = page.getByTestId('narrow-viewport-notice');
      await expect(notice).toBeInViewport();
      await expect(notice).toContainText(/at least 900px wide/i);

      // No exception path (ADR-003, ADR-022): forcing the click past the disabled state must not
      // navigate, mutate, or dismiss the card.
      await page.getByTestId('approve').click({ force: true });
      await expect(card).toHaveAttribute('data-can-act', 'false');
      await expect(page.getByTestId('approve')).toBeDisabled();
    });
  }

  test('nothing overflows the viewport at the narrowest supported width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(URL);
    await expect(page.getByTestId('authorization-card')).toBeVisible();
    // A card wider than the window puts the command — the thing being authorized — half off
    // screen. The long `pre` is the likely culprit and is why it scrolls internally.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the authorization card overflows a 390px viewport').toBeLessThanOrEqual(0);
  });
});

test.describe('at 900px and above the operator can act', () => {
  test('exactly 900px is wide enough', async ({ page }) => {
    // The spec boundary is inclusive. This test and the 899px one above are a matched pair: they
    // fail in opposite directions on an off-by-one, so neither can be satisfied by a stuck value.
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto(URL);
    await expect(page.getByTestId('authorization-card')).toHaveAttribute('data-can-act', 'true');
    await expect(page.getByTestId('approve')).toBeEnabled();
    await expect(page.getByTestId('narrow-viewport-notice')).toHaveCount(0);
  });

  test('widening a narrow window re-enables the actions live', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(URL);
    await expect(page.getByTestId('approve')).toBeDisabled();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByTestId('approve')).toBeEnabled();
    await expect(page.getByTestId('narrow-viewport-notice')).toHaveCount(0);
  });

  test('Reject stays unavailable until a reason is typed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(URL);
    await expect(page.getByTestId('reject')).toBeDisabled();
    await page.getByTestId('reject-reason').fill('   ');
    await expect(page.getByTestId('reject')).toBeDisabled();
    await page.getByTestId('reject-reason').fill('touches the docker volumes');
    await expect(page.getByTestId('reject')).toBeEnabled();
  });
});

test('the card has no accessibility violations, narrow or wide', async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    await expect(page.getByTestId('authorization-card')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('[data-testid=authorization-card]').analyze();
    expect(
      results.violations.map((v) => `${width}px: ${v.id} — ${v.help}`),
      'axe violations on the authorization card',
    ).toEqual([]);
  }
});
