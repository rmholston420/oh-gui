/**
 * Unit tests for the blast-radius projection (ADR-023, option B).
 *
 * The emphasis is on the four statuses staying distinguishable, because the whole point of the
 * ADR is that "we computed nothing" and "we computed an empty set" are different claims.
 */

import { describe, expect, it } from 'vitest';
import { blastRadius, normalizeActionKind, type ActionLike } from './blast-radius';

/** Build an event the way the wire actually delivers one: class name inside `action.kind`. */
const ev = (kind: string, action: Record<string, unknown> = {}, tool = 'tool'): ActionLike => ({
  action: { kind, ...action },
  tool_name: tool,
});

const MANGLED = 'openhands__tools__file_editor__definition__FileEditorAction-Output__1';

describe('normalizeActionKind', () => {
  it('reduces the mangled wire form to the bare class', () => {
    expect(normalizeActionKind(MANGLED)).toBe('FileEditorAction');
  });

  it('reduces the MCP form, whose module path differs from the tools convention', () => {
    expect(normalizeActionKind('openhands__sdk__mcp__definition__MCPToolAction-Output__1')).toBe(
      'MCPToolAction',
    );
  });

  it('passes a bare class name through unchanged', () => {
    expect(normalizeActionKind('GrepAction')).toBe('GrepAction');
  });

  it('handles an Input suffix as well as Output', () => {
    expect(normalizeActionKind('a__b__GlobAction-Input__2')).toBe('GlobAction');
  });

  it('returns null for values that are not usable kinds', () => {
    expect(normalizeActionKind(undefined)).toBeNull();
    expect(normalizeActionKind(null)).toBeNull();
    expect(normalizeActionKind('')).toBeNull();
    expect(normalizeActionKind(42)).toBeNull();
    expect(normalizeActionKind('trailing__')).toBeNull();
  });
});

describe('projections', () => {
  it('projects a single path from the mangled file-editor kind', () => {
    const r = blastRadius(ev(MANGLED, { path: '/etc/hosts', command: 'str_replace' }));
    expect(r.status).toBe('projected');
    if (r.status !== 'projected') return;
    expect(r.targets).toEqual([
      { kind: 'path', value: '/etc/hosts', nativeField: 'path', nativeValue: '/etc/hosts' },
    ]);
    // ADR-015 condition (e): the native inputs travel with the derivation.
    expect(r.readings).toEqual([
      { field: 'path', value: '/etc/hosts' },
      { field: 'command', value: 'str_replace' },
    ]);
  });

  it('reads file_path for the gemini-family edit tools', () => {
    const r = blastRadius(ev('WriteFileAction', { file_path: '/tmp/a.txt', content: 'x' }));
    if (r.status !== 'projected') throw new Error('expected projected');
    expect(r.targets.map((t) => t.value)).toEqual(['/tmp/a.txt']);
  });

  it('projects a search root for glob, and never a match set', () => {
    const r = blastRadius(ev('GlobAction', { path: '/src', pattern: '**/*.ts' }));
    if (r.status !== 'projected') throw new Error('expected projected');
    expect(r.targets).toHaveLength(1);
    expect(r.targets[0]).toMatchObject({ kind: 'search-root', value: '/src' });
    // The pattern is shown as a native reading, never expanded into files.
    expect(r.readings).toContainEqual({ field: 'pattern', value: '**/*.ts' });
    expect(JSON.stringify(r.targets)).not.toContain('**/*.ts');
  });

  it('projects the host from a browser navigation', () => {
    const r = blastRadius(ev('BrowserNavigateAction', { url: 'https://evil.test/a/b?c=d' }));
    if (r.status !== 'projected') throw new Error('expected projected');
    expect(r.targets).toEqual([
      {
        kind: 'host',
        value: 'evil.test',
        nativeField: 'url',
        // The whole URL is preserved even though only the host is projected.
        nativeValue: 'https://evil.test/a/b?c=d',
      },
    ]);
  });

  it('yields no host for an unparseable URL rather than guessing', () => {
    const r = blastRadius(ev('BrowserNavigateAction', { url: 'not a url' }));
    if (r.status !== 'projected') throw new Error('expected projected');
    expect(r.targets).toEqual([]);
    expect(r.readings).toContainEqual({ field: 'url', value: 'not a url' });
  });

  it('yields an empty projection when the path field is absent, still status projected', () => {
    // "The formula ran and found nothing" — distinct from no-projection and from unknown.
    const r = blastRadius(ev('EditAction', {}));
    expect(r.status).toBe('projected');
    if (r.status !== 'projected') return;
    expect(r.targets).toEqual([]);
    expect(r.readings).toEqual([{ field: 'file_path', value: 'null' }]);
  });
});

describe('option B: no projection still shows native inputs verbatim', () => {
  it('shows the terminal command raw and computes nothing from it', () => {
    const cmd = 'rm -rf / --no-preserve-root && docker volume prune -f';
    const r = blastRadius(ev('TerminalAction', { command: cmd, is_input: false }));
    expect(r.status).toBe('no-projection');
    if (r.status !== 'no-projection') return;
    expect(r.readings).toContainEqual({ field: 'command', value: cmd });
    expect(r.reason).toMatch(/parsing shell/i);
    // Nothing resembling a derived target may appear on a no-projection result.
    expect(r).not.toHaveProperty('targets');
  });

  it('shows the MCP payload as opaque JSON and calls the gap permanent', () => {
    const r = blastRadius(ev('MCPToolAction', { data: { path: '/secret', n: 1 } }));
    if (r.status !== 'no-projection') throw new Error('expected no-projection');
    expect(r.readings).toEqual([{ field: 'data', value: '{"path":"/secret","n":1}' }]);
    // The nested `path` must not be mistaken for a projected target.
    expect(r.reason).toMatch(/impossible in principle/i);
  });

  it('treats an indexed browser action as host-less', () => {
    const r = blastRadius(ev('BrowserClickAction', { index: 3, new_tab: false }));
    if (r.status !== 'no-projection') throw new Error('expected no-projection');
    expect(r.readings).toEqual([
      { field: 'index', value: '3' },
      { field: 'new_tab', value: 'false' },
    ]);
  });
});

describe('the two absent states are not the same state', () => {
  it('reports not-executable when action is null', () => {
    expect(blastRadius({ action: null, tool_name: 'finish' })).toEqual({
      status: 'not-executable',
    });
  });

  it('reports unknown-action for a class upstream added and we have not ruled on', () => {
    const r = blastRadius(ev('openhands__tools__quantum__definition__QuantumAction-Output__1'));
    expect(r).toEqual({ status: 'unknown-action', actionClass: 'QuantumAction' });
  });

  it('reports unknown-action when kind is missing entirely', () => {
    const r = blastRadius({ action: { path: '/x' }, tool_name: 't' });
    expect(r).toEqual({ status: 'unknown-action', actionClass: null });
  });

  it('never returns the same status for a decided-empty and an undecided class', () => {
    const decidedEmpty = blastRadius(ev('SleeptimeComputeAction'));
    const undecided = blastRadius(ev('NotARealAction'));
    expect(decidedEmpty.status).not.toBe(undecided.status);
  });
});
