// @vitest-environment jsdom
/**
 * The audit log is only worth having if it records what actually happened.
 * These tests pin the three things that make a decision record trustworthy:
 * an approval and a rejection are both recorded, the operator's verbatim
 * rejection reason survives, and an *uncomputed* untrusted-content tracker is
 * never flattened into "clean".
 */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import RunView from '../run/RunView';
import { useAuthorizationAudit } from './useAuthorizationAudit';
import { untrustedProvenanceReferences } from './audit-log';
import type { PendingAction } from '../authorization/AuthorizationCard';

const ACTION: PendingAction = {
  command: 'rm -rf build',
  toolName: 'terminal',
  securityRisk: 'HIGH',
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authorization audit binding', () => {
  it('records an approval against the conversation', () => {
    const { result } = renderHook(() => useAuthorizationAudit('conv-1'));
    act(() => result.current.recordApproval(ACTION));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.decision).toBe('approved');
    expect(result.current.entries[0]!.sessionId).toBe('conv-1');
    expect(result.current.entries[0]!.guiLocal.actionLabel).toBe('rm -rf build');
  });

  it('keeps the operator rejection reason verbatim', () => {
    const { result } = renderHook(() => useAuthorizationAudit('conv-1'));
    act(() => result.current.recordRejection(ACTION, 'that deletes the build I need'));

    expect(result.current.entries[0]!.decision).toBe('rejected');
    expect(result.current.entries[0]!.guiLocal.rejectionReason).toBe(
      'that deletes the build I need',
    );
  });

  it('records nothing when no conversation exists', () => {
    const { result } = renderHook(() => useAuthorizationAudit(null));
    act(() => result.current.recordApproval(ACTION));
    expect(result.current.entries).toHaveLength(0);
  });

  it('does not flatten an uncomputed tracker into a clean result', () => {
    const { result } = renderHook(() => useAuthorizationAudit('conv-1'));

    act(() =>
      result.current.recordApproval({
        ...ACTION,
        guiLocalUntrustedContentProvenance: {
          source: 'gui-local',
          thirdPartyUntrustedContextIds: null,
        },
      }),
    );
    act(() =>
      result.current.recordApproval({
        ...ACTION,
        guiLocalUntrustedContentProvenance: {
          source: 'gui-local',
          thirdPartyUntrustedContextIds: [],
        },
      }),
    );

    // Both carry only the first-party operator item, so provenance alone cannot
    // distinguish them. The distinction must survive in actionClass.
    expect(result.current.entries[0]!.guiLocal.actionClass).toBe('gui-local-uncomputed');
    expect(result.current.entries[1]!.guiLocal.actionClass).toBe('gui-local-clear');
    expect(result.current.entries[0]!.guiLocal.actionClass).not.toBe(
      result.current.entries[1]!.guiLocal.actionClass,
    );
  });

  it('records every untrusted context id the tracker found', () => {
    const refs = untrustedProvenanceReferences(
      { thirdPartyUntrustedContextIds: ['ctx-7', 'ctx-9'] },
      'terminal',
    );
    expect(refs).toHaveLength(3);
    expect(refs[0]!.trust_class).toBe('first-party');
    expect(refs.slice(1).map((r) => r.id)).toEqual(['ctx-7', 'ctx-9']);
    expect(refs.slice(1).every((r) => r.trust_class === 'third-party-untrusted')).toBe(true);
  });

  it('always carries a first-party item so a write is never provenance-free', () => {
    expect(untrustedProvenanceReferences(undefined, 'terminal')).toHaveLength(1);
    expect(untrustedProvenanceReferences(undefined, 'terminal')[0]!.trust_class).toBe(
      'first-party',
    );
  });

  it('confidence is 1 because the operator decision is directly observed', () => {
    const { result } = renderHook(() => useAuthorizationAudit('conv-1'));
    act(() => result.current.recordApproval(ACTION));
    expect(result.current.entries[0]!.confidence).toBe(1);
  });
});

describe('audit panel in the run surface', () => {
  it('stays hidden until a decision has been made, then shows it', async () => {
    const PENDING = {
      id: 'action-1',
      timestamp: '2026-08-09T00:00:00',
      source: 'agent',
      kind: 'ActionEvent',
      tool_name: 'terminal',
      tool_call_id: 'call-1',
      security_risk: 'HIGH',
      action: {
        kind: 'openhands__tools__terminal__definition__TerminalAction-Output__1',
        command: 'npm test',
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = String(input);
        if (path === '/api/conversations') {
          return json({ id: 'conversation-1', execution_status: 'idle' });
        }
        if (path.endsWith('/run')) return json({});
        if (path.endsWith('/events/count')) return json(1);
        if (path.endsWith('/events/search')) {
          return json({ items: [PENDING], next_page_id: null });
        }
        if (path.endsWith('/events/respond_to_confirmation')) return json({ success: true });
        if (path === '/api/conversations/conversation-1') {
          return json({ id: 'conversation-1', execution_status: 'waiting_for_confirmation' });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    const user = userEvent.setup();
    render(<RunView />);
    expect(screen.queryByLabelText('Authorization history')).toBeNull();

    await user.type(screen.getByLabelText('Goal'), 'Run the tests.');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(await screen.findByTestId('approve'));

    await waitFor(() =>
      expect(screen.getByLabelText('Authorization history')).toBeInTheDocument(),
    );
  });
});
