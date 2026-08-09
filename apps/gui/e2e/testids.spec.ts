import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * A fabricated test id is invisible to `tsc` and to vitest: it is just a string, and the only
 * thing that rejects it is a live run, minutes later and usually against a queued GPU. This test
 * fails in milliseconds instead.
 *
 * `plugin-card-oh-gui` was asserted in a live spec and had never existed in the source.
 */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

test('@static every test id asserted in an e2e spec exists in the source', () => {
  const root = new URL('..', import.meta.url).pathname;
  const source = walk(join(root, 'src'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  // Some ids are built from template literals, e.g. `cell-${id}-${risk}-${scope}`. Turn each into
  // a pattern so a legitimate dynamic id is not reported. A guard that cries wolf gets ignored,
  // which is worse than no guard.
  const dynamic = [...source.matchAll(/data-testid=\{`([^`]+)`\}/g)].map((match) => {
    const escaped = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped.replace(/\\\$\\\{[^}]*\\\}/g, '[^\\s]+')}$`);
  });

  const specs = readdirSync(join(root, 'e2e')).filter((name) => name.endsWith('.spec.ts'));
  const missing: string[] = [];

  for (const spec of specs) {
    const text = readFileSync(join(root, 'e2e', spec), 'utf8');
    for (const match of text.matchAll(/getByTestId\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
      const id = match[1];
      const isStatic = source.includes(`"${id}"`) || source.includes(`'${id}'`);
      if (!isStatic && !dynamic.some((pattern) => pattern.test(id))) {
        missing.push(`${spec}: ${id}`);
      }
    }
  }

  expect(missing, 'test ids asserted in e2e specs but absent from src/').toEqual([]);
});
