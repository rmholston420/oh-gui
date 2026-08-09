/**
 * Narrow, read-only projections of the native event wire objects used by this
 * presentation-only feature. These are not transport DTOs: the middleware owns
 * transport, while this feature only checks native fields before rendering.
 *
 * Native basis:
 * - Event.id: event/base.py:24-32
 * - ActionEvent.action/tool_name/summary: action.py:40-46,77-88
 * - ObservationEvent.observation/action_id: observation.py:32-45
 * - AgentErrorEvent.error: observation.py:138-150
 * - UserRejectObservation rejection fields/action_id: observation.py:86-107
 */
import { normalizeActionKind } from '../authorization/blast-radius';

export type WireRecord = Readonly<Record<string, unknown>>;

export function asRecord(value: unknown): WireRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as WireRecord)
    : null;
}

/**
 * All Pydantic union discriminators may be serialised as
 * `module__path__ClassName-Output__N`. Reuse the ADR-023 normaliser before any
 * action/observation-class comparison; a bare comparison would be dead code.
 */
export function normalizeWireKind(value: unknown): string | null {
  return normalizeActionKind(value);
}

export function eventKind(event: unknown): string | null {
  const record = asRecord(event);
  return record === null ? null : normalizeWireKind(record.kind);
}

export function isEventKind(event: unknown, expected: string): boolean {
  return eventKind(event) === expected;
}

export function isActionEvent(event: unknown): event is WireRecord {
  return isEventKind(event, 'ActionEvent');
}

export function isObservationEvent(event: unknown): event is WireRecord {
  return isEventKind(event, 'ObservationEvent');
}

export function isAgentErrorEvent(event: unknown): event is WireRecord {
  return isEventKind(event, 'AgentErrorEvent');
}

export function isUserRejectObservation(event: unknown): event is WireRecord {
  return isEventKind(event, 'UserRejectObservation');
}

export function actionRecord(event: WireRecord): WireRecord | null {
  return asRecord(event.action);
}

export function observationRecord(event: WireRecord): WireRecord | null {
  return asRecord(event.observation);
}

export function stringField(record: WireRecord, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' ? value : null;
}

/** A JSON wire object is representable verbatim, or has no renderable payload. */
export function nativeJson(value: unknown): string | null {
  try {
    return JSON.stringify(value, null, 2) ?? null;
  } catch {
    return null;
  }
}

export function unhandledContent(kind: string, value: unknown): string {
  const payload = nativeJson(value);
  return payload === null ? `UNHANDLED native event: ${kind}` : `UNHANDLED native event: ${kind}\n${payload}`;
}
