/**
 * PORTED and adapted from Agent Canvas 1.12.0
 * `components/conversation-events/chat/group-events.ts` (MIT).
 *
 * Canvas groups a UI-normalized stream in which an observation has already
 * replaced its action. OH-GUI receives the durable append-only event log, so
 * this adapter instead pairs an ObservationEvent or UserRejectObservation with
 * exactly the ActionEvent named by its native action_id. It never pairs by
 * adjacency, and unresolved events stay independent rather than being folded
 * into a neighbouring action.
 *
 * Native basis: Event.id (event/base.py:24-31); ObservationEvent.action_id
 * (observation.py:32-38); UserRejectObservation.action_id (observation.py:86-107).
 */
import {
  isActionEvent,
  isObservationEvent,
  isUserRejectObservation,
  stringField,
  type WireRecord,
} from '../event-types';

export type RenderedEvent =
  | { readonly kind: 'single'; readonly event: WireRecord; readonly index: number }
  | {
      readonly kind: 'action-observation';
      readonly action: WireRecord;
      readonly observation: WireRecord;
      readonly actionIndex: number;
      readonly observationIndex: number;
    };

interface ObservationMatch {
  readonly observation: WireRecord;
  readonly index: number;
}

function isActionObservation(event: WireRecord): boolean {
  return isObservationEvent(event) || isUserRejectObservation(event);
}

/**
 * Pair only a single matching observation with an action. Duplicate or orphaned
 * observations remain `single`: they are native events with distinct history,
 * not evidence that an adjacent action completed.
 */
export function groupEvents(events: readonly WireRecord[]): RenderedEvent[] {
  const uniqueObservationsByActionId = new Map<string, ObservationMatch | null>();

  events.forEach((event, index) => {
    if (!isActionObservation(event)) return;
    const actionId = stringField(event, 'action_id');
    if (actionId === null) return;
    if (uniqueObservationsByActionId.has(actionId)) {
      uniqueObservationsByActionId.set(actionId, null);
      return;
    }
    uniqueObservationsByActionId.set(actionId, { observation: event, index });
  });

  const pairedObservationIndexes = new Set<number>();
  const rendered: RenderedEvent[] = [];

  events.forEach((event, index) => {
    if (pairedObservationIndexes.has(index)) return;
    if (!isActionEvent(event)) {
      rendered.push({ kind: 'single', event, index });
      return;
    }

    const actionId = stringField(event, 'id');
    const match = actionId === null ? undefined : uniqueObservationsByActionId.get(actionId);
    if (match !== undefined && match !== null && match.index > index) {
      pairedObservationIndexes.add(match.index);
      rendered.push({
        kind: 'action-observation',
        action: event,
        observation: match.observation,
        actionIndex: index,
        observationIndex: match.index,
      });
      return;
    }
    rendered.push({ kind: 'single', event, index });
  });

  return rendered;
}
