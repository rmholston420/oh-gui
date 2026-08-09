// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AuthorizationCard, { type PendingAction } from './AuthorizationCard';

const ACTION: PendingAction = {
  command: 'curl https://example.test',
  toolName: 'browser_navigate',
  securityRisk: 'HIGH',
};

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, writable: true, configurable: true });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => setWidth(1280));

describe('untrusted-content provenance (spec 04a)', () => {
  it('shows a distinct GUI-local badge when untrusted context influenced the action', () => {
    setWidth(1280);
    render(
      <AuthorizationCard
        action={{
          ...ACTION,
          guiLocalUntrustedContentProvenance: {
            source: 'gui-local',
            thirdPartyUntrustedContextIds: ['web-result-7'],
          },
        }}
      />,
    );

    const badge = screen.getByTestId('untrusted-content-badge');
    expect(badge).toHaveAttribute('data-status', 'gui-local-influenced');
    expect(badge).toHaveTextContent(/influenced by untrusted\/external content/i);
    expect(badge).toHaveTextContent(/GUI-local provenance/i);
    expect(screen.getByTestId('risk-badge')).toHaveTextContent('The agent rates this HIGH');
  });

  it('does not render computed-empty local provenance as uncomputed provenance', () => {
    setWidth(1280);
    const { rerender } = render(
      <AuthorizationCard
        action={{
          ...ACTION,
          guiLocalUntrustedContentProvenance: {
            source: 'gui-local',
            thirdPartyUntrustedContextIds: null,
          },
        }}
      />,
    );
    expect(screen.getByTestId('untrusted-content-badge')).toHaveAttribute(
      'data-status',
      'gui-local-uncomputed',
    );
    expect(screen.getByTestId('untrusted-content-badge')).toHaveTextContent(/not computed/i);

    rerender(
      <AuthorizationCard
        action={{
          ...ACTION,
          guiLocalUntrustedContentProvenance: {
            source: 'gui-local',
            thirdPartyUntrustedContextIds: [],
          },
        }}
      />,
    );
    expect(screen.getByTestId('untrusted-content-badge')).toHaveAttribute(
      'data-status',
      'gui-local-clear',
    );
    expect(screen.getByTestId('untrusted-content-badge')).toHaveTextContent(
      /no untrusted influence identified/i,
    );
  });
});
