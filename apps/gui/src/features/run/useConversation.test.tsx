// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AgentServerClient } from '../../api/agentServer';
import { useConversation } from './useConversation';

function apiWith(overrides: Partial<AgentServerClient> = {}): AgentServerClient {
  return {
    createConversation: vi.fn().mockResolvedValue({ id: 'conversation-1', execution_status: 'idle' }),
    run: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    respondToConfirmation: vi.fn().mockResolvedValue(undefined),
    setConfirmationPolicy: vi.fn().mockResolvedValue(undefined),
    getConversation: vi.fn().mockResolvedValue({ id: 'conversation-1', execution_status: 'running' }),
    getEventCount: vi.fn().mockResolvedValue(2),
    searchEvents: vi.fn().mockResolvedValue({
      items: [{ id: 'event-1', timestamp: '2026-08-09T00:00:00', source: 'agent' }],
      next_page_id: null,
    }),
    readWorkspaceFile: vi.fn().mockResolvedValue('file contents'),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useConversation', () => {
  it('polls durable event objects after starting a conversation', async () => {
    const api = apiWith();
    const { result, unmount } = renderHook(() => useConversation({ api, pollIntervalMs: 60_000 }));

    await act(async () => {
      await result.current.start('Inspect the workspace.');
    });

    await waitFor(() => {
      expect(result.current.eventCount).toBe(2);
      expect(result.current.events).toHaveLength(1);
      expect(result.current.status).toBe('running');
    });

    expect(api.createConversation).toHaveBeenCalledOnce();
    expect(api.run).toHaveBeenCalledWith('conversation-1');
    expect(api.getEventCount).toHaveBeenCalledWith('conversation-1');
    expect(api.searchEvents).toHaveBeenCalledWith('conversation-1');
    unmount();
  });

  it('exposes pending native actions and sends approve and reject confirmation responses', async () => {
    const api = apiWith({
      getConversation: vi
        .fn()
        .mockResolvedValue({ id: 'conversation-1', execution_status: 'waiting_for_confirmation' }),
      searchEvents: vi.fn().mockResolvedValue({
        items: [
          {
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
          },
        ],
        next_page_id: null,
      }),
    });
    const { result } = renderHook(() => useConversation({ api, pollIntervalMs: 60_000 }));

    await act(async () => {
      await result.current.start('Run the tests.', 'ask-always');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('waiting_for_confirmation');
      expect(result.current.pendingActions).toHaveLength(1);
    });
    expect(result.current.pendingActions[0]).toMatchObject({
      toolName: 'terminal',
      securityRisk: 'HIGH',
      command: expect.stringContaining('npm test'),
    });
    expect(api.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ confirmation_policy: { kind: 'AlwaysConfirm' } }),
    );

    await act(async () => {
      await result.current.approve();
    });
    expect(api.respondToConfirmation).toHaveBeenCalledWith('conversation-1', {
      accept: true,
      reason: 'User rejected the action.',
    });

    await act(async () => {
      await result.current.reject('The test command needs review.');
    });
    expect(api.respondToConfirmation).toHaveBeenLastCalledWith('conversation-1', {
      accept: false,
      reason: 'The test command needs review.',
    });
  });

  it('updates the native policy when the trust dial changes during a run', async () => {
    const api = apiWith();
    const { result } = renderHook(() => useConversation({ api, pollIntervalMs: 60_000 }));

    await act(async () => {
      await result.current.start('Inspect the workspace.');
    });
    await waitFor(() => {
      expect(result.current.conversationId).toBe('conversation-1');
    });
    await act(async () => {
      await result.current.setTrustStop('never');
    });

    expect(api.setConfirmationPolicy).toHaveBeenCalledWith('conversation-1', {
      kind: 'NeverConfirm',
    });
  });

  it('surfaces a non-200-equivalent client failure to the run surface', async () => {
    const api = apiWith({
      createConversation: vi.fn().mockRejectedValue(new Error('POST /conversations failed (500): failed')),
    });
    const { result } = renderHook(() => useConversation({ api, pollIntervalMs: 60_000 }));

    await act(async () => {
      await result.current.start('Inspect the workspace.');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('POST /conversations failed (500): failed');
    });
  });
});
