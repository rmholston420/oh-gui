/**
 * Authorization audit log domain model — docs/specs/04-authorization.md §4.2.1.
 *
 * This module is deliberately self-contained. The shell and authorization-card wiring own the
 * decision dispatch; they must call this module at the moment of the operator decision.
 *
 * Native basis for the optional `sdkNative` snapshot:
 * - Event.id, Event.timestamp, Event.source:
 *   openhands/sdk/event/base.py (`Event`)
 * - ActionEvent.tool_name, ActionEvent.tool_call_id, ActionEvent.security_risk:
 *   openhands/sdk/event/llm_convertible/action.py (`ActionEvent`)
 * - UserRejectObservation.rejection_reason, UserRejectObservation.rejection_source,
 *   UserRejectObservation.action_id:
 *   openhands/sdk/event/llm_convertible/observation.py (`UserRejectObservation`)
 *
 * Every other persisted field is explicitly GUI-local. In particular, the SDK does not provide
 * authorization-decision provenance or confidence, so the module refuses to invent either.
 */

export const PROVENANCE_TRUST_CLASSES = [
  'first-party',
  'workspace-derived',
  'third-party-untrusted',
] as const;

export type ProvenanceTrustClass = (typeof PROVENANCE_TRUST_CLASSES)[number];
export type SdkNativeEventSource = 'agent' | 'user' | 'environment' | 'hook';
export type SdkNativeSecurityRisk = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * GUI-local decision-time reference to a future Context Inspector item (ADR-020).
 * This is not an OpenHands SDK field.
 */
export interface AuditProvenanceReference {
  readonly id: string;
  readonly trust_class: ProvenanceTrustClass;
  readonly source: string;
}

/**
 * A narrow, verified projection of an SDK event. `null` means that no matching SDK event was
 * supplied; individual `null` values mean that the verified native field was not reported.
 * An empty object is never used as an "uncomputed" sentinel.
 */
export interface SdkNativeAuthorizationSnapshot {
  /** SDK `Event.id`. */
  readonly eventId: string | null;
  /** SDK `Event.timestamp`. */
  readonly eventTimestamp: string | null;
  /** SDK `Event.source`. */
  readonly eventSource: SdkNativeEventSource | null;
  /** SDK `ActionEvent.tool_name` / `UserRejectObservation.tool_name`. */
  readonly toolName: string | null;
  /** SDK `ActionEvent.tool_call_id` / `UserRejectObservation.tool_call_id`. */
  readonly toolCallId: string | null;
  /** SDK `ActionEvent.security_risk`, the LLM's assessment of the action. */
  readonly securityRisk: SdkNativeSecurityRisk | null;
  /** SDK `UserRejectObservation.action_id`. */
  readonly actionId: string | null;
  /** SDK `UserRejectObservation.rejection_reason`. */
  readonly rejectionReason: string | null;
  /** SDK `UserRejectObservation.rejection_source`. */
  readonly rejectionSource: 'user' | 'hook' | null;
}

/** GUI-local action facts captured from the pending authorization card at decision time. */
export interface GuiLocalAuthorizationDecision {
  readonly actionLabel: string;
  /** `null` means no GUI action class was computed; `''` is rejected rather than treated as absent. */
  readonly actionClass: string | null;
  readonly decision: AuthorizationAuditDecision;
  readonly rejectionReason: string | null;
  readonly relaxationClass: string | null;
}

export type AuthorizationAuditDecision = 'approved' | 'rejected' | 'relaxation-granted';

interface SharedAuditWrite {
  /** GUI-local, operator-visible description of the action being decided. */
  readonly actionLabel: string;
  /** GUI-local class key. Null is an explicit uncomputed state. */
  readonly actionClass: string | null;
  /**
   * GUI-local decision-time evidence. It is required and is never defaulted to `[]` or `null`.
   * `[]` is accepted only when the caller captured that no context item informed the decision.
   */
  readonly provenance: readonly AuditProvenanceReference[];
  /** GUI-local confidence captured at decision time, constrained to [0, 1]. */
  readonly confidence: number;
  /** Verified native snapshot, or null when no native event was supplied. */
  readonly sdkNative: SdkNativeAuthorizationSnapshot | null;
}

export interface ApprovalAuditWrite extends SharedAuditWrite {
  readonly decision: 'approved';
}

