import { expect, test } from '@playwright/test';

const surface = (lens: 'vibe' | 'pro') => `/?demo=1&surface=model-profile&lens=${lens}`;

test.describe('model profiles and observed reliability', () => {
  for (const lens of ['vibe', 'pro'] as const) {
    test(`renders provenance, no-data reliability, and fallback honesty in the ${lens} lens`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(surface(lens));

      await expect(page.getByTestId('shell-root')).toHaveAttribute('data-lens', lens);
      await expect(page.getByTestId('model-profile-panel')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'SDK-native readings' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Local operator configuration' })).toBeVisible();
      await expect(page.getByTestId('reliability-tier')).toHaveText('No data');
      await expect(page.getByTestId('reliability-posture')).toContainText('No observations yet');
      await expect(page.getByTestId('tool-count-warning')).toContainText('30 concurrently enabled tools');
      await expect(page.getByTestId('cloud-fallback-reason')).toContainText(/no verified SDK mechanism/i);
      await expect(page.getByRole('button', { name: 'Substitute for this task' })).toBeDisabled();
    });
  }

  test('below 900px the local profile controls are read-only without an exception', async ({ page }) => {
    await page.setViewportSize({ width: 899, height: 900 });
    await page.goto(surface('vibe'));

    await expect(page.getByTestId('shell-root')).toHaveAttribute('data-read-only', 'true');
    await expect(page.getByLabel('Quantization')).toBeDisabled();
    await expect(page.getByLabel('Data egress status')).toBeDisabled();
    await expect(page.getByLabel('Manual deterministic-replay fallback')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Substitute for this task' })).toBeDisabled();
  });

  test('at 900px the local configuration inputs are operable while fallback remains disabled', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto(surface('vibe'));

    await expect(page.getByTestId('shell-root')).toHaveAttribute('data-read-only', 'false');
    await expect(page.getByLabel('Quantization')).toBeEnabled();
    await page.getByLabel('Quantization').fill('Q4_K_M');
    await expect(page.getByLabel('Quantization')).toHaveValue('Q4_K_M');
    await expect(page.getByRole('button', { name: 'Substitute for this task' })).toBeDisabled();
  });
});
