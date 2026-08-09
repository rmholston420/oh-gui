import { expect, test } from '@playwright/test';

/**
 * Blast radius, driven in a real browser (spec 04 §4.2, ADR-023 option B).
 *
 * Watch it run:
 *   cd apps/gui && npm run watch:e2e -- blast-radius
 *
 * jsdom already covers the structural rules. What it cannot see is colour, and ADR-023's whole
 * concession — letting a raw `rm -rf` sit on the same card as derived output — rests on the two
 * being *visibly* different, not merely differently attributed in the DOM. So the checks here are
 * the ones that need a rendering engine: computed styles, real layout, real overflow.
 */

const surface = (action: string) => `/?demo=1&surface=authorization&action=${action}`;

test.describe('the four blast-radius outcomes are visibly distinct', () => {
  test('a projected action shows derived targets separately from echoed fields', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(surface('edit'));

    const radius = page.getByTestId('blast-radius');
    await expect(radius).toHaveAttribute('data-status', 'projected');
    await expect(radius.getByRole('heading', { level: 3 })).toHaveText('What this will touch');

    const target = page.getByTestId('blast-target');
    await expect(target).toHaveCount(1);
    await expect(target).toHaveAttribute('data-kind', 'path');
    await expect(target).toContainText('/etc/hosts');

    // The derived target and the echoed field must not be confusable by position either: the
    // echoed block sits below the derived one, under its own heading.
    const targetBox = await target.boundingBox();
    const echoedBox = await page.getByTestId('native-readings-heading').boundingBox();
    expect(targetBox, 'derived target has no layout box').not.toBeNull();
    expect(echoedBox, 'echoed heading has no layout box').not.toBeNull();
    expect(echoedBox!.y).toBeGreaterThan(targetBox!.y);
  });

  test('a shell command is echoed with no derived target anywhere on the card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(surface('terminal'));

    const radius = page.getByTestId('blast-radius');
    await expect(radius).toHaveAttribute('data-status', 'no-projection');
    await expect(radius.getByRole('heading', { level: 3 })).toContainText(
      'No blast radius was computed',
    );
    // The strongest guarantee option B rests on.
    await expect(page.getByTestId('blast-target')).toHaveCount(0);
    await expect(page.getByTestId('native-readings-heading')).toContainText(
      'shown exactly as received',
    );
  });

  test('an unrecognised action is styled as a warning, not as a clean bill of health', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(surface('unknown'));

    const radius = page.getByTestId('blast-radius');
    await expect(radius).toHaveAttribute('data-status', 'unknown-action');
    await expect(radius).toContainText('no recorded analysis for QuantumAction');

    // Colour is the part jsdom cannot check. The warning state must not share the neutral
    // background of the calm states, or "we do not know" reads as "nothing to see here".
    const warn = await radius.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.goto(surface('terminal'));
    const calm = await page
      .getByTestId('blast-radius')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(warn, 'the unknown-action state is not visually distinguished').not.toBe(calm);
  });

  test('a non-executable event says so instead of showing an empty radius', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(surface('none'));
    const radius = page.getByTestId('blast-radius');
    await expect(radius).toHaveAttribute('data-status', 'not-executable');
    await expect(radius).toContainText('no executable action');
    await expect(page.getByTestId('blast-target')).toHaveCount(0);
    await expect(page.getByTestId('native-reading')).toHaveCount(0);
  });
});

test('the blast radius does not overflow a 390px viewport', async ({ page }) => {
  // The narrow viewport is where a long echoed command is most likely to push the card wide and
  // hide the very thing being authorized. Same failure mode the `pre` already had.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(surface('terminal'));
  await expect(page.getByTestId('blast-radius')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'the card overflows a 390px viewport').toBeLessThanOrEqual(0);
});
