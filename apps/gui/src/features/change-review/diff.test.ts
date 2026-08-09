import { describe, expect, it } from 'vitest';
import { diffLines, summarise, toHunks } from './diff';

const text = (lines: string[]) => lines.join('\n') + '\n';

describe('diffLines', () => {
  it('finds the single changed line and leaves the rest as context', () => {
    const result = diffLines(text(['a', 'b', 'c']), text(['a', 'B', 'c']));
    expect(result.map((line) => line.kind)).toEqual(['context', 'removed', 'added', 'context']);
    expect(result[1]).toMatchObject({ text: 'b', originalLine: 2, modifiedLine: null });
    expect(result[2]).toMatchObject({ text: 'B', originalLine: null, modifiedLine: 2 });
  });

  it('treats a null original as a wholly added file', () => {
    const result = diffLines(null, text(['one', 'two']));
    expect(result.every((line) => line.kind === 'added')).toBe(true);
    expect(summarise(result)).toEqual({ added: 2, removed: 0 });
  });

  it('treats a null modified as a wholly deleted file', () => {
    const result = diffLines(text(['one', 'two']), null);
    expect(summarise(result)).toEqual({ added: 0, removed: 2 });
  });

  it('reports no changes when both sides match', () => {
    expect(summarise(diffLines(text(['x']), text(['x'])))).toEqual({ added: 0, removed: 0 });
  });

  it('does not invent a trailing empty line from the terminating newline', () => {
    // 'a\n' is one line, not two. Getting this wrong shows a phantom change on every file.
    expect(diffLines('a\n', 'a\n')).toHaveLength(1);
    expect(diffLines('', '')).toHaveLength(0);
  });

  it('distinguishes a missing trailing newline from a matching file', () => {
    expect(summarise(diffLines('a\nb\n', 'a\nb'))).toEqual({ added: 0, removed: 0 });
  });

  it('keeps line numbers aligned across an insertion', () => {
    const result = diffLines(text(['a', 'c']), text(['a', 'b', 'c']));
    const last = result[result.length - 1];
    expect(last).toMatchObject({ kind: 'context', originalLine: 2, modifiedLine: 3 });
  });

  it('handles a full rewrite without pairing unrelated lines', () => {
    const result = diffLines(text(['a', 'b']), text(['x', 'y']));
    expect(summarise(result)).toEqual({ added: 2, removed: 2 });
  });
});

describe('toHunks', () => {
  it('returns nothing when there is no change', () => {
    expect(toHunks(diffLines(text(['a', 'b']), text(['a', 'b'])))).toEqual([]);
  });

  it('collapses a long unchanged stretch between two edits', () => {
    const original = Array.from({ length: 40 }, (_, i) => `line ${i}`);
    const modified = [...original];
    modified[1] = 'CHANGED FIRST';
    modified[38] = 'CHANGED LAST';
    const hunks = toHunks(diffLines(text(original), text(modified)));
    expect(hunks).toHaveLength(2);
    expect(hunks[1].skippedBefore).toBeGreaterThan(20);
  });

  it('merges edits that are closer together than twice the context', () => {
    const original = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const modified = [...original];
    modified[5] = 'A';
    modified[7] = 'B';
    expect(toHunks(diffLines(text(original), text(modified)))).toHaveLength(1);
  });
});
