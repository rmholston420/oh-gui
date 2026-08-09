import {
  untrustedContentStatus,
  type GuiLocalUntrustedContentProvenance,
} from './untrusted-content';

/**
 * Provenance is deliberately separate from execution risk: `security_risk` is the LLM's action
 * assessment, while this is a GUI-local account of whether untrusted context influenced the action.
 */
export function UntrustedContentBadge({
  provenance,
}: {
  readonly provenance: GuiLocalUntrustedContentProvenance | undefined;
}) {
  const status = untrustedContentStatus(provenance);

  switch (status) {
    case 'gui-local-influenced':
      return (
        <span
          data-testid="untrusted-content-badge"
          data-status={status}
          className="rounded border border-violet-500 bg-violet-950 px-2 py-1 text-xs font-semibold text-violet-100"
        >
          Influenced by untrusted/external content <span className="font-normal">(GUI-local provenance)</span>
        </span>
      );
    case 'gui-local-clear':
      return (
        <span
          data-testid="untrusted-content-badge"
          data-status={status}
          className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200"
        >
          No untrusted influence identified <span className="text-slate-400">(GUI-local provenance)</span>
        </span>
      );
    case 'gui-local-uncomputed':
      return (
        <span
          data-testid="untrusted-content-badge"
          data-status={status}
          className="rounded border border-amber-600 bg-amber-950 px-2 py-1 text-xs text-amber-100"
        >
          Untrusted-content provenance not computed <span className="text-amber-200">(GUI-local)</span>
        </span>
      );
    case 'unavailable':
      return (
        <span
          data-testid="untrusted-content-badge"
          data-status={status}
          className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-300"
        >
          Untrusted-content provenance unavailable
        </span>
      );
  }
}
