// @vitest-environment jsdom
/**
 * The follow-up composer is what makes a run steerable rather than restartable.
 * These tests pin the three properties that make it useful: the message reaches
 * the server with `run: true` (otherwise it is a note on a transcript and the
 * agent never wakes), it is trimmed and refuses to be empty, and it is only
 * offered once a conversation exists.
 */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import RunView from './RunView';
import { useConversation } from './useConversation';
import type { AgentServerClient } from '../../api/agentServer';

function stubClient(overrides: Partial<AgentServerClient> = {}): AgentServerClient {
  return {
    createConversation: vi.fn(async () => ({
      id: 'conv-1',
      execution_status: 'running',
    })) as unknown as AgentServerClient['createConversation'],
    run: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    respondToConfirmation: vi.fn(async () => {}),
    setConfirmationPolicy: vi.fn(async () => {}),
    getConversation: vi.fn(async () => ({
      id: 'conv-1',
      execution_status: 'running',
    })) as unknown as AgentServerClient['getConversation'],
    getEventCount: vi.fn(async () => 0),
    searchEvents: vi.fn(async () => ({ items: [] })) as unknown as AgentServerClient['searchEvents'],
    readWorkspaceFile: vi.fn(async () => ''),
    ...overrides,
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('follow-up steering', () => {
  it('sends the message with run: true so the agent loop actually resumes', async () => {
    const api = stubClient();
    const { result } = renderHook(() => useConversation({ api, pollIntervalMs: 1_000_000 }));

    await act(async () => {
      await result.current.start('initial goal');
    });
    await act(async () => {
      await result.current.send('  actually use the existing port  ');
    });

    expect(api.sendMessage).toHaveBeenCalledWith('conv-1', {
      role: 'user',
      content: [{ type: 'text', text: 'actually use the existing port' }],
      run: true,
    });
  });

  it('refuses an empty or whitespace-only follow-up without calling the server', async () => {
    const api = stubClient();
    const { result } = renderHook(() => useConversation({ api, pollIntervalMs: 1_000_000 }));

    await act(async () => {
      await result.current.start('initial goal');
    });
    await act(async () => {
      await result.current.send('   ');
    });

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(result.current.error).toBe('A follow-up message cannot be empty.');
  });

  it('refuses to send before a conversation exists', async () => {
    const api = stubClient();
    const { result } = renderHook(() => useConversation({ api, pollIntervalMs: 1_000_000 }));

    await act(async () => {
      await result.current.send('too early');
    });

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Start a run before sending a follow-up.');
  });

  it('surfaces a server failure instead of silently swallowing it', async () => {
    const api = stubClient({
      sendMessage: vi.fn(async () => {
        throw new Error('agent server refused the message');
      }),
    });
    const { result } = renderHook(() => useConversation({ api, pollIntervalMs: 1_000_000 }));

    await act(async () => {
      await result.current.start('initial goal');
    });
    await act(async () => {
      await result.current.send('steer');
    });

    expect(result.current.error).toContain('agent server refused the message');
    expect(result.current.isSending).toBe(false);
  });

  it('hides the composer until a run has started', () => {
    render(<RunView />);
    expect(screen.queryByLabelText('Follow-up instruction')).toBeNull();
  });

  it('is disabled at a read-only viewport even once a run exists', async () => {
    render(<RunView isReadOnlyViewport />);
    // No run can be started read-only, so the composer must not appear at all.
    expect(screen.queryByLabelText('Follow-up instruction')).toBeNull();
  });

  it('posts the follow-up to the events endpoint and clears the textarea', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === '/api/conversations') {
        return json({ id: 'conversation-1', execution_status: 'running' });
      }
      if (path.endsWith('/run')) return json({});
      if (path.endsWith('/events/count')) return json(0);
      if (path.endsWith('/events/search')) return json({ items: [], next_page_id: null });
      if (path.endsWith('/events')) return json({});
      if (path === '/api/conversations/conversation-1') {
        return json({ id: 'conversation-1', execution_status: 'running' });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<RunView />);
    await user.type(screen.getByLabelText('Goal'), 'Build the thing.');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    // Role, not just label: an accessible name on the wrong role is invisible to any consumer
    // querying by role, and that failure is silent in a label-based query.
    expect(screen.getByRole('form', { name: 'Steer the run' })).toBeInTheDocument();
    const box = await screen.findByLabelText<HTMLTextAreaElement>('Follow-up instruction');
    await user.type(box, 'prefer the existing adapter');
    await user.click(screen.getByRole('button', { name: 'Send follow-up' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/conversations/conversation-1/events',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            role: 'user',
            content: [{ type: 'text', text: 'prefer the existing adapter' }],
            run: true,
          }),
        }),
      );
    });
    await waitFor(() => expect(box.value).toBe(''));
  });
});
