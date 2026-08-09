/**
 * PORTED and adapted from Agent Canvas 1.12.0
 * `components/conversation-events/chat/event-message-components/finish-event-message.tsx` (MIT).
 * Native basis: ActionEvent.action (action.py:40-43); FinishAction.message
 * (sdk/tool/builtins/finish.py:21-22).
 */
import { getActionContent } from '../event-content-helpers/get-action-content';
import { actionRecord, isActionEvent, normalizeWireKind } from '../event-types';

export interface FinishEventMessageProps {
  readonly event: unknown;
}

export function FinishEventMessage({ event }: FinishEventMessageProps) {
  if (!isActionEvent(event)) return null;
  const action = actionRecord(event);
  if (action === null || normalizeWireKind(action.kind) !== 'FinishAction') return null;

  const message = getActionContent(event);
  if (message === null) return null;

  return (
    <section className="rounded border border-slate-700 bg-night-900 p-3" data-testid="finish-event-message">
      <h3 className="text-sm font-semibold text-slate-200">Agent finished</h3>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm text-slate-100">{message}</pre>
    </section>
  );
}
