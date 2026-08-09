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
import {
  APPROVAL_MIN_WIDTH_COARSE,
  APPROVAL_MIN_WIDTH_FINE,
  canActOnAuthorization,
} from '../features/authorization/viewport';

const ACTION: PendingAction = {
  command: 'rm -rf ~/dev/oh-gui/node_modules',
  toolName: 'execute_bash',
  securityRisk: 'HIGH',
};

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, writable: true, configurable: true });
  window.dispatchEvent(new Event('resize'));
}

function setPointerCoarse(coarse: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

beforeEach(() => setPointerCoarse(false));
afterEach(() => setWidth(1280));

const ACTIONS = ['approve', 'reject', 'approve-and-relax'] as const;

describe('the read-only gate', () => {
  it('treats exactly 900px as wide enough, and 899 as not', () => {
    // The spec says ">=900px", so the boundary is load-bearing. An off-by-one here locks the
    // operator out of a window that is, per spec, adequate.
    expect(canActOnAuthorization(APPROVAL_MIN_WIDTH_COARSE, true)).toBe(true);
    expect(canActOnAuthorization(APPROVAL_MIN_WIDTH_COARSE - 1, true)).toBe(false);
    expect(canActOnAuthorization(APPROVAL_MIN_WIDTH_FINE, false)).toBe(true);
    expect(canActOnAuthorization(APPROVAL_MIN_WIDTH_FINE - 1, false)).toBe(false);
  });

  it('keeps the two floors distinct so a mouse window is not held to the touch rule (ADR-034)', () => {
    // Mutation: collapse approvalMinWidth to a single constant. Whichever constant survives, one
    // of these turns red -- that is the whole point of keeping them apart.
    expect(APPROVAL_MIN_WIDTH_FINE).toBeLessThan(APPROVAL_MIN_WIDTH_COARSE);

    // 860px is a quarter-width snap on the operator's 3440x1440 display. With a mouse it must
    // work; the same width on a touch device must not.
    expect(canActOnAuthorization(860, false)).toBe(true);
    expect(canActOnAuthorization(860, true)).toBe(false);
  });

  it('renders the quarter-tile window actionable with a mouse', () => {
    setPointerCoarse(false);
    setWidth(860);
    render(<AuthorizationCard action={ACTION} />);
    // Reject is excluded deliberately: it carries its own gate on a free-text reason and is
    // disabled at every width until one is typed. Asserting it here would make this test pass or
    // fail for a reason that has nothing to do with the viewport.
    expect(screen.getByTestId('approve')).toBeEnabled();
    expect(screen.getByTestId('approve-and-relax')).toBeEnabled();
    expect(screen.getByTestId('reject-reason')).toBeEnabled();
    expect(screen.queryByTestId('narrow-viewport-notice')).toBeNull();
  });

  it('still locks the same width down for a touch pointer', () => {
    setPointerCoarse(true);
    setWidth(860);
    render(<AuthorizationCard action={ACTION} />);
    for (const id of ACTIONS) expect(screen.getByTestId(id)).toBeDisabled();
  });

  it('disables every action below the touch floor', () => {
    setPointerCoarse(true);
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
    setPointerCoarse(true);
    setWidth(800);
    render(<AuthorizationCard action={ACTION} />);
    expect(screen.getByTestId('narrow-viewport-notice')).toHaveTextContent(
      /at least 900px wide/i,
    );
  });

  it('offers no exception path below the breakpoint (ADR-003, ADR-022)', async () => {
    setPointerCoarse(true);
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
    setPointerCoarse(true);
    setWidth(800);
    render(<AuthorizationCard action={ACTION} />);
    setWidth(1000);
    expect(await screen.findByTestId('approve')).toBeEnabled();
  });

  it('goes read-only when a wide window is narrowed', async () => {
    setPointerCoarse(true);
    setWidth(1000);
    render(<AuthorizationCard action={ACTION} />);
    expect(screen.getByTestId('approve')).toBeEnabled();
    setWidth(800);
    expect(await screen.findByTestId('approve')).toBeDisabled();
  });
});

describe('the mouse floor (ADR-034)', () => {
  it('locks down a window too narrow to read the command and diff together', () => {
    setPointerCoarse(false);
    setWidth(APPROVAL_MIN_WIDTH_FINE - 1);
    render(<AuthorizationCard action={ACTION} />);
    for (const id of ACTIONS) expect(screen.getByTestId(id)).toBeDisabled();
  });

  it('quotes the floor that actually applies, not the touch one', () => {
    setPointerCoarse(false);
    setWidth(APPROVAL_MIN_WIDTH_FINE - 1);
    render(<AuthorizationCard action={ACTION} />);
    // Naming the 900px touch floor at a mouse-driven 767px window would tell the operator to widen
    // to a size the gate does not require.
    expect(screen.getByTestId('narrow-viewport-notice')).toHaveTextContent(/at least 768px wide/i);
    expect(screen.getByTestId('narrow-viewport-notice')).not.toHaveTextContent(/900px/i);
  });

  it('falls back to the strict floor when the pointer cannot be interrogated', () => {
    // Mutation M3: flipping the unknown-pointer fallback from coarse to fine survived the whole
    // suite, so the fail-open default this module's header warns about would have shipped green.
    // An environment without matchMedia must resolve to the stricter floor, not the looser one.
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true, value: undefined,
    });
    setWidth(860);
    render(<AuthorizationCard action={ACTION} />);
    expect(screen.getByTestId('approve')).toBeDisabled();
    expect(screen.getByTestId('narrow-viewport-notice')).toHaveTextContent(/at least 900px wide/i);
  });

  it('acts on the quarter-tile window the old single rule killed', () => {
    setPointerCoarse(false);
    setWidth(860);
    render(<AuthorizationCard action={ACTION} />);
    expect(screen.getByTestId('approve')).toBeEnabled();
  });

  it('tightens to the touch floor when the pointer becomes coarse at a fixed width', async () => {
    // The same 860px window is actionable or not depending on what is pointing at it. If the
    // component ever reads width alone again, this is the test that notices.
    setPointerCoarse(false);
    setWidth(860);
    const { unmount } = render(<AuthorizationCard action={ACTION} />);
    expect(screen.getByTestId('approve')).toBeEnabled();
    unmount();
    setPointerCoarse(true);
    render(<AuthorizationCard action={ACTION} />);
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
