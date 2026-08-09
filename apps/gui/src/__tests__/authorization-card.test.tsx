// @vitest-environment jsdom
/**
 * Unit gate for the 900px read-only rule (docs/specs/03-layout.md section 3.2, ADR-022).
 *
 * These tests are the fast half. They cannot see layout or colour — jsdom has no layout engine —
 * so the gate is *also* proven headed in e2e/authorization-narrow.spec.ts, which is the proof the
 * operator asked for. Keeping both is deliberate: this file fails in milliseconds on a logic
 * regression, the headed run catches what only a browser can.
 */

import './setup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthorizationCard, {
  type PendingAction,
} from '../features/authorization/AuthorizationCard';
import { APPROVAL_MIN_WIDTH, canActOnAuthorization } from '../features/authorization/viewport';

const ACTION: PendingAction = {
  command: 'rm -rf ~/dev/oh-gui/node_modules',
  toolName: 'execute_bash',
  securityRisk: 'HIGH',
};

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, writable: true, configurable: true });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => setWidth(1280));

const ACTIONS = ['approve', 'reject', 'approve-and-relax'] as const;

describe('the 900px read-only gate', () => {
  it('treats exactly 900px as wide enough, and 899 as not', () => {
    // The spec says ">=900px", so the boundary is load-bearing. An off-by-one here locks the
    // operator out of a window that is, per spec, adequate.
    expect(canActOnAuthorization(APPROVAL_MIN_WIDTH)).toBe(true);
    expect(canActOnAuthorization(APPROVAL_MIN_WIDTH - 1)).toBe(false);
  });

  it('disables every action below the breakpoint', () => {
    setWidth(800);
    render(<AuthorizationCard action={ACTION} />);
    for (const id of ACTIONS) expect(screen.getByTestId(id)).toBeDisabled();
    expect(screen.getByTestId('reject-reason')).toBeDisabled();
  });

  it('starts read-only when mounted into an already-narrow window', async () => {
    // Regression guard: initialising width to a constant and correcting on first resize would
    // render the card actionable for one paint in a narrow window. One paint is enough to click.
    setWidth(700);
    render(<AuthorizationCard action={ACTION} />);
    expect(await screen.findByTestId('approve')).toBeDisabled();
  });

  it('says why it is read-only instead of leaving a greyed-out button to be interpreted', () => {
    setWidth(800);
    render(<AuthorizationCard action={ACTION} />);
    expect(screen.getByTestId('narrow-viewport-notice')).toHaveTextContent(
      /at least 900px wide/i,
    );
  });

  it('offers no exception path below the breakpoint (ADR-003, ADR-022)', async () => {
    setWidth(800);
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onApproveAndRelax = vi.fn();
    render(
      <AuthorizationCard
        action={ACTION}
        onApprove={onApprove}
        onReject={onReject}
        onApproveAndRelax={onApproveAndRelax}
      />,
    );
    // Not just "disabled" as an attribute — clicking must not fire the handler either. A control
    // that looks disabled but still dispatches is the exact failure this gate exists to prevent.
    for (const id of ACTIONS) await userEvent.click(screen.getByTestId(id));
    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(onApproveAndRelax).not.toHaveBeenCalled();
  });

  it('re-enables when the window is widened past the breakpoint', async () => {
    setWidth(800);
    render(<AuthorizationCard action={ACTION} />);
    setWidth(1000);
    expect(await screen.findByTestId('approve')).toBeEnabled();
  });

  it('goes read-only when a wide window is narrowed', async () => {
    setWidth(1000);
    render(<AuthorizationCard action={ACTION} />);
    expect(screen.getByTestId('approve')).toBeEnabled();
    setWidth(800);
    expect(await screen.findByTestId('approve')).toBeDisabled();
  });
});

describe('the card above the breakpoint', () => {
  it('requires a free-text reason before Reject is available', async () => {
    setWidth(1280);
    const onReject = vi.fn();
    render(<AuthorizationCard action={ACTION} onReject={onReject} />);
    expect(screen.getByTestId('reject')).toBeDisabled();

    // Whitespace is not a reason.
    await userEvent.type(screen.getByTestId('reject-reason'), '   ');
    expect(screen.getByTestId('reject')).toBeDisabled();

    await userEvent.type(screen.getByTestId('reject-reason'), 'touches the volumes');
    expect(screen.getByTestId('reject')).toBeEnabled();
    await userEvent.click(screen.getByTestId('reject'));
    expect(onReject).toHaveBeenCalledWith('touches the volumes');
  });

  it('shows no read-only notice when the operator can act', () => {
    setWidth(1280);
    render(<AuthorizationCard action={ACTION} />);
    expect(screen.queryByTestId('narrow-viewport-notice')).toBeNull();
  });

  it('renders the exact command, not a summary of it', () => {
    setWidth(1280);
    render(<AuthorizationCard action={ACTION} />);
    expect(screen.getByTestId('pending-command')).toHaveTextContent(ACTION.command);
  });
});

describe('risk attribution (ADR-015)', () => {
  it('attributes the risk to the agent rather than stating it as a verdict', () => {
    setWidth(1280);
    render(<AuthorizationCard action={ACTION} />);
    // `ActionEvent.security_risk` is "The LLM's assessment" (action.py:66-69). An unattributed
    // "Risk: HIGH" would imply an analyzer verdict the system cannot recover (ADR-015).
    expect(screen.getByTestId('risk-badge')).toHaveTextContent('The agent rates this HIGH');
  });

  it('distinguishes no-assessment from a low assessment', () => {
    setWidth(1280);
    render(<AuthorizationCard action={{ ...ACTION, securityRisk: null }} />);
    const badge = screen.getByTestId('risk-badge');
    expect(badge).toHaveTextContent(/no risk assessment provided/i);
    expect(badge).not.toHaveTextContent(/LOW/);
  });
});
