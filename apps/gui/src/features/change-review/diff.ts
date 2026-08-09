/**
 * Line diff over the two whole files the server returns (`GitDiff`).
 *
 * The agent-server hands back `original` and `modified` in full rather than a unified diff, so the
 * client computes the difference. This is a plain longest-common-subsequence diff -- the same
 * basis as `diff -u`, without the heuristics real git applies for large files.
 *
 * A dependency was the obvious alternative. This is ~60 lines, has no transitive tree to audit,
 * and the operator reviews their own machine's code with it: for that, a small readable
 * implementation beat pulling a package in.
 */
export type DiffLineKind = 'context' | 'added' | 'removed';

export interface DiffLine {
  readonly kind: DiffLineKind;
  /** 1-based line number in the original file; null for an added line. */
  readonly originalLine: number | null;
  /** 1-based line number in the modified file; null for a removed line. */
  readonly modifiedLine: number | null;
  readonly text: string;
}

function splitLines(text: string): string[] {
  if (text === '') return [];
  // A trailing newline terminates the last line rather than starting an empty one.
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Classic LCS table. O(n*m); files this UI shows are source files, not datasets. */
function lcsLengths(a: readonly string[], b: readonly string[]): Uint32Array[] {
  const table: Uint32Array[] = Array.from(
    { length: a.length + 1 },
    () => new Uint32Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

export function diffLines(original: string | null, modified: string | null): DiffLine[] {
  const a = splitLines(original ?? '');
  const b = splitLines(modified ?? '');
  const table = lcsLengths(a, b);
  const out: DiffLine[] = [];

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'context', originalLine: i + 1, modifiedLine: j + 1, text: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: 'removed', originalLine: i + 1, modifiedLine: null, text: a[i] });
      i += 1;
    } else {
      out.push({ kind: 'added', originalLine: null, modifiedLine: j + 1, text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    out.push({ kind: 'removed', originalLine: i + 1, modifiedLine: null, text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    out.push({ kind: 'added', originalLine: null, modifiedLine: j + 1, text: b[j] });
    j += 1;
  }
  return out;
}

export interface DiffStat {
  readonly added: number;
  readonly removed: number;
}

export function summarise(lines: readonly DiffLine[]): DiffStat {
  return {
    added: lines.filter((line) => line.kind === 'added').length,
    removed: lines.filter((line) => line.kind === 'removed').length,
  };
}

/**
 * Collapse long unchanged stretches, keeping `context` lines of padding around each change.
 * Returns segments so the UI can render a "N unchanged lines" marker between them.
 */
export interface DiffHunk {
  readonly lines: readonly DiffLine[];
  /** Unchanged lines skipped immediately before this hunk. */
  readonly skippedBefore: number;
}

export function toHunks(lines: readonly DiffLine[], context = 3): DiffHunk[] {
  const changed = lines
    .map((line, index) => (line.kind === 'context' ? -1 : index))
    .filter((index) => index >= 0);
  if (changed.length === 0) return [];

  const hunks: DiffHunk[] = [];
  let start = Math.max(0, changed[0] - context);
  let end = Math.min(lines.length - 1, changed[0] + context);
  let previousEnd = -1;

  for (const index of changed.slice(1)) {
    if (index - context <= end + 1) {
      end = Math.min(lines.length - 1, index + context);
      continue;
    }
    hunks.push({ lines: lines.slice(start, end + 1), skippedBefore: start - previousEnd - 1 });
    previousEnd = end;
    start = Math.max(0, index - context);
    end = Math.min(lines.length - 1, index + context);
  }
  hunks.push({ lines: lines.slice(start, end + 1), skippedBefore: start - previousEnd - 1 });
  return hunks;
}
