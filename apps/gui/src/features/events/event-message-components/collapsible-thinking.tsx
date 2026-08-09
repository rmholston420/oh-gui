/**
 * PORTED and adapted from Agent Canvas 1.12.0
 * `components/conversation-events/chat/event-message-components/collapsible-thinking.tsx` (MIT).
 * The caller supplies a verified native reasoning/thought string; this component
 * adds no event data and renders that string as text, not interpreted markdown.
 */
import { useId, useState } from 'react';

export interface CollapsibleThinkingProps {
  readonly content: string;
}

export function CollapsibleThinking({ content }: CollapsibleThinkingProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  if (content.trim().length === 0) return null;

  return (
    <section className="my-1 w-full rounded border border-slate-700 p-2 text-sm" data-testid="collapsible-thinking">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-slate-300"
        aria-controls={contentId}
        aria-expanded={expanded}
        onClick={() => setExpanded((previous) => !previous)}
        data-testid="collapsible-thinking-toggle"
      >
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        Thinking
      </button>
      {expanded && (
        <pre id={contentId} className="mt-2 whitespace-pre-wrap break-words font-sans text-slate-200" data-testid="collapsible-thinking-content">
          {content}
        </pre>
      )}
    </section>
  );
}
