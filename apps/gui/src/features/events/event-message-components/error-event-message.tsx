/**
 * PORTED and adapted from Agent Canvas 1.12.0
 * `components/conversation-events/chat/event-message-components/error-event-message.tsx` (MIT).
 * Native basis: AgentErrorEvent.error, observation.py:138-150.
 */
import { isAgentErrorEvent, stringField } from '../event-types';

export interface ErrorEventMessageProps {
  readonly event: unknown;
}

export function ErrorEventMessage({ event }: ErrorEventMessageProps) {
  if (!isAgentErrorEvent(event)) return null;
  const error = stringField(event, 'error');
  if (error === null) return null;

  return (
    <section className="rounded border border-rose-700 bg-rose-950/40 p-3 text-rose-100" role="alert" data-testid="agent-error-event">
      <h3 className="font-semibold">Agent error</h3>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm">{error}</pre>
    </section>
  );
}
