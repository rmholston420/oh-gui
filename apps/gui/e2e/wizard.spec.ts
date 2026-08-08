import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Visual + accessibility gate for the first-run wizard (docs/specs/03-layout.md section 3.4).
 *
 * Why this exists on top of the Vitest suite: the unit tests passed on a build whose outcome cells
 * wrapped "Pauses for you" onto two lines in every row and whose risk chips failed small-text
 * contrast. jsdom has no layout engine and no colours, so it cannot see either class of defect.
 * Only a real browser can, and only a script does it every time rather than when someone remembers.
 *
 * The contrast assertions are also the local, non-CI form of the contrast gates that
 * docs/specs/07-visual-design.md requires (GitHub Actions is out of scope for this project).
 */

const STEPS = [
  { n: 1, heading: '1. Connect a model' },
  { n: 2, heading: '2. What each trust-dial stop does' },
  { n: 3, heading: /^3\. Your default:/ },
  { n: 4, heading: '4. Lines accepted without inspection' },
  { n: 5, heading: '5. How a plan will look' },
] as const;

async function gotoStep(page: Page, n: number) {
  await page.goto('/');
  // `reuseExistingServer` trusts anything answering on the port. If some unrelated process holds
  // 5173, every assertion below fails as though the UI were broken. Fail on the real cause instead.
  await expect(page, 'something other than OH-GUI is serving the dev port').toHaveTitle(/OH-GUI/);
  for (let i = 1; i < n; i++) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText(`Step ${n} of 5`)).toBeVisible();
}

/** Fails on any element whose text does not meet the WCAG AA contrast ratio. */
async function expectNoContrastViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    `accessibility violations on ${label}`,
  ).toEqual([]);
}

test.describe('first-run wizard', () => {
  for (const step of STEPS) {
    test(`step ${step.n} renders, is readable, and is screenshotted`, async ({ page }, info) => {
      await gotoStep(page, step.n);
      await expect(page.getByRole('heading', { name: step.heading })).toBeVisible();
      await expectNoContrastViolations(page, `step ${step.n}`);
      // Attached to the report so the rendered screen is reviewable, not just asserted about.
      await info.attach(`wizard-step-${step.n}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    });
  }

  test('no text is clipped or overflowing its container', async ({ page }) => {
    await gotoStep(page, 2);
    // The widest screen. Catches horizontal overflow of the 5-column decision table.
    const overflow = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        if (!el.textContent?.trim()) continue;
        const r = el.getBoundingClientRect();
        // Screen-reader-only text (`sr-only`) is a 1px clipped box BY DESIGN. Flagging it would
        // train us to ignore this gate, which is worse than not having it.
        if (r.width <= 1 || r.height <= 1) continue;
        const s = getComputedStyle(el);
        // `auto`/`scroll` are deliberate scrollers (the table wrapper is one) - not a defect.
        // `hidden`/`clip` silently cut content off, which is exactly what we are hunting.
        const clipsX = s.overflowX === 'hidden' || s.overflowX === 'clip';
        const clipsY = s.overflowY === 'hidden' || s.overflowY === 'clip';
        if (
          (clipsX && el.scrollWidth > el.clientWidth + 1) ||
          (clipsY && el.scrollHeight > el.clientHeight + 1)
        ) {
          bad.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
        }
      }
      return bad;
    });
    expect(overflow).toEqual([]);
  });

  test('the decision table agrees with the predicate under test', async ({ page }) => {
    await gotoStep(page, 2);
    // Same assertions as the unit test, but against the real rendered DOM.
    await expect(page.getByTestId('cell-ask-risky-HIGH-in')).toHaveText('Pauses for you');
    await expect(page.getByTestId('cell-ask-risky-LOW-out')).toHaveText('Proceeds');
    await expect(page.getByTestId('cell-ask-outside-worktree-LOW-out')).toHaveText('Pauses for you');
    await expect(page.getByTestId('cell-never-HIGH-in')).toHaveText('Proceeds');
  });

  test('renders at a narrow viewport without clipping', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1000 });
    await gotoStep(page, 2);
    const doc = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(doc.scroll, 'page must not scroll horizontally').toBeLessThanOrEqual(doc.client + 1);
  });
});
