// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RunView from './RunView';

const PENDING_ACTION_EVENT = {
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

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true });
});

describe('RunView authorization', () => {
  it('renders a pending native action and approves it through the confirmation endpoint', async () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1280,
      writable: true,
      configurable: true,
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === '/api/conversations') {
        return json({ id: 'conversation-1', execution_status: 'idle' });
      }
      if (path.endsWith('/run')) return json({});
      if (path.endsWith('/events/count')) return json(1);
      if (path.endsWith('/events/search')) {
        return json({ items: [PENDING_ACTION_EVENT], next_page_id: null });
      }
      if (path.endsWith('/events/respond_to_confirmation')) return json({ success: true });
      if (path === '/api/conversations/conversation-1') {
        return json({ id: 'conversation-1', execution_status: 'waiting_for_confirmation' });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<RunView />);
    await user.type(screen.getByLabelText('Goal'), 'Run the test suite.');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByTestId('authorization-card')).toBeInTheDocument();
    expect(screen.getByTestId('pending-command')).toHaveTextContent('npm test');

    await user.click(screen.getByTestId('approve'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/conversations/conversation-1/events/respond_to_confirmation',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ accept: true, reason: 'User rejected the action.' }),
        }),
      );
    });
  });
});
