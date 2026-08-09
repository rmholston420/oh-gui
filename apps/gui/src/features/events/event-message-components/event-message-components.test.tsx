// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CollapsibleThinking } from './collapsible-thinking';
import { ErrorEventMessage } from './error-event-message';
import { FinishEventMessage } from './finish-event-message';

const FINISH_ACTION_KIND = 'openhands__sdk__tool__builtins__finish__FinishAction-Output__1';

describe('ErrorEventMessage', () => {
  // Mutation M6: replace `error` with a fixed fallback. This exact text assertion fails, preventing
  // the UI from manufacturing an error message that the native AgentErrorEvent did not carry.
  it('renders the exact native AgentErrorEvent.error text', () => {
    render(
      <ErrorEventMessage
        event={{
          kind: 'AgentErrorEvent',
          source: 'agent',
          tool_name: 'terminal',
          tool_call_id: 'call-1',
          error: 'Permission denied: /var/lib/data',
        }}
      />,
    );
    expect(screen.getByTestId('agent-error-event')).toHaveTextContent('Permission denied: /var/lib/data');
  });

  it('renders null when the native error field is absent or the event kind differs', () => {
    expect(render(<ErrorEventMessage event={{ kind: 'AgentErrorEvent' }} />).container).toBeEmptyDOMElement();
    expect(render(<ErrorEventMessage event={{ kind: 'ConversationErrorEvent', error: 'nope' }} />).container).toBeEmptyDOMElement();
  });
});

describe('FinishEventMessage', () => {
  // Mutation M7: compare action.kind to bare FinishAction. The real mangled wire action below then
  // renders nothing, so this assertion fails.
  it('renders a mangled FinishAction message verbatim', () => {
    render(
      <FinishEventMessage
        event={{
          kind: 'ActionEvent',
          id: 'finish-1',
          tool_name: 'finish',
          tool_call_id: 'call-1',
          action: { kind: FINISH_ACTION_KIND, message: 'All requested checks are complete.' },
        }}
      />,
    );
    expect(screen.getByTestId('finish-event-message')).toHaveTextContent('All requested checks are complete.');
  });

  it('does not turn a missing native finish message into copy', () => {
    expect(
      render(
        <FinishEventMessage
          event={{ kind: 'ActionEvent', tool_name: 'finish', tool_call_id: 'call-1', action: { kind: FINISH_ACTION_KIND } }}
        />,
      ).container,
    ).toBeEmptyDOMElement();
  });
});

describe('CollapsibleThinking', () => {
  // Mutation M8: invert the whitespace guard. This component would display an empty thinking card
  // and fail this null-render assertion.
  it('renders nothing for an empty native thinking string', () => {
    expect(render(<CollapsibleThinking content={' \n '} />).container).toBeEmptyDOMElement();
  });

  it('starts collapsed and reveals the supplied text only when the operator expands it', async () => {
    const user = userEvent.setup();
    render(<CollapsibleThinking content={'check the native output\nthen report it'} />);
    const toggle = screen.getByTestId('collapsible-thinking-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('collapsible-thinking-content')).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('collapsible-thinking-content')).toHaveTextContent('check the native output');
  });
});
