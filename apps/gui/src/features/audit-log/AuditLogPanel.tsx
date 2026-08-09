import {
  exportAuthorizationAuditLog,
  type AuthorizationAuditEntry,
  type AuthorizationAuditSession,
  type SdkNativeAuthorizationSnapshot,
} from './audit-log';

export interface AuthorizationAuditLogPanelProps {
  readonly entries: readonly AuthorizationAuditEntry[];
  readonly session: AuthorizationAuditSession;
  /** Supply `AuthorizationAuditLog.activeRelaxationCount` to drive the trust-dial badge. */
  readonly activeRelaxationCount: number;
  /** Optional host hook for export; receives the exact stable JSON payload. */
  readonly onExport?: (payload: string) => void;
}

function display(value: string | number | null, unavailable: string): string {
  return value === null ? unavailable : String(value);
}

function DecisionLabel({ decision }: { decision: AuthorizationAuditEntry['decision'] }) {
  if (decision === 'approved') return 'Approved';
  if (decision === 'rejected') return 'Rejected with reason';
  return 'Relaxation granted';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-slate-800 py-2 last:border-b-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 min-w-0 break-words font-mono text-sm tabular-nums text-slate-100">{children}</dd>
    </div>
  );
}

function NativeReadings({ snapshot }: { snapshot: SdkNativeAuthorizationSnapshot | null }) {
  if (snapshot === null) {
    return (
      <div
        aria-label="SDK-native readings"
        className="rounded border border-slate-700 bg-night-950 p-3"
        data-testid="audit-sdk-native-unavailable"
      >
        <h4 className="font-semibold text-slate-100">SDK-native readings</h4>
        <p className="mt-1 text-sm text-slate-400">
          Not supplied. No SDK-native event was available at this decision; GUI-local evidence remains
          separately recorded.
        </p>
      </div>
    );
  }

  const allUnavailable = Object.values(snapshot).every((value) => value === null);
  return (
    <div aria-label="SDK-native readings" className="rounded border border-slate-700 bg-night-950 p-3">
      <h4 className="font-semibold text-slate-100">SDK-native readings</h4>
      <p className="mt-1 text-xs text-slate-400">
        Verified OpenHands SDK field projection. Missing native values remain unavailable rather than
        being reconstructed.
      </p>
      {allUnavailable ? (
        <p className="mt-2 text-sm text-slate-400" data-testid="audit-sdk-native-empty">
          SDK event supplied, but none of the verified fields were reported.
        </p>
      ) : (
        <dl className="mt-2 grid gap-x-4 sm:grid-cols-2">
          <Field label="Event ID">{display(snapshot.eventId, 'Not reported')}</Field>
          <Field label="Event timestamp">{display(snapshot.eventTimestamp, 'Not reported')}</Field>
          <Field label="Event source">{display(snapshot.eventSource, 'Not reported')}</Field>
          <Field label="Tool name">{display(snapshot.toolName, 'Not reported')}</Field>
          <Field label="Tool call ID">{display(snapshot.toolCallId, 'Not reported')}</Field>
          <Field label="LLM security risk">{display(snapshot.securityRisk, 'Not reported')}</Field>
          <Field label="Rejected action ID">{display(snapshot.actionId, 'Not reported')}</Field>
          <Field label="SDK rejection reason">
            {display(snapshot.rejectionReason, 'Not reported')}
          </Field>
          <Field label="SDK rejection source">
            {display(snapshot.rejectionSource, 'Not reported')}
          </Field>
        </dl>
      )}
    </div>
  );
}

function Provenance({ entry }: { entry: AuthorizationAuditEntry }) {
  if (entry.provenance.length === 0) {
    return (
      <p className="mt-2 text-sm text-slate-400" data-testid={`audit-provenance-empty-${entry.id}`}>
        Captured at decision time: no context items informed this decision.
      </p>
    );
  }

  return (
    <ul className="mt-2 space-y-2" aria-label="Decision provenance" data-testid={`audit-provenance-${entry.id}`}>
      {entry.provenance.map((reference) => (
        <li key={reference.id} className="rounded border border-slate-700 bg-night-950 px-3 py-2 text-sm">
          <p className="font-mono text-slate-100">{reference.id}</p>
          <p className="mt-1 text-slate-300">
            Trust class: <span className="font-medium">{reference.trust_class}</span>
          </p>
          <p className="text-slate-400">Source: {reference.source}</p>
        </li>
      ))}
    </ul>
  );
}

