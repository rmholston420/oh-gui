import { expect, test, type Page } from '@playwright/test';

/**
 * LIVE end-to-end run against the real Agent Server. Nothing here is mocked.
 *
 * Every other spec in this directory drives `?demo=1`, which mounts inert fixtures. Those prove the
 * surfaces render; they cannot prove the system works, because a fixture cannot refuse, stall, or
 * return a shape nobody anticipated. This spec starts a real conversation, waits for a real model
 * to emit a real tool call, and answers the resulting authorization with the real
 * `respond_to_confirmation` endpoint.
 *
 * Tagged `@live` and excluded from `npm run test:e2e`, for one reason only: a 27B model takes
 * 20-40s per conversation, and a fast gate that waits on inference stops being a fast gate. It is
 * excluded because it is *slow*, not because it is optional — it is the only spec that can fail
 * for a reason worth knowing about.
 *
 * Preconditions, checked in `beforeAll` so a missing one fails in seconds with a readable reason
 * rather than as an opaque 4-minute timeout:
 *   - agent-server listening on 127.0.0.1:8000
 *   - Ollama serving the configured model
 */

const AGENT_SERVER = 'http://127.0.0.1:8000';
const LIVE_TIMEOUT_MS = 240_000;

// File scope, not describe scope: Playwright rejects `test.use()` inside a describe block, and the
// failure mode is nasty — it does not fail this file, it fails collection for the whole directory,
// so every other spec silently reports "0 tests" and the suite goes green by finding nothing.
test.use({ video: 'on' });

test.describe('@live real conversation against agent-server', () => {
  test.describe.configure({ mode: 'serial', timeout: LIVE_TIMEOUT_MS });

  test.beforeAll(async ({ request }) => {
    let reachable = false;
    let detail: string;
    try {
      // `/api/conversations` answers a bodyless GET; `/events` does not (it 422s), which is why
      // the liveness probe is not pointed at the events route.
      const response = await request.get(`${AGENT_SERVER}/api/conversations`, { timeout: 5_000 });
      reachable = response.ok();
      detail = `HTTP ${response.status()}`;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    expect(
      reachable,
      `agent-server is not answering at ${AGENT_SERVER} (${detail}).\n` +
        'Start it, then re-run:\n' +
        '  docker start ohg-verify\n',
    ).toBe(true);
  });

  /** Start a run whose only sensible completion requires one shell command. */
  async function startRun(page: Page, goal: string) {
    await page.goto('/');

    // The shell must be present and must not have swallowed the run surface.
    await expect(page.getByRole('heading', { name: 'Agent Server workspace' })).toBeVisible();

    await page.getByLabel('Goal').fill(goal);
    // "Ask always" maps to AlwaysConfirm(), so the first tool call is guaranteed to pause. Without
    // this the run may finish before a human could act, and the approval path would go untested
    // while still reporting green.
    await page.getByLabel('Trust dial').selectOption('ask-always');
    await page.getByRole('button', { name: 'Start' }).click();

    // Proof the server accepted the conversation: the id stops being 'unavailable'.
    const conversationId = page.locator('dt', { hasText: 'Conversation' }).locator('+ dd');
    await expect(conversationId).not.toHaveText('unavailable', { timeout: 60_000 });
  }

  /** Wait for the model to actually produce a pending action, not merely for the poll to tick. */
  async function waitForPendingAction(page: Page) {
    await expect(page.getByRole('region', { name: 'Pending authorization' })).toBeVisible({
      timeout: 180_000,
    });
    await expect(page.getByTestId('approve').first()).toBeEnabled({ timeout: 30_000 });
  }

  test('streams real events and approves a real pending action', async ({ page }) => {
    await startRun(
      page,
      'Run the single shell command: echo OHGUI_LIVE_PROOF. Then call finish. Do not do anything else.',
    );

    // The event log is the ported Agent Canvas renderer. If the port is wrong, this is where it
    // shows: raw JSON, a blank list, or an event folded into the wrong kind.
    await expect(page.getByTestId('event-log')).toBeVisible({ timeout: 120_000 });
    const rows = page.getByTestId('event-row');
    await expect(rows.first()).toBeVisible();

    const before = await rows.count();
    await waitForPendingAction(page);

    // The command is shown to the operator before they can authorize it. Reading the command is
    // the entire point of the pause.
    await expect(page.getByLabel('Command awaiting authorization')).toContainText('echo');

    await page.getByTestId('approve').first().click();

    // Approval must move the server off its pause. Asserting the card merely disappeared would
    // pass if the GUI hid it locally without the server ever hearing about it.
    await expect(page.getByRole('region', { name: 'Pending authorization' })).toBeHidden({
      timeout: 60_000,
    });
    await expect
      .poll(async () => rows.count(), { timeout: 120_000, message: 'event log never grew after approval' })
      .toBeGreaterThan(before);
  });

  test('rejects a real pending action with a required reason', async ({ page }) => {
    await startRun(
      page,
      'Run the single shell command: echo OHGUI_REJECT_PROOF. Then call finish. Do not do anything else.',
    );
    await waitForPendingAction(page);

    // Reject is gated on a reason: spec 04 section 4.2 requires free text, and the constraint is
    // that the control is unusable without it rather than that the reason is merely requested.
    await expect(page.getByTestId('reject').first()).toBeDisabled();
    await page.getByTestId('reject-reason').first().fill('Live e2e: rejecting to prove the path.');
    await expect(page.getByTestId('reject').first()).toBeEnabled();

    await page.getByTestId('reject').first().click();

    await expect(page.getByRole('region', { name: 'Pending authorization' })).toBeHidden({
      timeout: 60_000,
    });
  });

  test('the lens toggle does not disturb a live run', async ({ page }) => {
    await startRun(page, 'Run the single shell command: echo OHGUI_LENS_PROOF. Then call finish.');

    const conversationId = page.locator('dt', { hasText: 'Conversation' }).locator('+ dd');
    const idBefore = await conversationId.textContent();

    // Selected by accessible name rather than a test id: if the control stops being reachable by
    // its label, that is a real accessibility regression and this should fail.
    await page.getByRole('button', { name: 'Switch to pro lens' }).click();
    await expect(page.getByTestId('shell-root')).toHaveAttribute('data-lens', 'pro');

    // Same conversation, same mounted surface. A lens change that restarted the run or refetched
    // would show up here as a changed or cleared id.
    await expect(conversationId).toHaveText(idBefore ?? '');
    await expect(page.getByRole('heading', { name: 'Agent Server workspace' })).toBeVisible();
  });
});
