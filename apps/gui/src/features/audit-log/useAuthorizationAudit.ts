import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
 * - **provenance always carries one first-party item** for the operator decision
 *   itself, plus one `third-party-untrusted` item per untrusted context id the
 *   tracker actually found. An empty untrusted set is therefore only ever
 *   recorded when the tracker computed one.
 * - **an uncomputed tracker is preserved as `actionClass`, not flattened.**
 *   `gui-local-uncomputed` and `gui-local-clear` are different facts; writing
 *   `[]` for both would silently promote "we did not look" into "we looked and
 *   found nothing", which is exactly the failure zero-trust exists to prevent.
 */
export interface AuthorizationAuditBinding {
  readonly entries: readonly AuthorizationAuditEntry[];
  readonly session: AuthorizationAuditSession;
  readonly activeRelaxationCount: number;
  recordApproval(action: PendingAction): void;
  recordRejection(action: PendingAction, reason: string): void;
}

export function useAuthorizationAudit(
  conversationId: string | null,
): AuthorizationAuditBinding {
  const logRef = useRef<AuthorizationAuditLog | null>(null);
  const [entries, setEntries] = useState<readonly AuthorizationAuditEntry[]>([]);
  const [session, setSession] = useState<AuthorizationAuditSession>({
    sessionId: conversationId ?? 'no-conversation',
    status: 'active',
    endedAt: null,
  });

  useEffect(() => {
    if (conversationId === null) {
      logRef.current = null;
      setEntries([]);
      return;
    }
    const log = new AuthorizationAuditLog({ sessionId: conversationId });
    logRef.current = log;
    setEntries(log.entries);
    setSession(log.session);
    return () => {
      // Relaxations are session-scoped: ending the session drops the live count
      // without rewriting the grants that were historically made.
      setSession(log.endSession());
      logRef.current = null;
    };
  }, [conversationId]);

  const record = useCallback(
    (action: PendingAction, decision: 'approved' | 'rejected', reason?: string) => {
      const log = logRef.current;
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
      setEntries(log.entries);
    },
    [],
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