export interface RejectionAuditWrite extends SharedAuditWrite {
  readonly decision: 'rejected';
  /** Required free-text operator reason, preserved verbatim after trimming only outer whitespace. */
  readonly rejectionReason: string;
}

export interface RelaxationGrantAuditWrite extends SharedAuditWrite {
  readonly decision: 'relaxation-granted';
  /** GUI-local class whose confirmation requirement was relaxed for this session only. */
  readonly relaxationClass: string;
}

export type AuthorizationAuditWrite =
  | ApprovalAuditWrite
  | RejectionAuditWrite
  | RelaxationGrantAuditWrite;

export interface AuthorizationAuditEntry {
  /** GUI-local immutable log-entry ID. */
  readonly id: string;
  /** GUI-local conversation/session identity supplied to the log constructor. */
  readonly sessionId: string;
  /** GUI-local wall-clock instant captured by `append`, never reconstructed at read time. */
  readonly recordedAt: string;
  readonly decision: AuthorizationAuditDecision;
  /**
   * GUI-local decision-time provenance. It is always a structured array; an unsupported/missing
   * value is rejected at write time. An empty array means explicitly captured with no items.
   */
  readonly provenance: readonly AuditProvenanceReference[];
  /** GUI-local decision-time confidence; this is not an SDK score. */
  readonly confidence: number;
  /** Only fields verified in the pinned SDK source, otherwise null. */
  readonly sdkNative: SdkNativeAuthorizationSnapshot | null;
  /** Explicitly GUI-local action and decision data, kept separate from SDK-native fields. */
  readonly guiLocal: GuiLocalAuthorizationDecision;
}

export interface AuthorizationAuditSession {
  readonly sessionId: string;
  readonly status: 'active' | 'ended';
  /** GUI-local end timestamp. Null only while the session remains active. */
  readonly endedAt: string | null;
}

export interface AuthorizationAuditLogOptions {
  readonly sessionId: string;
  readonly clock?: () => string;
  readonly entryId?: (sequence: number) => string;
}

export type AuditLogValidationCode =
  | 'invalid-session-id'
  | 'session-ended'
  | 'missing-provenance'
  | 'invalid-provenance'
  | 'invalid-confidence'
  | 'invalid-action-label'
  | 'invalid-action-class'
  | 'missing-rejection-reason'
  | 'missing-relaxation-class'
  | 'invalid-sdk-native-snapshot'
  | 'invalid-entry-id'
  | 'invalid-timestamp';

export class AuditLogValidationError extends Error {
  readonly code: AuditLogValidationCode;

