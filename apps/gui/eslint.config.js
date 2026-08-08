import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * ADR-001 Amendment #1 / KNOWN_ISSUES 2026-08-08: `@openhands/typescript-client`
 * exports a FUNCTIONAL `LocalConversation` plus its own llm/ and security/ modules.
 * Nothing in the package stops frontend code driving an agent loop that bypasses the
 * middleware policy plane. This gate is that missing control.
 *
 * Type-only imports are permitted: the generated Agent Server schema is useful for
 * typing middleware DTOs, and types are erased at build time so nothing ships.
 */
const FORBIDDEN = [
  {
    name: '@openhands/typescript-client',
    message:
      'Runtime import forbidden (ADR-001 item 4). The frontend talks only to the OH-GUI middleware. Type-only imports are allowed: use `import type`.',
    allowTypeImports: true,
  },
  ...['llm', 'security', 'conversation/local-conversation', 'workspace'].map((sub) => ({
    name: `@openhands/typescript-client/${sub}`,
    message: `Forbidden subpath "${sub}" (ADR-001 Amendment #1). Policy and LLM access belong to the Python middleware, never the browser.`,
    allowTypeImports: true,
  })),
  {
    name: '@openrouter/sdk',
    message:
      'Cloud LLM SDK. This project is local-only (Ollama on Colossus). An outbound OpenRouter request is a defect.',
    allowTypeImports: false,
  },
  {
    name: 'framer-motion',
    message: 'Renamed in 2025 and unmaintained. Use `motion/react` (docs/specs/07-visual-design.md 7.2.1).',
    allowTypeImports: false,
  },
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-restricted-imports': ['error', { paths: FORBIDDEN }],
    },
  },
  {
    // The boundary test deliberately names the forbidden specifiers as string data.
    files: ['src/__tests__/**'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
);
