import { Fragment, useCallback, useEffect, useState } from 'react';
import { AgentServerRequestError, agentServer } from '../../api/agentServer';
import type { GitChange, GitChangeStatus, GitDiff } from '../../api/types';
import { diffLines, summarise, toHunks } from './diff';

export interface ChangeReviewPanelProps {
  /** Repository directory **inside the agent-server container**, not a host path. */
  readonly repoPath?: string | null;
  readonly listGitChanges?: typeof agentServer.listGitChanges;
  readonly getGitDiff?: typeof agentServer.getGitDiff;
}

type ListState =
  | { status: 'loading' }
  | { status: 'loaded'; changes: readonly GitChange[] }
  | { status: 'failed'; message: string };

type DiffState =
  | { status: 'loading' }
  | { status: 'loaded'; diff: GitDiff }
  | { status: 'failed'; message: string };

const STATUS_LABEL: Record<GitChangeStatus, string> = {
  ADDED: 'Added',
  DELETED: 'Deleted',
  UPDATED: 'Updated',
  MOVED: 'Moved',
};

// Status is carried by a text label as well as colour. Colour alone fails WCAG 1.4.1, and
// red/green is the worst possible pair for the most common colour blindness.
const STATUS_CLASS: Record<GitChangeStatus, string> = {
  ADDED: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
  DELETED: 'border-rose-800 bg-rose-950/40 text-rose-300',
  UPDATED: 'border-sky-800 bg-sky-950/40 text-sky-300',
  MOVED: 'border-amber-800 bg-amber-950/40 text-amber-300',
};

