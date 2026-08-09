import { groupEvents, type RenderedEvent } from '../events/chat/group-events';
import { getActionContent } from '../events/event-content-helpers/get-action-content';
import { getActionEventTitleDescriptor } from '../events/event-content-helpers/get-action-event-title';
import { getObservationContent } from '../events/event-content-helpers/get-observation-content';
import { shouldRenderEvent } from '../events/event-content-helpers/should-render-event';
import { CollapsibleThinking } from '../events/event-message-components/collapsible-thinking';
import { ErrorEventMessage } from '../events/event-message-components/error-event-message';
import { FinishEventMessage } from '../events/event-message-components/finish-event-message';
import { asRecord, isEventKind, type WireRecord } from '../events/event-types';

/**
 * Renders the append-only event store using the Agent Canvas port
 * (`src/features/events/`, PORTING_LEDGER 2026-08-09) rather than raw JSON.
 *
 * Two rules from spec 13 are load-bearing here and are the reason this is not a `.map()` over
 * `JSON.stringify`:
 *
 *   - An unhandled native event kind renders **as unhandled**, never folded into a neighbouring
 *     kind. `getActionEventTitleDescriptor` returns a tagged `unhandled` descriptor for exactly
 *     this, and it is surfaced visibly instead of being dropped.
 *   - A missing native signal renders as nothing at all. No placeholder, no "success", no
 *     manufactured default — the donor fabricated a `success` fallback and that was not ported.
 */

function KindTag({ text, unhandled }: { readonly text: string; readonly unhandled: boolean }) {
  return (
    <span
      data-testid={unhandled ? 'event-unhandled' : 'event-kind'}
      className={
        unhandled
          ? 'rounded border border-amber-500/60 bg-amber-950/40 px-1.5 py-0.5 font-mono text-[11px] text-amber-200'
          : 'rounded border border-slate-600 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[11px] text-slate-300'
      }
    >
      {unhandled ? `unhandled: ${text}` : text}
    </span>
  );
}

function Pre({ children, tone = 'plain' }: { readonly children: string; readonly tone?: 'plain' | 'result' }) {
  return (
    <pre
      className={
        tone === 'result'
          ? 'mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded border border-slate-700 bg-black/40 p-2 font-mono text-xs tabular-nums text-slate-200'
          : 'mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs tabular-nums text-slate-100'
      }
    >
      {children}
    </pre>
  );
}

function thinkingText(event: WireRecord): string | null {
  const reasoning = event.reasoning_content;
  return typeof reasoning === 'string' && reasoning.trim() !== '' ? reasoning : null;
}

function ActionBlock({ event }: { readonly event: WireRecord }) {
  const descriptor = getActionEventTitleDescriptor(event);
  const content = getActionContent(event);
  const thinking = thinkingText(event);

  return (
    <div>
      {descriptor !== null && (
        <KindTag text={descriptor.text} unhandled={descriptor.kind === 'unhandled'} />
      )}
      {content !== null && <Pre>{content}</Pre>}
      {thinking !== null && <CollapsibleThinking content={thinking} />}
    </div>
  );
}

function ObservationBlock({ event }: { readonly event: WireRecord }) {
  const content = getObservationContent(event);
  if (content === null) return null;
  return <Pre tone="result">{content}</Pre>;
}

function SingleEvent({ event }: { readonly event: WireRecord }) {
  if (isEventKind(event, 'AgentErrorEvent') || isEventKind(event, 'ConversationErrorEvent')) {
    return <ErrorEventMessage event={event} />;
  }
  if (isEventKind(event, 'FinishAction')) {
    return <FinishEventMessage event={event} />;
  }
  return <ActionBlock event={event} />;
}

function RenderedRow({ rendered }: { readonly rendered: RenderedEvent }) {
  if (rendered.kind === 'action-observation') {
    return (
      <li className="border-b border-slate-800 p-3 last:border-b-0" data-testid="event-row">
        <ActionBlock event={rendered.action} />
        <ObservationBlock event={rendered.observation} />
      </li>
    );
  }
  return (
    <li className="border-b border-slate-800 p-3 last:border-b-0" data-testid="event-row">
      <SingleEvent event={rendered.event} />
    </li>
  );
}

export default function EventLog({ events }: { readonly events: readonly unknown[] }) {
  const records = events
    .map((event) => asRecord(event))
    .filter((event): event is WireRecord => event !== null && shouldRenderEvent(event));

  if (records.length === 0) {
    return <p className="p-4 text-sm text-slate-400">No events have been returned yet.</p>;
  }

  const grouped = groupEvents(records);

  return (
    <ul className="divide-y divide-slate-800" data-testid="event-log">
      {grouped.map((rendered) => (
        <RenderedRow
          key={rendered.kind === 'action-observation' ? `a${rendered.actionIndex}` : `s${rendered.index}`}
          rendered={rendered}
        />
      ))}
    </ul>
  );
}
