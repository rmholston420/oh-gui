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
  // 1699 is the last two-pane width; 1700 is the first four-region width.
  // 1600, 1620 and 1650 were all believed correct at some point and all
  // overflowed — they must now resolve to the two-pane tier.
  // 1704/1720/2064/2293 are real window snaps on the 3440x1440 target display
  // (half minus a gap, half, 60%, two-thirds) — the operator works windowed,
  // so these are the widths that actually occur, not 3440.
  for (const width of [
    1600, 1620, 1650, 1699, 1700, 1704, 1720, 1800, 1920, 2064, 2293, 2560, 3440,
  ]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await openProShell(page, width);
      expect(await overflowPx(page)).toBe(0);
    });
  }

  test('four regions appear only at and above 1700px', async ({ page }) => {
    const rail = () => page.locator('.oh-shell__left-rail');

    await openProShell(page, 1699);
    await expect(rail()).toBeHidden();

    await page.setViewportSize({ width: 1700, height: HEIGHT });
    await expect(rail()).toBeVisible();
  });

  test('the stage keeps its 60% floor at the boundary', async ({ page }) => {
    await openProShell(page, 1700);
    const stage = page.locator('.oh-shell__center-stage');
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    // 60% of 1700 = 1020. Allow a pixel of subpixel rounding, no more.
    expect(box!.width).toBeGreaterThanOrEqual(1019);
  });
});
