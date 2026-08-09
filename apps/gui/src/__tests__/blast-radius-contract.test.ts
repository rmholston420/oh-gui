/**
 * Contract tests — these fail when *upstream* changes, not when our code does.
 *
 * Two independent sources of truth are checked, because they can drift apart from each other as
 * well as from us:
 *
 *   1. `docs/evidence/tool-action-fields.json` — every `Action` subclass in the pinned
 *      agent-server image, extracted by `scripts/verify_tool_actions.py` and bytecode-diffed
 *      against the pinned sdists. This is what the *server* can emit.
 *   2. The installed `@openhands/typescript-client` generated schema — the `Action` discriminated
 *      union. This is what the *wire* is typed as, and it is where the mangled `kind` form that
 *      broke the first revision of blast-radius.ts actually lives.
 *
 * A class present in either source with no recorded ADR-023 decision is drift, and drift must be
 * loud. The failure message names the class so the fix is to amend the ADR, not to widen a regex.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DECIDED_ACTION_CLASSES, normalizeActionKind } from '../features/authorization/blast-radius';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const evidencePath = resolve(repoRoot, 'docs/evidence/tool-action-fields.json');

const decided = new Set(DECIDED_ACTION_CLASSES);

/**
 * Locate the installed client's generated schema.
 *
 * `require.resolve` on the package is not usable here: the package ships an `exports` map that
 * does not expose `./package.json` or the raw `.d.ts`, so resolution throws. Walking up to the
 * workspace `node_modules` is the honest way in, and a missing file fails loudly rather than
 * letting the wire-coverage assertions pass vacuously.
 */
function schemaText(): string {
  const candidates = [
    resolve(here, '../../node_modules/@openhands/typescript-client/dist/generated/agent-server-schema.d.ts'),
    resolve(repoRoot, 'node_modules/@openhands/typescript-client/dist/generated/agent-server-schema.d.ts'),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (found === undefined) {
    throw new Error(
      `Installed @openhands/typescript-client schema not found. Looked in:\n  ${candidates.join('\n  ')}`,
    );
  }
  return readFileSync(found, 'utf-8');
}

/**
 * Extract the `kind` literals of the `Action` union.
 *
 * The union is sliced out by its own declaration boundaries rather than read to end-of-file: an
 * over-greedy match silently pulls in `ActionEvent` and `Agent` from the declarations that follow,
 * which is exactly the mistake that made the first manual count of this union wrong.
 */
function wireActionKinds(source: string): string[] {
  const start = source.indexOf('export type Action = ');
  expect(start, 'Action union not found in the installed client schema').toBeGreaterThan(-1);
  const rest = source.slice(start);
  // Cut at the next top-level declaration. Searching from index 1 skips this declaration's own
  // leading token. An earlier attempt cut on ';\nexport ', which never matched the real
  // formatting and swept `ActionEvent` and `Agent` into the union — the test caught it.
  const end = rest.indexOf('\nexport ', 1);
  const union = end === -1 ? rest : rest.slice(0, end);
  return [...union.matchAll(/kind:\s*'([^']+)'/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
}

describe('blast radius covers the pinned image', () => {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf-8')) as {
    actions: Record<string, unknown>;
  };
  const imageClasses = Object.keys(evidence.actions);

  it('finds the evidence file the verification script produces', () => {
    // A silently-empty evidence file would make every coverage assertion below vacuously pass.
    expect(imageClasses.length).toBeGreaterThanOrEqual(37);
  });

  it('has a recorded decision for every Action class in the image', () => {
    const undecided = imageClasses.filter((c) => !decided.has(c));
    expect(
      undecided,
      `No ADR-023 decision for: ${undecided.join(', ')}. Amend the ADR and add the class to ` +
        'PROJECTIONS or NO_PROJECTION — do not let it fall through to unknown-action.',
    ).toEqual([]);
  });

  it('records no decision for a class the image does not define', () => {
    // Guards the other direction: a stale entry left behind after upstream removes a tool would
    // otherwise sit here forever, implying coverage of something that cannot arrive.
    const orphans = [...decided].filter((c) => !imageClasses.includes(c));
    expect(orphans, `Decided but absent from the pinned image: ${orphans.join(', ')}`).toEqual([]);
  });
});

describe('blast radius covers the typed wire surface', () => {
  const kinds = wireActionKinds(schemaText());

  it('finds a plausible Action union', () => {
    expect(kinds.length).toBeGreaterThanOrEqual(30);
  });

  it('normalizes every wire kind to a decided class', () => {
    const unresolved = kinds.filter((k) => {
      const bare = normalizeActionKind(k);
      return bare === null || !decided.has(bare);
    });
    expect(
      unresolved,
      `Wire kinds with no decision: ${unresolved.join(', ')}. These arrive over the websocket ` +
        'and would render as unknown-action.',
    ).toEqual([]);
  });

  it('still exercises the mangled form, not just bare names', () => {
    // If upstream ever stops mangling, this test going quiet would hide that normalizeActionKind
    // is no longer being tested against anything real.
    const mangled = kinds.filter((k) => k.includes('__') && /-(?:Output|Input)__\d+$/.test(k));
    expect(mangled.length).toBeGreaterThan(0);
  });
});
