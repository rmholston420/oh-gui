// Minimal config with ONE job: catch identifiers that do not resolve.
//
// `node --check` validates syntax only, so an undefined identifier is a runtime error it cannot
// see. That gap shipped twice in one day — `gate` (a scripted edit whose anchor never matched) and
// `ws` — each of which would have thrown in the finally block of all 16 cells AFTER every agent
// run had completed and been paid for. Enforced by tests/test_no_undefined_identifiers.py.
export default [{
  files: ["**/*.mjs"],
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: "module",
    globals: {
      process: "readonly", console: "readonly", URL: "readonly", Buffer: "readonly",
      fetch: "readonly", global: "readonly",
      setTimeout: "readonly", clearTimeout: "readonly",
      setInterval: "readonly", clearInterval: "readonly",
    },
  },
  rules: {
    "no-undef": "error",
    // An import that is never called is the same defect as an identifier that does not exist:
    // both mean the code I believed was running is not. pointAtModel sat imported-and-unused
    // through a matrix run because an automated edit anchored on text I had not re-read.
    "no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_" }],
  },
}];
