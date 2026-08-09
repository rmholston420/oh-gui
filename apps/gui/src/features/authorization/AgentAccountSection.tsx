/**
 * The agent's own account of a pending action (spec 04 §4.2).
 *
 * ADR-015 governs the framing. These three fields replaced the analyzer-identity display that
 * ADR-015 removed as unrecoverable, and the substitution only holds if the operator can tell the
 * difference between the two. So every heading here names the agent as the speaker. Nothing in this
 * component may read as a finding, an assessment, or a verdict — `summary` is a sentence the model
 * wrote about its own action, and a model that wants to run `rm -rf /` will happily summarise it as
 * "tidying up temporary files".
 *
 * The word "unverified" lives in the *heading*, not only in the paragraph beneath it. A disclaimer
 * one line down is a disclaimer that scrolls away and gets skimmed; the heading is what stays on
 * screen next to the text it qualifies. A test asserts it, so it cannot quietly migrate.
 *
 * That is also why this sits *below* the blast radius on the card: the derived account comes first,
 * the self-report second. A test asserts the order, because reversing it would quietly make the
 * agent's own words the operator's first impression of what is about to happen.
 */

import type { AgentAccount } from './agent-account';

const ORIGIN_NOTE: Record<AgentAccount['reasoningOrigin'], string> = {
  reasoning_content: 'reasoning_content',
  thinking_blocks: 'thinking_blocks',
  none: '',
};

function Block({
  testid,
  heading,
  body,
  mono = false,
}: {
  testid: string;
  heading: string;
  body: string;
  mono?: boolean;
}) {
  return (
    <div className="mt-3" data-testid={testid}>
      <h4 className="text-xs font-semibold text-slate-400">{heading}</h4>
      <p
        className={`mt-1 whitespace-pre-wrap break-words text-sm text-slate-200 ${
          mono ? 'font-mono text-xs' : ''
        }`}
      >
        {body}
      </p>
    </div>
  );
}

export function AgentAccountSection({ account }: { account: AgentAccount }) {
  // Nothing said, nothing withheld: render nothing rather than an empty labelled box, which would
  // imply the agent was asked and declined.
  if (account.isEmpty) return null;

  return (
    <section
      data-testid="agent-account"
      data-empty={account.isEmpty ? 'true' : 'false'}
      className="mt-4 rounded-md border border-slate-700 bg-slate-900/40 p-3"
    >
      <h3 data-testid="agent-account-heading" className="text-sm font-semibold text-slate-300">
        What the agent says about this &mdash; unverified
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        The agent&rsquo;s own words, reported unchanged. Not an analysis, and not checked against
        what the action will actually do.
      </p>

      {account.summary !== null && (
        <Block
          testid="agent-summary"
          heading="Its one-line description (summary)"
          body={account.summary}
        />
      )}

      {account.thought !== null && (
        <Block testid="agent-thought" heading="Its stated reason (thought)" body={account.thought} />
      )}

      {account.reasoning !== null && (
        <Block
          testid="agent-reasoning"
          heading={`Its intermediate reasoning (${ORIGIN_NOTE[account.reasoningOrigin]})`}
          body={account.reasoning}
          mono
        />
      )}

      {/*
        Present but unreadable is its own state. Saying so is the honest option: silence here would
        read as "the model recorded no thinking", which is a different and false claim.
      */}
      {account.reasoningRedacted && (
        <p data-testid="agent-reasoning-redacted" className="mt-3 text-xs text-amber-400">
          The model recorded thinking for this action, but it arrived redacted and cannot be
          displayed.
        </p>
      )}
    </section>
  );
}
