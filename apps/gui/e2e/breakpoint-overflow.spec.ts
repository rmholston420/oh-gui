/**
 * ADR-031, browser-verified.
 *
 * The unit suite proves Shell.css is internally consistent with the derivation.
 * It cannot prove a real layout engine agrees. This does: it measures actual
 * horizontal overflow at the boundary widths, which is the defect ADR-031
 * removed and the one a future regression would reintroduce.
 */
import { expect, test, type Page } from '@playwright/test';

const HEIGHT = 900;

/** Pixels of horizontal overflow on the workspace grid, as the browser computes it. */
async function overflowPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('.oh-shell__workspace');
    if (!el) throw new Error('.oh-shell__workspace not found');
    return el.scrollWidth - el.clientWidth;
  });
}

async function openProShell(page: Page, width: number) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto('/');
  const toPro = page.getByRole('button', { name: 'Switch to Pro lens' });
  if (await toPro.isVisible().catch(() => false)) await toPro.click();
  await expect(page.locator('.oh-shell--pro')).toBeVisible();
}

test.describe('four-region breakpoint does not overflow (ADR-031)', () => {
  // 1649 is the last two-pane width; 1650 is the first four-region width.
  // 1600 and 1620 are the two values that were previously believed correct
  // and both overflowed — they must now resolve to the two-pane tier.
  for (const width of [1600, 1620, 1649, 1650, 1680, 1920]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await openProShell(page, width);
      expect(await overflowPx(page)).toBe(0);
    });
  }

  test('four regions appear only at and above 1650px', async ({ page }) => {
    const rail = () => page.locator('.oh-shell__left-rail');

    await openProShell(page, 1649);
    await expect(rail()).toBeHidden();

    await page.setViewportSize({ width: 1650, height: HEIGHT });
    await expect(rail()).toBeVisible();
  });

  test('the stage keeps its 60% floor at the boundary', async ({ page }) => {
    await openProShell(page, 1650);
    const stage = page.locator('.oh-shell__center-stage');
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    // 60% of 1650 = 990. Allow a pixel of subpixel rounding, no more.
    expect(box!.width).toBeGreaterThanOrEqual(989);
  });
});