function describeError(error: unknown): string {
  if (error instanceof AgentServerRequestError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function DiffBody({ diff }: { diff: GitDiff }) {
  const lines = diffLines(diff.original, diff.modified);
  const stat = summarise(lines);
  const hunks = toHunks(lines);

  if (stat.added === 0 && stat.removed === 0) {
    return (
      <p className="px-3 py-2 text-xs text-slate-400">
        {/* Both sides null also lands here: `git_router.py:112` returns an empty diff for a path
            outside a repository, so "unchanged" and "not a repo" are indistinguishable over the
            wire. Saying "no line changes" claims only what the response actually supports. */}
        No line changes to show for this file.
      </p>
    );
  }

  return (
    <>
      <p className="px-3 pb-1 text-xs text-slate-400">
        <span className="text-emerald-400">+{stat.added}</span>{' '}
        <span className="text-rose-400">−{stat.removed}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-xs">
          <caption className="sr-only">Line by line differences</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Original line</th>
              <th scope="col">New line</th>
              <th scope="col">Change</th>
              <th scope="col">Content</th>
            </tr>
          </thead>
          <tbody>
            {hunks.map((hunk, hunkIndex) => (
              // `Fragment` with an explicit key, not `<>`: shorthand fragments cannot take one,
              // and React silently drops it, which shows up later as mis-keyed rows.
              <Fragment key={`hunk-${hunkIndex}`}>
                {hunk.skippedBefore > 0 && (
                  <tr className="bg-slate-900/60">
                    <td colSpan={4} className="px-3 py-1 text-center text-slate-500">
                      {hunk.skippedBefore} unchanged{' '}
                      {hunk.skippedBefore === 1 ? 'line' : 'lines'}
                    </td>
                  </tr>
                )}
                {hunk.lines.map((line, lineIndex) => (
                  <tr
                    key={`${hunkIndex}-${lineIndex}`}
                    className={
                      line.kind === 'added'
                        ? 'bg-emerald-950/40'
                        : line.kind === 'removed'
                          ? 'bg-rose-950/40'
                          : ''
                    }
                  >
                    <td className="w-12 select-none px-2 text-right text-slate-600">
                      {line.originalLine ?? ''}
                    </td>
                    <td className="w-12 select-none px-2 text-right text-slate-600">
                      {line.modifiedLine ?? ''}
                    </td>
                    <td className="w-5 select-none text-center text-slate-500">
                      {/* A real character, not a background colour, so the sign survives copy,
                          paste, and a screen reader. */}
                      {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}
                    </td>
                    <td className="whitespace-pre px-2 text-slate-200">{line.text || ' '}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ChangeRow({
  change,
  repoPath,
  getDiff,
}: {
  change: GitChange;
  repoPath: string;
  getDiff: typeof agentServer.getGitDiff;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<DiffState | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    // `/api/diff` takes the file path, while `/api/changes` took the repository path. The change
    // list reports paths relative to the repository, so they are joined here.
    const filePath = `${repoPath.replace(/\/$/, '')}/${change.path}`;
    getDiff(filePath)
      .then((diff) => setState({ status: 'loaded', diff }))
      .catch((error: unknown) => setState({ status: 'failed', message: describeError(error) }));
  }, [change.path, getDiff, repoPath]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    // Fetched on first expand, not on mount: a run touching forty files would otherwise fire forty
    // requests the operator never asked for.
    if (next && state === null) load();
  };

  return (
    <li className="rounded-lg border border-slate-800 bg-slate-900/40" data-testid="change-row">
      <button
        type="button"
        className="flex w-full items-center gap-3 p-3 text-left"
        aria-expanded={expanded}
        onClick={toggle}
      >
        <span
          className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[change.status]}`}
        >
          {STATUS_LABEL[change.status] ?? change.status}
        </span>
        <span className="min-w-0 grow truncate font-mono text-sm text-slate-200">
          {change.path}
        </span>
        <span className="shrink-0 text-xs text-slate-500">{expanded ? 'Hide' : 'Show diff'}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-800">
          {state?.status === 'loading' && (
            <p className="px-3 py-2 text-xs text-slate-400">Loading diff…</p>
          )}
          {state?.status === 'failed' && (
            <p className="px-3 py-2 text-xs text-rose-300" role="alert">
              {state.message}
            </p>
          )}
          {state?.status === 'loaded' && <DiffBody diff={state.diff} />}
        </div>
      )}
    </li>
  );
}

export default function ChangeReviewPanel({
  repoPath = null,
  listGitChanges,
  getGitDiff,
}: ChangeReviewPanelProps) {
  const listCall = listGitChanges ?? agentServer.listGitChanges;
  const diffCall = getGitDiff ?? agentServer.getGitDiff;
  const [state, setState] = useState<ListState>({ status: 'loading' });

  const load = useCallback(() => {
    if (!repoPath) {
      setState({ status: 'loaded', changes: [] });
      return;
    }
    setState({ status: 'loading' });
    listCall(repoPath)
      .then((changes) => setState({ status: 'loaded', changes }))
      .catch((error: unknown) => setState({ status: 'failed', message: describeError(error) }));
  }, [listCall, repoPath]);

  useEffect(load, [load]);

  return (
    <section aria-label="Change review" className="min-w-0">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Change review</h2>
        <button
          type="button"
          className="text-xs font-medium text-sky-400 underline underline-offset-2"
          onClick={load}
        >
          Refresh
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Files the agent changed in the working tree, compared against the last commit.
      </p>

      {!repoPath && (
        <p className="mt-4 text-sm text-slate-400" data-testid="no-repo">
          No repository selected. Pass <code className="font-mono">?repoPath=</code> with a path
          inside the agent-server container.
        </p>
      )}

      {state.status === 'loading' && <p className="mt-4 text-sm text-slate-400">Loading changes…</p>}

      {state.status === 'failed' && (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {state.message}
        </p>
      )}

      {state.status === 'loaded' && repoPath && state.changes.length === 0 && (
        <p className="mt-4 text-sm text-slate-400" data-testid="no-changes">
          {/* The server returns `[]` both for a clean tree and for a path that is not a git
              repository (`git_router.py:47`). The wording covers both rather than asserting the
              one the response cannot distinguish. */}
          No changes reported. The working tree is clean, or this path is not a git repository.
        </p>
      )}

      {state.status === 'loaded' && state.changes.length > 0 && (
        <>
          <p className="mt-4 text-xs text-slate-500">
            {state.changes.length} changed {state.changes.length === 1 ? 'file' : 'files'}
          </p>
          <ul className="mt-2 space-y-2">
            {state.changes.map((change) => (
              <ChangeRow
                key={change.path}
                change={change}
                repoPath={repoPath!}
                getDiff={diffCall}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
