import { describe, expect, it } from 'vitest';
import {
  getReasoning,
  getThoughtText,
  isThoughtTheAction,
  readAgentAccount,
  type AgentAccountSource,
} from './agent-account';

const src = (over: Partial<AgentAccountSource> = {}): AgentAccountSource => ({
  action: { kind: 'openhands__tools__terminal__definition__TerminalAction-Output__1' },
  ...over,
});

describe('thought text', () => {
  it('joins text blocks', () => {
    expect(getThoughtText(src({ thought: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }))).toBe('a\nb');
  });

  // Deviation 1 from the donor. `TextContent.type` is optional in the schema, so filtering on
  // `=== 'text'` drops real thought text. This test is the reason the port differs.
  it('keeps blocks that omit the optional type discriminator', () => {
    expect(getThoughtText(src({ thought: [{ text: 'untyped but real' }] }))).toBe('untyped but real');
  });

  it('skips blocks of some other declared type', () => {
    expect(getThoughtText(src({ thought: [{ type: 'image', text: 'nope' }, { type: 'text', text: 'yes' }] }))).toBe('yes');
  });

  it('never coerces a non-string text into the word undefined', () => {
    const out = getThoughtText(src({ thought: [{ type: 'text' }, { type: 'text', text: 42 }] }));
    expect(out).toBeNull();
  });

  it('treats whitespace-only thought as absent', () => {
    expect(getThoughtText(src({ thought: [{ type: 'text', text: '   \n ' }] }))).toBeNull();
  });

  it('returns null when thought is not an array', () => {
    expect(getThoughtText(src({ thought: 'a bare string' }))).toBeNull();
  });
});

describe('reasoning', () => {
  it('prefers reasoning_content and names its origin', () => {
    const r = getReasoning(src({ reasoning_content: 'because', thinking_blocks: [{ type: 'thinking', thinking: 'other' }] }));
    expect(r).toMatchObject({ text: 'because', origin: 'reasoning_content' });
  });

  it('falls back to thinking blocks', () => {
    const r = getReasoning(src({ thinking_blocks: [{ type: 'thinking', thinking: 'step one' }, { type: 'thinking', thinking: 'step two' }] }));
    expect(r).toMatchObject({ text: 'step one\n\nstep two', origin: 'thinking_blocks' });
  });

  // Deviation 2, and the one with a safety consequence: `RedactedThinkingBlock.data` must never be
  // rendered. Structural selection means it cannot leak even when `type` is missing or wrong.
  it('never surfaces redacted payloads, even mislabelled ones', () => {
    for (const block of [
      { type: 'redacted_thinking', data: 'SECRET' },
      { data: 'SECRET' },
      { type: 'thinking', data: 'SECRET' },
    ]) {
      const r = getReasoning(src({ thinking_blocks: [block] }));
      expect(r.text ?? '').not.toContain('SECRET');
    }
  });

  it('keeps a thinking block that omits the optional type', () => {
    expect(getReasoning(src({ thinking_blocks: [{ thinking: 'untyped' }] }))).toMatchObject({
      text: 'untyped',
      origin: 'thinking_blocks',
    });
  });

  it('reports redaction as its own state, distinct from nothing recorded', () => {
    const redacted = getReasoning(src({ thinking_blocks: [{ type: 'redacted_thinking', data: 'x' }] }));
    expect(redacted).toMatchObject({ text: null, origin: 'none', redacted: true });

    const nothing = getReasoning(src({}));
    expect(nothing).toMatchObject({ text: null, origin: 'none', redacted: false });
  });

  it('does not claim redaction when visible thinking is also present', () => {
    const r = getReasoning(
      src({ thinking_blocks: [{ type: 'redacted_thinking', data: 'x' }, { type: 'thinking', thinking: 'visible' }] }),
    );
    expect(r).toMatchObject({ text: 'visible', redacted: false });
  });

  it('ignores responses_reasoning_item entirely, including its encrypted content', () => {
    const r = getReasoning(
      src({ responses_reasoning_item: { summary: ['s'], content: ['c'], encrypted_content: 'SECRET' } } as AgentAccountSource),
    );
    expect(r).toMatchObject({ text: null, origin: 'none' });
  });
});

describe('ThinkAction exclusion', () => {
  // Deviation 3. The donor compares against the bare name, which never matches the mangled wire
  // value, making its exclusion dead code. Normalising is what makes this fire.
  it('matches the mangled wire kind, not just the bare name', () => {
    expect(isThoughtTheAction(src({ action: { kind: 'openhands__sdk__tool__builtins__think__ThinkAction-Output__1' } }))).toBe(true);
    expect(isThoughtTheAction(src({ action: { kind: 'ThinkAction' } }))).toBe(true);
  });

  it('does not match other actions', () => {
    expect(isThoughtTheAction(src())).toBe(false);
    expect(isThoughtTheAction(src({ action: null }))).toBe(false);
  });

  it('suppresses the thought when the action IS the thought', () => {
    const account = readAgentAccount(
      src({
        action: { kind: 'openhands__sdk__tool__builtins__think__ThinkAction-Output__1' },
        thought: [{ type: 'text', text: 'do not double me' }],
      }),
    );
    expect(account.thought).toBeNull();
  });
});

describe('readAgentAccount', () => {
  it('reports empty when the agent said nothing', () => {
    expect(readAgentAccount(src()).isEmpty).toBe(true);
  });

  it('is not empty when the only signal is redacted thinking', () => {
    const account = readAgentAccount(src({ thinking_blocks: [{ type: 'redacted_thinking', data: 'x' }] }));
    expect(account.isEmpty).toBe(false);
    expect(account.reasoningRedacted).toBe(true);
  });

  it('carries all three fields when present', () => {
    const account = readAgentAccount(
      src({ summary: 'editing the hosts file', thought: [{ type: 'text', text: 'need to add an entry' }], reasoning_content: 'chain' }),
    );
    expect(account).toMatchObject({
      summary: 'editing the hosts file',
      thought: 'need to add an entry',
      reasoning: 'chain',
      reasoningOrigin: 'reasoning_content',
      isEmpty: false,
    });
  });

  it('treats an empty-string summary as absent rather than as a blank claim', () => {
    expect(readAgentAccount(src({ summary: '  ' })).summary).toBeNull();
  });
});