  constructor(code: AuditLogValidationCode, message: string) {
    super(message);
    this.name = 'AuditLogValidationError';
    this.code = code;
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function requireNonBlankString(value: unknown, code: AuditLogValidationCode, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AuditLogValidationError(code, `${label} must be a non-blank string.`);
  }
  return value.trim();
}

function nullableString(value: unknown, code: AuditLogValidationCode, label: string): string | null {
  if (value === null) return null;
  return requireNonBlankString(value, code, label);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSdkNativeEventSource(value: unknown): value is SdkNativeEventSource {
  return value === 'agent' || value === 'user' || value === 'environment' || value === 'hook';
}

function isSdkNativeSecurityRisk(value: unknown): value is SdkNativeSecurityRisk {
  return value === 'UNKNOWN' || value === 'LOW' || value === 'MEDIUM' || value === 'HIGH';
}

function copyProvenance(value: unknown): readonly AuditProvenanceReference[] {
  // ADR-020 requires a captured array. Missing/null values must not silently become [] because that
  // would falsely claim that a capture occurred and found no influencing context items.
  if (!Array.isArray(value)) {
    throw new AuditLogValidationError(
      'missing-provenance',
      'Audit entries require a structured provenance array captured at decision time.',
    );
  }

  return value.map((reference, index) => {
    if (!isRecord(reference)) {
      throw new AuditLogValidationError('invalid-provenance', `provenance[${index}] must be an object.`);
    }
    const id = requireNonBlankString(reference.id, 'invalid-provenance', `provenance[${index}].id`);
    const source = requireNonBlankString(
      reference.source,
      'invalid-provenance',
      `provenance[${index}].source`,
    );
    if (!PROVENANCE_TRUST_CLASSES.includes(reference.trust_class as ProvenanceTrustClass)) {
      throw new AuditLogValidationError(
        'invalid-provenance',
        `provenance[${index}].trust_class must be a supported trust class.`,
      );
    }
    return deepFreeze({ id, source, trust_class: reference.trust_class as ProvenanceTrustClass });
  });
}

function copySdkNativeSnapshot(value: unknown): SdkNativeAuthorizationSnapshot | null {
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new AuditLogValidationError(
      'invalid-sdk-native-snapshot',
      'sdkNative must be a verified snapshot or null.',
    );
  }

  const eventSource = value.eventSource;
  const securityRisk = value.securityRisk;
  const rejectionSource = value.rejectionSource;
  if (eventSource !== null && !isSdkNativeEventSource(eventSource)) {
    throw new AuditLogValidationError('invalid-sdk-native-snapshot', 'sdkNative.eventSource is invalid.');
  }
  if (securityRisk !== null && !isSdkNativeSecurityRisk(securityRisk)) {
    throw new AuditLogValidationError('invalid-sdk-native-snapshot', 'sdkNative.securityRisk is invalid.');
  }
  if (rejectionSource !== null && rejectionSource !== 'user' && rejectionSource !== 'hook') {
    throw new AuditLogValidationError('invalid-sdk-native-snapshot', 'sdkNative.rejectionSource is invalid.');
  }

  return deepFreeze({
    eventId: nullableString(value.eventId, 'invalid-sdk-native-snapshot', 'sdkNative.eventId'),
    eventTimestamp: nullableString(
      value.eventTimestamp,
      'invalid-sdk-native-snapshot',
      'sdkNative.eventTimestamp',
    ),
    eventSource,
    toolName: nullableString(value.toolName, 'invalid-sdk-native-snapshot', 'sdkNative.toolName'),
    toolCallId: nullableString(value.toolCallId, 'invalid-sdk-native-snapshot', 'sdkNative.toolCallId'),
    securityRisk,
    actionId: nullableString(value.actionId, 'invalid-sdk-native-snapshot', 'sdkNative.actionId'),
    rejectionReason: nullableString(
      value.rejectionReason,
      'invalid-sdk-native-snapshot',
      'sdkNative.rejectionReason',
    ),
    rejectionSource,
  });
}

function copyConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new AuditLogValidationError('invalid-confidence', 'confidence must be a finite number in [0, 1].');
  }
  return value;
}

function readActionClass(value: unknown): string | null {
  return nullableString(value, 'invalid-action-class', 'actionClass');
}

function decisionDetails(write: AuthorizationAuditWrite): GuiLocalAuthorizationDecision {
  const actionLabel = requireNonBlankString(write.actionLabel, 'invalid-action-label', 'actionLabel');
  const actionClass = readActionClass(write.actionClass);

  if (write.decision === 'rejected') {
    const rejectionReason = requireNonBlankString(
      write.rejectionReason,
      'missing-rejection-reason',
      'rejectionReason',
    );
    return deepFreeze({
      actionLabel,
      actionClass,
      decision: write.decision,
      rejectionReason,
      relaxationClass: null,
    });
  }

  if (write.decision === 'relaxation-granted') {
    const relaxationClass = requireNonBlankString(
      write.relaxationClass,
      'missing-relaxation-class',
      'relaxationClass',
    );
    return deepFreeze({
      actionLabel,
      actionClass,
      decision: write.decision,
      rejectionReason: null,
      relaxationClass,
    });
  }

  return deepFreeze({
    actionLabel,
    actionClass,
    decision: write.decision,
    rejectionReason: null,
    relaxationClass: null,
  });
}

function isSupportedNativeEventKind(value: unknown): value is 'ActionEvent' | 'UserRejectObservation' {
  return value === 'ActionEvent' || value === 'UserRejectObservation';
}

/**
 * Creates a verified, narrow snapshot from an SDK event wire object. It intentionally returns null
 * for unrecognised event kinds instead of projecting arbitrary similarly named fields.
 */
