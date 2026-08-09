import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The audit-log feature is intentionally not wired into App.tsx yet. This harness mounts its public
 * panel API through Vite in a real browser so the e2e gate exercises the production TSX module
 * without creating an app-shell route that the feature owner does not own.
 */
async function mountAuditLogPanel(page: Page, endSession = false) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?demo=1');
  await expect(page).toHaveTitle(/OH-GUI/);

  await page.evaluate(async (shouldEndSession) => {
    // Paths are values rather than literal import specifiers so TypeScript does not try to resolve
    // Vite's browser-only dependency cache during `tsc -b`.
    const reactPath = '/node_modules/.vite/deps/react.js';
    const reactDomPath = '/node_modules/.vite/deps/react-dom_client.js';
    const panelPath = '/src/features/audit-log/AuditLogPanel.tsx';
    const logPath = '/src/features/audit-log/audit-log.ts';
    const [React, ReactDom, panelModule, auditModule] = await Promise.all([
      import(/* @vite-ignore */ reactPath),
      import(/* @vite-ignore */ reactDomPath),
      import(/* @vite-ignore */ panelPath),
      import(/* @vite-ignore */ logPath),
    ]);

    const ReactRuntime = (React as { default?: typeof React }).default ?? React;
    const ReactDomRuntime = (ReactDom as { default?: typeof ReactDom }).default ?? ReactDom;

    const audit = new auditModule.AuthorizationAuditLog({
      sessionId: 'conversation-e2e',
      clock: () => '2026-08-09T05:00:00.000Z',
      entryId: (sequence: number) => `e2e-entry-${sequence}`,
    });
    audit.append({
      decision: 'approved',
      actionLabel: 'Inspect local workspace',
      actionClass: 'workspace-read',
      confidence: 0.9,
      provenance: [
        {
          id: 'context-workspace-1',
          trust_class: 'workspace-derived',
          source: 'workspace/package.json',
        },
      ],
      sdkNative: auditModule.sdkNativeAuthorizationSnapshotFromEvent({
        kind: 'ActionEvent',
        id: 'action-e2e-1',
        timestamp: '2026-08-09T04:59:00.000Z',
        source: 'agent',
        tool_name: 'read_file',
        tool_call_id: 'call-e2e-1',
        security_risk: 'LOW',
      }),
    });
    audit.append({
      decision: 'rejected',
      actionLabel: 'Apply remote migration instructions',
      actionClass: null,
      confidence: 0.7,
      provenance: [],
      sdkNative: null,
      rejectionReason: 'The instruction source is untrusted.',
    });
    audit.append({
      decision: 'relaxation-granted',
      actionLabel: 'Read workspace manifest',
      actionClass: 'workspace-read',
      confidence: 0.95,
      provenance: [
        {
          id: 'context-policy-1',
          trust_class: 'first-party',
          source: 'operator policy',
        },
      ],
      sdkNative: null,
      relaxationClass: 'workspace-read',
    });
    if (shouldEndSession) audit.endSession();

    const mount = document.createElement('div');
    mount.id = 'audit-log-e2e-mount';
    document.body.replaceChildren(mount);
    (window as unknown as { __auditLogExports: string[] }).__auditLogExports = [];
    ReactDomRuntime.createRoot(mount).render(
      ReactRuntime.createElement(panelModule.AuthorizationAuditLogPanel, {
        entries: audit.entries,
        session: audit.session,
        activeRelaxationCount: audit.activeRelaxationCount,
        onExport: (payload: string) => {
          (window as unknown as { __auditLogExports: string[] }).__auditLogExports.push(payload);
        },
      }),
    );
  }, endSession);
}

test.describe('authorization audit log panel (unwired public module)', () => {
  test('renders decision-time provenance, native/local separation, and a live relaxation badge', async ({ page }) => {
    await mountAuditLogPanel(page);

    const panel = page.getByTestId('authorization-audit-log-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Authorization audit log' })).toBeVisible();
    await expect(page.getByTestId('active-relaxation-count')).toHaveText('Active relaxations: 1');
    await expect(page.getByText('Approved')).toBeVisible();
    await expect(page.getByText('Rejected with reason')).toBeVisible();
    await expect(page.getByText('Relaxation granted')).toBeVisible();
    await expect(page.getByText('context-workspace-1')).toBeVisible();
    await expect(page.getByText('workspace-derived')).toBeVisible();
    await expect(page.getByText('Captured at decision time: no context items informed this decision.')).toBeVisible();
    await expect(page.getByTestId('audit-sdk-native-unavailable')).toHaveCount(2);
    await expect(page.getByTestId('audit-sdk-native-unavailable').first()).toContainText(/not supplied/i);
    await expect(panel.getByText('GUI-local decision record').first()).toBeVisible();
    await expect(panel.getByText('SDK-native readings').first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the audit panel overflows a 1280px viewport').toBeLessThanOrEqual(0);

    const results = await new AxeBuilder({ page }).include('[data-testid=authorization-audit-log-panel]').analyze();
    expect(results.violations.map((violation) => `${violation.id} — ${violation.help}`)).toEqual([]);
  });

  test('exports the exact visible session record', async ({ page }) => {
    await mountAuditLogPanel(page);
    await page.getByTestId('audit-log-export').click();

    const exports = await page.evaluate(
      () => (window as unknown as { __auditLogExports: string[] }).__auditLogExports,
    );
    expect(exports).toHaveLength(1);
    expect(JSON.parse(exports[0]!)).toMatchObject({
      format: 'oh-gui.authorization-audit-log.v1',
      session: { sessionId: 'conversation-e2e', status: 'active', endedAt: null },
      entries: [
        { decision: 'approved', confidence: 0.9 },
        { decision: 'rejected', confidence: 0.7 },
        { decision: 'relaxation-granted', confidence: 0.95 },
      ],
    });
  });

  test('shows session expiry and a zero active-relaxation count after conversation end', async ({ page }) => {
    await mountAuditLogPanel(page, true);

    await expect(page.getByTestId('active-relaxation-count')).toHaveText('Active relaxations: 0');
    await expect(page.getByTestId('audit-session-ended')).toContainText(/all relaxation grants have expired/i);
    await expect(page.getByText(/Expired when this session ended/)).toBeVisible();
  });
});
