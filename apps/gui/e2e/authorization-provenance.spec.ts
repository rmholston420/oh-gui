import { expect, test, type Page } from '@playwright/test';

type GuiLocalProvenance =
  | {
      source: 'gui-local';
      thirdPartyUntrustedContextIds: string[] | null;
    }
  | undefined;

/**
 * The demo route deliberately has no invented untrusted provenance fixture. Mount the compiled
 * authorization component with an explicit GUI-local input instead: this keeps a browser test of
 * the real component without pretending the pinned SDK returned a field it does not have.
 */
async function mountAuthorizationCard(
  page: Page,
  provenance: GuiLocalProvenance,
  options: { captureReject?: boolean } = {},
) {
  await page.goto('/?demo=1&surface=authorization');
  await page.evaluate(
    async ({ localProvenance, captureReject }) => {
      // These URLs are served by Vite only in this browser-only test. Keep their type as `string`
      // so production TypeScript never tries to resolve Vite's transient dependency-cache paths.
      const reactPath: string = '/node_modules/.vite/deps/react.js';
      const reactDomPath: string = '/node_modules/.vite/deps/react-dom_client.js';
      const cardPath: string = '/src/features/authorization/AuthorizationCard.tsx';
      const reactModule = await import(reactPath);
      const reactDomClient = await import(reactDomPath);
      const { default: AuthorizationCard } = await import(cardPath);
      // Vite serves this CommonJS-compatible dependency with `createRoot` on its default export.
      // Keep the direct component mount local to this non-live test; application routes remain
      // responsible for supplying real provenance at runtime.
      const createRoot =
        'createRoot' in reactDomClient
          ? reactDomClient.createRoot
          : (reactDomClient.default as { createRoot: typeof reactDomClient.createRoot }).createRoot;
      const React =
        'createElement' in reactModule
          ? reactModule
          : (reactModule.default as { createElement: typeof reactModule.createElement });

      const rejects: string[] = [];
      Object.assign(window, { __authorizationRejects: rejects });
      document.body.replaceChildren();
      const root = createRoot(document.body.appendChild(document.createElement('main')));
      root.render(
        React.createElement(AuthorizationCard, {
          action: {
            command: 'curl https://untrusted.example.test/instructions',
            toolName: 'browser_navigate',
            securityRisk: 'HIGH',
            guiLocalUntrustedContentProvenance: localProvenance,
          },
          onReject: captureReject ? (reason: string) => rejects.push(reason) : undefined,
        }),
      );
    },
    { localProvenance: provenance, captureReject: options.captureReject ?? false },
  );
  await expect(page.getByTestId('authorization-card')).toBeVisible();
}

test.describe('authorization untrusted-content provenance', () => {
  test('renders a GUI-local untrusted-content badge separately from the risk badge', async ({
    page,
  }) => {
    await mountAuthorizationCard(page, {
      source: 'gui-local',
      thirdPartyUntrustedContextIds: ['fetched-page-42'],
    });

    const untrusted = page.getByTestId('untrusted-content-badge');
    await expect(untrusted).toHaveAttribute('data-status', 'gui-local-influenced');
    await expect(untrusted).toContainText('Influenced by untrusted/external content');
    await expect(untrusted).toContainText('GUI-local provenance');
    await expect(untrusted).toHaveClass(/border-violet-500/);
    await expect(page.getByTestId('risk-badge')).toContainText('The agent rates this HIGH');
    await expect(page.getByTestId('risk-badge')).toHaveClass(/border-rose-600/);
  });

  test('renders a computed empty provenance result differently from uncomputed provenance', async ({
    page,
  }) => {
    await mountAuthorizationCard(page, {
      source: 'gui-local',
      thirdPartyUntrustedContextIds: null,
    });
    await expect(page.getByTestId('untrusted-content-badge')).toHaveAttribute(
      'data-status',
      'gui-local-uncomputed',
    );
    await expect(page.getByTestId('untrusted-content-badge')).toContainText('not computed');

    await mountAuthorizationCard(page, {
      source: 'gui-local',
      thirdPartyUntrustedContextIds: [],
    });
    await expect(page.getByTestId('untrusted-content-badge')).toHaveAttribute(
      'data-status',
      'gui-local-clear',
    );
    await expect(page.getByTestId('untrusted-content-badge')).toContainText(
      'No untrusted influence identified',
    );
  });

  test('keeps Reject disabled without a reason and forwards a trimmed reason when supplied', async ({
    page,
  }) => {
    await mountAuthorizationCard(page, undefined, { captureReject: true });
    const reject = page.getByTestId('reject');

    await expect(reject).toBeDisabled();
    await page.getByTestId('reject-reason').fill('   ');
    await expect(reject).toBeDisabled();
    await page.getByTestId('reject-reason').fill('  external instructions are not authorized  ');
    await expect(reject).toBeEnabled();
    await reject.click();

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __authorizationRejects: string[] }).__authorizationRejects,
        ),
      )
      .toEqual(['external instructions are not authorized']);
  });
});