function AuditEntryCard({ entry, session }: { entry: AuthorizationAuditEntry; session: AuthorizationAuditSession }) {
  const relaxationStatus =
    entry.decision === 'relaxation-granted'
      ? session.status === 'active'
        ? 'Active for this session'
        : 'Expired when this session ended'
      : null;

  return (
    <article className="rounded border border-slate-600 bg-night-900 p-4" data-testid={`audit-entry-${entry.id}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-100">
          <DecisionLabel decision={entry.decision} />
        </h3>
        <time className="font-mono text-xs tabular-nums text-slate-400">{entry.recordedAt}</time>
      </header>

      <div className="mt-3" aria-label="GUI-local decision record">
        <h4 className="font-semibold text-slate-100">GUI-local decision record</h4>
        <p className="mt-1 text-xs text-slate-400">
          Captured by this GUI at decision time; not represented as an OpenHands SDK field.
        </p>
        <dl className="mt-2 grid gap-x-4 sm:grid-cols-2">
          <Field label="Action">{entry.guiLocal.actionLabel}</Field>
          <Field label="Action class">
            {display(entry.guiLocal.actionClass, 'Not computed')}
          </Field>
          <Field label="Decision confidence">{entry.confidence.toFixed(2)}</Field>
          {entry.guiLocal.rejectionReason !== null && (
            <Field label="Operator rejection reason">{entry.guiLocal.rejectionReason}</Field>
          )}
          {entry.guiLocal.relaxationClass !== null && (
            <Field label="Relaxed class">
              {entry.guiLocal.relaxationClass}
              {relaxationStatus === null ? null : (
                <span className="ml-2 font-sans text-xs text-slate-400">({relaxationStatus})</span>
              )}
            </Field>
          )}
        </dl>
      </div>

      <div className="mt-3" aria-label="Decision provenance">
        <h4 className="font-semibold text-slate-100">Decision-time provenance</h4>
        <p className="mt-1 text-xs text-slate-400">
          IDs are recorded for Phase 5 Context Inspector resolution. This Phase 1 panel does not render
          an inert cross-link.
        </p>
        <Provenance entry={entry} />
      </div>

      <div className="mt-3">
        <NativeReadings snapshot={entry.sdkNative} />
      </div>
    </article>
  );
}

function downloadPayload(payload: string, sessionId: string) {
  const blob = new Blob([payload], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `authorization-audit-${sessionId}.json`;
  anchor.click();
  URL.revokeObjectURL(href);
}

/**
 * Visible, exportable Phase 1 audit-log panel. It is presentation-only by design: callers own the
 * session log and must re-render this component with its immutable snapshots after each append/end.
 */
export function AuthorizationAuditLogPanel({
  entries,
  session,
  activeRelaxationCount,
  onExport,
}: AuthorizationAuditLogPanelProps) {
  const exportPayload = () => {
    const payload = exportAuthorizationAuditLog(entries, session);
    if (onExport) onExport(payload);
    else downloadPayload(payload, session.sessionId);
  };

  return (
    <section className="space-y-4" aria-labelledby="authorization-audit-log-heading" data-testid="authorization-audit-log-panel">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded border border-slate-700 bg-night-900 p-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">Authorization</p>
          <h2 id="authorization-audit-log-heading" className="mt-1 text-xl font-semibold tracking-tight">
            Authorization audit log
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Append-only decision evidence for this conversation. SDK-native readings and GUI-local
            evidence are intentionally separated.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <output
            aria-label="Active relaxation count"
            className="rounded border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100"
            data-testid="active-relaxation-count"
          >
            Active relaxations: {activeRelaxationCount}
          </output>
          <button
            type="button"
            onClick={exportPayload}
            className="rounded border border-slate-500 px-3 py-2 text-sm font-medium text-slate-100"
            data-testid="audit-log-export"
          >
            Export JSON
          </button>
        </div>
      </header>

      {session.status === 'ended' && (
        <p className="rounded border border-slate-600 bg-night-950 p-3 text-sm text-slate-300" data-testid="audit-session-ended">
          Session ended at {session.endedAt}. All relaxation grants have expired.
        </p>
      )}

      {entries.length === 0 ? (
        <p className="rounded border border-slate-700 bg-night-900 p-4 text-sm text-slate-400" data-testid="audit-log-empty">
          No authorization decisions have been recorded for this session.
        </p>
      ) : (
        <ol className="space-y-3" aria-label="Authorization decisions">
          {entries.map((entry) => (
            <li key={entry.id}>
              <AuditEntryCard entry={entry} session={session} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default AuthorizationAuditLogPanel;
