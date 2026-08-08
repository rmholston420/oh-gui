import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Enforces ADR-001 item 4 and Amendment #1 independently of ESLint.
 *
 * ESLint is the primary gate, but a rule can be silenced with an inline disable
 * comment. Principle 8 says display is not enforcement; the same logic applies to a
 * gate that the code being gated can switch off. This test scans source text, so a
 * lint-disable does not defeat it.
 *
 * What is forbidden: any RUNTIME import of the Agent Server client or a cloud LLM SDK.
 * Type-only imports (`import type ...`) are allowed - they are erased at build time,
 * so nothing reaches the bundle.
 */
const SRC = new URL('../', import.meta.url).pathname;

const FORBIDDEN_SPECIFIERS = [
  '@openhands/typescript-client',
  '@openrouter/sdk',
  'framer-motion',
];

/** `import ... from 'x'` / `export ... from 'x'` / `require('x')` / `import('x')`. */
function findRuntimeImports(source: string): string[] {
  const withoutTypeImports = source
    .replace(/^\s*import\s+type\s[\s\S]*?from\s*['"][^'"]+['"];?/gm, '')
    .replace(/^\s*export\s+type\s[\s\S]*?from\s*['"][^'"]+['"];?/gm, '');

  const hits: string[] = [];
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of withoutTypeImports.matchAll(re)) {
      const spec = m[1];
      if (spec !== undefined) hits.push(spec);
    }
  }
  return hits;
}

function isForbidden(spec: string): boolean {
  return FORBIDDEN_SPECIFIERS.some((f) => spec === f || spec.startsWith(`${f}/`));
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('frontend/agent-server import boundary', () => {
  it('detector catches a runtime import (self-test)', () => {
    const bad = `import { LocalConversation } from '@openhands/typescript-client';`;
    expect(findRuntimeImports(bad).filter(isForbidden)).toEqual([
      '@openhands/typescript-client',
    ]);
  });

  it('detector catches a subpath, a require, and a dynamic import (self-test)', () => {
    const bad = [
      `import x from '@openhands/typescript-client/llm';`,
      `const ws = require('@openrouter/sdk');`,
      `await import('framer-motion');`,
    ].join('\n');
    expect(findRuntimeImports(bad).filter(isForbidden).sort()).toEqual([
      '@openhands/typescript-client/llm',
      '@openrouter/sdk',
      'framer-motion',
    ]);
  });

  it('detector allows type-only imports (self-test)', () => {
    const ok = `import type { AgentServerSchema } from '@openhands/typescript-client';`;
    expect(findRuntimeImports(ok).filter(isForbidden)).toEqual([]);
  });

  it('no source file imports the Agent Server client or a cloud LLM SDK at runtime', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC)) {
      for (const spec of findRuntimeImports(readFileSync(file, 'utf8'))) {
        if (isForbidden(spec)) violations.push(`${relative(SRC, file)} -> ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
