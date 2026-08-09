import { useCallback, useEffect, useMemo, useReducer } from 'react';
import {
  AuthorizationAuditLog,
  untrustedProvenanceReferences,
  type AuthorizationAuditEntry,
  type AuthorizationAuditSession,
} from './audit-log';
import { untrustedContentStatus } from '../authorization/untrusted-content';
import type { PendingAction } from '../authorization/AuthorizationCard';
import { sdkNativeAuthorizationSnapshotFromEvent } from './audit-log';

/**
 * Binds the append-only authorization audit log to one conversation.
 *
 * Zero-trust writes require `provenance` and `confidence`, and neither may be
 * invented. The conventions used here are deliberate and narrow:
 *
 * - **confidence is always 1.** It describes the fidelity of the *record*, not a
 *   belief about the action. An operator clicking Approve is directly observed,
 *   so the record is certain. It is never a model score and must not become one.
 * - **provenance follows ADR-020 clause 3.** When the untrusted-content tracker
 *   ran, the entry carries one first-party item for the operator decision plus
 *   one `third-party-untrusted` item per untrusted context id it found. When the
 *   tracker did not run, provenance is `null` — not `[]`, which would promote
 *   "we did not look" into "we looked and found nothing".
 * - **`actionClass` mirrors the same fact for display.** `gui-local-uncomputed`
 *   and `gui-local-clear` remain distinct, but the authoritative distinction is
 *   the ratified null-vs-empty one.
 */
export interface AuthorizationAuditBinding {
  readonly entries: readonly AuthorizationAuditEntry[];
  readonly session: AuthorizationAuditSession;
  readonly activeRelaxationCount: number;
  recordApproval(action: PendingAction): void;
  recordRejection(action: PendingAction, reason: string): void;
}

const EMPTY_ENTRIES: readonly AuthorizationAuditEntry[] = Object.freeze([]);

export function useAuthorizationAudit(
  conversationId: string | null,
): AuthorizationAuditBinding {
  // The log is created during render, not in an effect. Creating it in an effect meant the first
  // paint after a conversation appears had no log, and recovering from that required a setState
  // inside the effect — a cascading render, and the reason `react-hooks` flags it.
  const log = useMemo(
    () => (conversationId === null ? null : new AuthorizationAuditLog({ sessionId: conversationId })),
    [conversationId],
  );

  // The log owns the history; this counter only tells React that the owned value moved. Copying
  // entries into state would give two sources of truth for an append-only record.
  const [revision, bumpRevision] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    if (log === null) return;
    return () => {
      // Relaxations are session-scoped: ending the session drops the live count without
      // rewriting the grants that were historically made.
      log.endSession();
    };
  }, [log]);

  const entries = useMemo(
    // `revision` is the dependency that matters: the log mutates in place on append.
    () => log?.entries ?? EMPTY_ENTRIES,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [log, revision],
  );
  const session: AuthorizationAuditSession = log?.session ?? {
    sessionId: 'no-conversation',
    status: 'active',
    endedAt: null,
  };

  const record = useCallback(
    (action: PendingAction, decision: 'approved' | 'rejected', reason?: string) => {
      if (log === null) return;

      const status = untrustedContentStatus(action.guiLocalUntrustedContentProvenance);
      const provenance = untrustedProvenanceReferences(
        action.guiLocalUntrustedContentProvenance,
        action.toolName,
      );

      log.append(
        decision === 'approved'
          ? {
              decision: 'approved',
              actionLabel: action.command,
              actionClass: status,
              provenance,
              confidence: 1,
              sdkNative: sdkNativeAuthorizationSnapshotFromEvent(action.event ?? null),
            }
          : {
              decision: 'rejected',
              actionLabel: action.command,
              actionClass: status,
              provenance,
              confidence: 1,
              rejectionReason: reason ?? '',
              sdkNative: sdkNativeAuthorizationSnapshotFromEvent(action.event ?? null),
            },
      );
      bumpRevision();
    },
    [log],
  );

  const recordApproval = useCallback(
    (action: PendingAction) => record(action, 'approved'),
    [record],
  );
  const recordRejection = useCallback(
    (action: PendingAction, reason: string) => record(action, 'rejected', reason),
    [record],
  );

  const activeRelaxationCount = useMemo(
    () => entries.filter((entry) => entry.decision === 'relaxation-granted').length,
    [entries],
  );

  return useMemo(
    () => ({ entries, session, activeRelaxationCount, recordApproval, recordRejection }),
    [entries, session, activeRelaxationCount, recordApproval, recordRejection],
  );
}
