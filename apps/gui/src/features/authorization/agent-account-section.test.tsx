// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readAgentAccount, type AgentAccountSource } from './agent-account';
import { AgentAccountSection } from './AgentAccountSection';
import AuthorizationCard, { type PendingAction } from './AuthorizationCard';

const account = (over: Partial<AgentAccountSource>) =>
  readAgentAccount({ action: { kind: 'openhands__tools__terminal__definition__TerminalAction-Output__1' }, ...over });

describe('AgentAccountSection', () => {
  it('renders nothing at all when the agent said nothing', () => {
    const { container } = render(<AgentAccountSection account={account({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('attributes every field to the agent, never as an assessment', () => {
    render(
      <AgentAccountSection
        account={account({ summary: 'tidying temporary files', thought: [{ type: 'text', text: 'cleanup' }] })}
      />,
    );
    const heading = screen.getByTestId('agent-account-heading');
    expect(heading).toHaveTextContent(/what the agent says/i);
    // The framing must not present the self-report as analysis. ADR-015: `summary` is a claim.
    const section = screen.getByTestId('agent-account');
    expect(section.textContent).toMatch(/own words/i);
    expect(section.textContent).toMatch(/not an analysis/i);
    expect(section.textContent).not.toMatch(/\b(assessment|verdict|analysis of|we determined|safe)\b/i);
  });

  it('names the native field each value came from', () => {
    render(
      <AgentAccountSection
        account={account({ summary: 's', thought: [{ type: 'text', text: 't' }], reasoning_content: 'r' })}
      />,
    );
    expect(screen.getByTestId('agent-summary')).toHaveTextContent('summary');
    expect(screen.getByTestId('agent-thought')).toHaveTextContent('thought');
    expect(screen.getByTestId('agent-reasoning')).toHaveTextContent('reasoning_content');
  });

  it('distinguishes thinking_blocks as the reasoning origin', () => {
    render(<AgentAccountSection account={account({ thinking_blocks: [{ type: 'thinking', thinking: 'r' }] })} />);
    expect(screen.getByTestId('agent-reasoning')).toHaveTextContent('thinking_blocks');
  });

  it('says so when thinking was recorded but redacted', () => {
    render(<AgentAccountSection account={account({ thinking_blocks: [{ type: 'redacted_thinking', data: 'SECRET' }] })} />);
    const notice = screen.getByTestId('agent-reasoning-redacted');
    expect(notice).toHaveTextContent(/redacted/i);
    expect(document.body.textContent).not.toContain('SECRET');
    expect(screen.queryByTestId('agent-reasoning')).toBeNull();
  });

  it('omits the redaction notice when nothing was recorded', () => {
    render(<AgentAccountSection account={account({ summary: 's' })} />);
    expect(screen.queryByTestId('agent-reasoning-redacted')).toBeNull();
  });

  it('omits each block independently', () => {
    render(<AgentAccountSection account={account({ thought: [{ type: 'text', text: 'only this' }] })} />);
    expect(screen.queryByTestId('agent-summary')).toBeNull();
    expect(screen.getByTestId('agent-thought')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-reasoning')).toBeNull();
  });
});

describe('placement on the card', () => {
  const pending = (over: Partial<PendingAction['event']> = {}): PendingAction => ({
    command: 'edit /etc/hosts',
    toolName: 'str_replace_editor',
    securityRisk: 'MEDIUM',
    event: {
      action: { kind: 'openhands__tools__file_editor__definition__FileEditorAction-Output__1', path: '/etc/hosts', command: 'str_replace' },
      tool_name: 'str_replace_editor',
      summary: 'editing the hosts file',
      thought: [{ type: 'text', text: 'need an entry' }],
      ...over,
    },
  });

  /**
   * The claim made in AgentAccountSection's own header comment. Derived reading first, self-report
   * second — reversing it would make the agent's own words the operator's first impression of what
   * is about to happen, which is precisely the inversion ADR-015's attribution rules exist to stop.
   */
  it('places the blast radius before the agent account in document order', () => {
    render(<AuthorizationCard action={pending()} onApprove={() => {}} onReject={() => {}} />);
    const radius = screen.getByTestId('blast-radius');
    const acct = screen.getByTestId('agent-account');
    expect(radius.compareDocumentPosition(acct) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders no account section when the card is given no event', () => {
    const withEvent = pending();
    const withoutEvent: PendingAction = { ...withEvent, event: undefined };
    render(<AuthorizationCard action={withoutEvent} onApprove={() => {}} onReject={() => {}} />);
    expect(screen.queryByTestId('agent-account')).toBeNull();
  });

  it('renders the radius but no account when the event carries no self-report', () => {
    render(
      <AuthorizationCard
        action={pending({ summary: undefined, thought: [] })}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.getByTestId('blast-radius')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-account')).toBeNull();
  });
});