export function sdkNativeAuthorizationSnapshotFromEvent(
  event: unknown,
): SdkNativeAuthorizationSnapshot | null {
  if (!isRecord(event) || !isSupportedNativeEventKind(event.kind)) return null;

  const eventSource = isSdkNativeEventSource(event.source) ? event.source : null;
  const actionEvent = event.kind === 'ActionEvent';
  const rejectionEvent = event.kind === 'UserRejectObservation';

  return deepFreeze({
    eventId: typeof event.id === 'string' && event.id.trim() ? event.id : null,
    eventTimestamp: typeof event.timestamp === 'string' && event.timestamp.trim() ? event.timestamp : null,
    eventSource,
    toolName: typeof event.tool_name === 'string' && event.tool_name.trim() ? event.tool_name : null,
    toolCallId:
      typeof event.tool_call_id === 'string' && event.tool_call_id.trim() ? event.tool_call_id : null,
    securityRisk: actionEvent && isSdkNativeSecurityRisk(event.security_risk) ? event.security_risk : null,
    actionId: rejectionEvent && typeof event.action_id === 'string' && event.action_id.trim() ? event.action_id : null,
    rejectionReason:
      rejectionEvent && typeof event.rejection_reason === 'string' && event.rejection_reason.trim()
        ? event.rejection_reason
        : null,
    rejectionSource:
      rejectionEvent && (event.rejection_source === 'user' || event.rejection_source === 'hook')
        ? event.rejection_source
        : null,
  });
}

/**
 * Append-only per-conversation log. Relaxations have no time duration: they are active while this
 * session is active and become inactive atomically when `endSession()` is called.
 */
export class AuthorizationAuditLog {
  readonly #sessionId: string;
  readonly #clock: () => string;
  readonly #entryId: (sequence: number) => string;
  #entries: AuthorizationAuditEntry[] = [];
  #session: AuthorizationAuditSession;

  constructor({ sessionId, clock = () => new Date().toISOString(), entryId }: AuthorizationAuditLogOptions) {
    this.#sessionId = requireNonBlankString(sessionId, 'invalid-session-id', 'sessionId');
    this.#clock = clock;
    this.#entryId = entryId ?? ((sequence) => `${this.#sessionId}:authorization-audit:${sequence}`);
    this.#session = deepFreeze({ sessionId: this.#sessionId, status: 'active', endedAt: null });
  }

  /** Immutable session state; `endedAt: null` explicitly means the session is still active. */
  get session(): AuthorizationAuditSession {
    return this.#session;
  }

  /** Immutable append-order snapshot. There is intentionally no update, remove, or clear API. */
  get entries(): readonly AuthorizationAuditEntry[] {
    return deepFreeze([...this.#entries]);
  }

  /** Live, session-scoped trust-dial badge value. It never survives `endSession()`. */
  get activeRelaxationCount(): number {
    if (this.#session.status === 'ended') return 0;
    return this.#entries.filter((entry) => entry.decision === 'relaxation-granted').length;
  }

  append(write: AuthorizationAuditWrite): AuthorizationAuditEntry {
    if (this.#session.status === 'ended') {
      throw new AuditLogValidationError('session-ended', 'Cannot append to an authorization log after session end.');
    }

    const recordedAt = requireNonBlankString(this.#clock(), 'invalid-timestamp', 'clock result');
    const id = requireNonBlankString(this.#entryId(this.#entries.length + 1), 'invalid-entry-id', 'entryId');
    const provenance = copyProvenance((write as { provenance?: unknown }).provenance);
    const confidence = copyConfidence((write as { confidence?: unknown }).confidence);
    const sdkNative = copySdkNativeSnapshot((write as { sdkNative?: unknown }).sdkNative);
    const guiLocal = decisionDetails(write);

    const entry = deepFreeze({
      id,
      sessionId: this.#sessionId,
      recordedAt,
      decision: write.decision,
      provenance,
      confidence,
      sdkNative,
      guiLocal,
    });
    this.#entries = [...this.#entries, entry];
    return entry;
  }

  /** Ends this conversation's relaxation scope without mutating its historical grants. */
  endSession(): AuthorizationAuditSession {
    if (this.#session.status === 'active') {
      this.#session = deepFreeze({
        sessionId: this.#sessionId,
        status: 'ended',
        endedAt: requireNonBlankString(this.#clock(), 'invalid-timestamp', 'clock result'),
      });
    }
    return this.#session;
  }
}

/**
 * Stable export payload. It contains only immutable entry snapshots and the current session scope;
 * callers can download this JSON without manufacturing fields at export time.
 */
export function exportAuthorizationAuditLog(
  entries: readonly AuthorizationAuditEntry[],
  session: AuthorizationAuditSession,
): string {
  return JSON.stringify(
    {
      format: 'oh-gui.authorization-audit-log.v1',
      session,
      entries,
    },
    null,
    2,
  );
}
