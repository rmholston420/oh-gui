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

/**
 * These tests wait on a real model, so a silent terminal is indistinguishable from a hang. Every
 * phase announces itself with elapsed seconds. Reporters only print on test completion; worker
 * stdout is forwarded immediately, which is why progress goes through console.log.
 */
const T0 = Date.now();
function step(message: string): void {
  const seconds = ((Date.now() - T0) / 1000).toFixed(0).padStart(4);
  // eslint-disable-next-line no-console
  console.log(`\x1b[36m[${seconds}s]\x1b[0m ${message}`);
}

// File scope, not describe scope: Playwright rejects `test.use()` inside a describe block, and the
// failure mode is nasty — it does not fail this file, it fails collection for the whole directory,
// so every other spec silently reports "0 tests" and the suite goes green by finding nothing.
test.use({ video: 'on' });

test.describe('@live real conversation against agent-server', () => {
  test.describe.configure({ mode: 'serial', timeout: LIVE_TIMEOUT_MS });

  test.beforeAll(async ({ request }) => {
    // `/health` and `/ready` are mounted at the ROOT, not under `/api`: the agent-server builds
    // them on an `APIRouter(prefix="")` included with no prefix
    // (`openhands/agent_server/server_details_router.py:17,97`). An earlier version of this probe
    // used `GET /api/conversations`, which returns 422 on a bodyless GET — a documented rough edge
    // in `docs/agent-server-contract.md`. That made a healthy server look dead.
    //
    // `/ready` is the one that matters: it 503s until initialization completes, so a pass here
    // means the server can actually accept a conversation, not merely that a process is listening.
    let detail: string;
    let ready = false;
    try {
      const response = await request.get(`${AGENT_SERVER}/ready`, { timeout: 5_000 });
      ready = response.ok();
      detail = `GET /ready -> HTTP ${response.status()}`;
    } catch (error) {
      detail = `GET /ready -> ${error instanceof Error ? error.message : String(error)}`;
    }
    expect(
      ready,
      `agent-server is not ready at ${AGENT_SERVER} (${detail}).\n` +
        'Start it and wait for initialization, then re-run:\n' +
        '  docker start ohg-verify\n' +
        '  curl -s http://127.0.0.1:8000/ready\n',
    ).toBe(true);
  });

  /** Start a run whose only sensible completion requires one shell command. */
  async function startRun(page: Page, goal: string) {
    await page.goto('/');

    // Spec 03 makes the GUI read-only below 900px with no exception path, so a window that failed
    // to maximize would disable the very controls these tests click, and the failure would surface
    // as an unexplained "element is not enabled" twenty seconds later. Name it here instead.
    const { width, height } = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    // Printed every run so the size the operator is actually looking at is a known number rather
    // than something inferred from how the window looks. Pin it with WATCH_WIDTH / WATCH_HEIGHT.
    console.log(`[viewport] ${width}x${height}`);
    expect(
      width,
      `viewport is ${width}px wide; below 900px the GUI is read-only by design and no control can ` +
        'be clicked. The watched window did not maximize. Force a size:\n' +
        '  WATCH_WIDTH=1920 WATCH_HEIGHT=1080 npm run watch:live\n',
    ).toBeGreaterThanOrEqual(900);

    // The shell must be present and must not have swallowed the run surface.
    await expect(page.getByRole('heading', { name: 'Agent Server workspace' })).toBeVisible();

    step(`starting run: ${goal.slice(0, 60)}...`);
    await page.getByLabel('Goal').fill(goal);
    // "Ask always" maps to AlwaysConfirm(), so the first tool call is guaranteed to pause. Without
    // this the run may finish before a human could act, and the approval path would go untested
    // while still reporting green.
    await page.getByLabel('Trust dial').selectOption('ask-always');
    await page.getByRole('button', { name: 'Start' }).click();

    // Proof the server accepted the conversation: the id stops being 'unavailable'.
    const conversationId = page.locator('dt', { hasText: 'Conversation' }).locator('+ dd');
    await expect(conversationId).not.toHaveText('unavailable', { timeout: 60_000 });
    step(`conversation accepted by the server: ${await conversationId.textContent()}`);
  }

  /** Wait for the model to actually produce a pending action, not merely for the poll to tick. */
  async function waitForPendingAction(page: Page) {
    step('waiting for the model to emit a tool call (up to 180s)...');
    await expect(page.getByRole('region', { name: 'Pending authorization' })).toBeVisible({
      timeout: 180_000,
    });
    await expect(page.getByTestId('approve').first()).toBeEnabled({ timeout: 30_000 });
    step('pending action arrived and is approvable');
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

  test('a follow-up message steers a real run without restarting it', async ({ page }) => {
    await startRun(
      page,
      'Run the single shell command: echo OHGUI_FIRST. Then call finish. Do not do anything else.',
    );

    const conversationId = page.locator('dt', { hasText: 'Conversation' }).locator('+ dd');
    const idBefore = await conversationId.textContent();

    await waitForPendingAction(page);
    await page.getByTestId('approve').first().click();

    // The composer only exists once a conversation does. Steering a run that was never started is
    // the failure this guard exists for. It is a <form>, so its role is `form`, not `region` —
    // the unit tests queried it by label text and never exercised the role, which is precisely
    // why this only surfaced live.
    const composer = page.getByRole('form', { name: 'Steer the run' });
    await expect(composer).toBeVisible({ timeout: 60_000 });

    const rows = page.getByTestId('event-row');
    const before = await rows.count();

    await page.getByLabel('Follow-up instruction').fill(
      'Now run exactly: echo OHGUI_STEERED. Then call finish.',
    );
    step('sending follow-up into the same conversation');
    await page.getByRole('button', { name: 'Send follow-up' }).click();

    // Proof the server accepted the steer rather than the GUI merely clearing its textarea: the
    // SAME conversation grows new events. A new conversation id here would mean we restarted.
    await expect
      .poll(async () => rows.count(), {
        timeout: 180_000,
        message: 'event log never grew after the follow-up was sent',
      })
      .toBeGreaterThan(before);
    await expect(conversationId).toHaveText(idBefore ?? '');

    // The agent must actually act on the new instruction, not just receive it.
    await expect(page.getByTestId('event-log')).toContainText('OHGUI_STEERED', {
      timeout: 180_000,
    });
  });

  test('a real authorization decision is recorded in the audit log', async ({ page }) => {
    await startRun(
      page,
      'Run the single shell command: echo OHGUI_AUDIT_PROOF. Then call finish. Do not do anything else.',
    );

    // Nothing has been decided yet, so there is nothing to show.
    await expect(page.getByRole('region', { name: 'Authorization history' })).toBeHidden();

    await waitForPendingAction(page);
    await page.getByTestId('approve').first().click();

    step('approved; checking the audit log recorded it');
    const history = page.getByRole('region', { name: 'Authorization history' });
    await expect(history).toBeVisible({ timeout: 60_000 });
    // The record must carry the decision and the command that was authorized, or it is not
    // evidence of anything.
    await expect(history).toContainText('Approved');
    await expect(history).toContainText('echo');
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
