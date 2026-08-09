/**
 * The agent's own account of a pending action: `summary`, `thought`, `reasoning_content`.
 *
 * PORTED from Agent Canvas 1.12.0 — see PORTING_LEDGER.md. Donor:
 * `src/components/conversation-events/chat/event-thought-helpers.ts` (MIT).
 *
 * WHY THIS IS ATTRIBUTED, NOT SUMMARISED
 * --------------------------------------
 * Spec 04 §4.2 substitutes these three fields for the analyzer-identity display that ADR-015
 * removed as unrecoverable. They are the *agent's* account and must be labelled as such — never as
 * an analyzer's justification and never as an unattributed verdict. `summary` in particular is an
 * LLM-authored ~10-word string; it is a claim about the action, not a finding about it.
 *
 * THREE DEVIATIONS FROM THE DONOR, EACH A BUG IN IT
 * ------------------------------------------------
 *  1. `TextContent.type` is **optional** in the generated schema (`type?: 'text'`). The donor
 *     filters on `t.type === 'text'`, which silently drops any block that omits the field and
 *     therefore loses thought text the agent actually produced. We treat absent as text, which is
 *     what the schema default says it is.
 *  2. The donor selects thinking blocks with `b.type === 'thinking'`. `ThinkingBlock.type` is also
 *     optional, so that drops untyped blocks — and it leans on a discriminator to keep redacted
 *     content out. We discriminate **structurally** instead: a block contributes only if it carries
 *     a string `thinking`. `RedactedThinkingBlock` carries `data` and no `thinking`, so its payload
 *     cannot reach the screen through this path even if `type` is missing or wrong.
 *  3. The donor excludes `ThinkAction` with `event.action.kind === 'ThinkAction'`. Every one of the
 *     34 members of the wire `Action` union carries a *mangled* kind
 *     (`openhands__sdk__tool__builtins__think__ThinkAction-Output__1`); only the standalone
 *     `ThinkAction` declaration is bare. That comparison never matches at runtime, so the donor's
 *     exclusion is dead code. We normalise first (ADR-023).
 *
 * `responses_reasoning_item` is deliberately **not** read here. Spec §4.2 names three fields and
 * the SDK gates that one behind its own plaintext-visibility helper; its `encrypted_content` must
 * never be rendered or logged. Exposing it is a separate, specced decision — not a silent extra.
 */

import { normalizeActionKind } from './blast-radius';

/** Structural shape of the pieces we read. Kept local so this module needs no DTO import. */
interface TextBlockLike {
  readonly type?: string;
  readonly text?: unknown;
}

interface ThinkingBlockLike {
  readonly type?: string;
  readonly thinking?: unknown;
  readonly data?: unknown;
}

export interface AgentAccountSource {
  readonly summary?: unknown;
  readonly thought?: unknown;
  readonly reasoning_content?: unknown;
  readonly thinking_blocks?: unknown;
  readonly action?: { readonly kind?: unknown } | null;
}

/** Where the reasoning text came from. The operator is told which, because they differ in kind. */
export type ReasoningOrigin = 'reasoning_content' | 'thinking_blocks' | 'none';

export interface AgentAccount {
  /** LLM-authored ~10-word explainability string, or null when the model gave none. */
  readonly summary: string | null;
  /** Joined `thought` text, or null when empty. */
  readonly thought: string | null;
  readonly reasoning: string | null;
  readonly reasoningOrigin: ReasoningOrigin;
  /**
   * True when thinking blocks were present but every one of them was redacted. Distinct from
   * `reasoning === null` with no blocks at all: "the model thought and we may not see it" is not
   * the same fact as "the model recorded no thinking", and they must not render alike.
   */
  readonly reasoningRedacted: boolean;
  /** True when the agent said nothing at all across all three fields. */
  readonly isEmpty: boolean;
}

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Join `thought` blocks into displayable text.
 *
 * Absent `type` counts as text — see deviation 1. A block with a non-string `text` is skipped
 * rather than coerced, so `undefined` never reaches the screen as the word "undefined".
 */
export function getThoughtText(source: AgentAccountSource): string | null {
  if (!Array.isArray(source.thought)) return null;
  const parts = (source.thought as readonly TextBlockLike[])
    .filter((block) => block !== null && typeof block === 'object')
    .filter((block) => block.type === undefined || block.type === 'text')
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .filter((text) => text.length > 0);
  return parts.length > 0 ? (trimmedOrNull(parts.join('\n')) ?? null) : null;
}

/**
 * Prefer `reasoning_content`; fall back to non-redacted thinking blocks.
 *
 * Selection is structural (deviation 2): a block contributes only if `thinking` is a string, so a
 * `RedactedThinkingBlock`'s `data` can never be rendered as reasoning.
 */
export function getReasoning(source: AgentAccountSource): {
  text: string | null;
  origin: ReasoningOrigin;
  redacted: boolean;
} {
  const direct = trimmedOrNull(source.reasoning_content);
  const blocks = Array.isArray(source.thinking_blocks)
    ? (source.thinking_blocks as readonly ThinkingBlockLike[]).filter(
        (block) => block !== null && typeof block === 'object',
      )
    : [];
  const visible = blocks
    .filter((block) => typeof block.thinking === 'string')
    .map((block) => (block.thinking as string).trim())
    .filter((text) => text.length > 0);
  // Present, but nothing we are permitted or able to show.
  const redacted = blocks.length > 0 && visible.length === 0;

  if (direct !== null) return { text: direct, origin: 'reasoning_content', redacted };
  if (visible.length > 0) return { text: visible.join('\n\n'), origin: 'thinking_blocks', redacted };
  return { text: null, origin: 'none', redacted };
}

/**
 * True when the action *is* the thought, so rendering it as an account of itself would double it.
 *
 * Normalises the mangled wire kind first — see deviation 3.
 */
export function isThoughtTheAction(source: AgentAccountSource): boolean {
  const kind = source.action?.kind;
  return normalizeActionKind(kind) === 'ThinkAction';
}

export function readAgentAccount(source: AgentAccountSource): AgentAccount {
  const summary = trimmedOrNull(source.summary);
  const thought = isThoughtTheAction(source) ? null : getThoughtText(source);
  const { text, origin, redacted } = getReasoning(source);
  return {
    summary,
    thought,
    reasoning: text,
    reasoningOrigin: origin,
    reasoningRedacted: redacted,
    isEmpty: summary === null && thought === null && text === null && !redacted,
  };
}
