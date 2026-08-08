# Archive - Superseded Specs (Do Not Build From These)

Files in this directory are retained for provenance only. They are **not** the
authoritative spec and must never be loaded as build input.

| File | Status | Superseded by |
|---|---|---|
| OH-GUI-Master-Build-Spec-v3.md | Superseded 2026-08-08 | The v4.0/v4.1 split-file set in `docs/specs/` |

## Why this file exists

`docs/specs/99-appendix-superseded.md` exists so that no future session accidentally
re-proposes an idea already considered and rejected across the v2.0-v4.1 revision
history. The v3.0 monolith still contains several of those rejected ideas in
unmarked form, including:

- The three-layout Vibe/Standard/Pro exploration (rejected - two modes only).
- Compare mode promoted to Phase 2 (reversed - Compare mode is Phase 6).
- `framer-motion` as the current package name (stale - renamed to `motion`,
  import from `motion/react`).
- Aceternity UI / Magic UI treated as npm-installable (incorrect - copy-paste,
  vendor the source).
- The single-operator household assumption (superseded by
  `15-household-profiles.md`).
- Trust-class display treated as sufficient prompt-injection defense
  (insufficient - see `04a-prompt-injection.md` structural quarantine).

Keeping v3.0 in a sibling directory to the live spec would invite exactly the
failure `99-appendix-superseded.md` was written to prevent. It lives here instead.

## Correct read order

Always start from `docs/specs/README.md`, then `00-ground-truth.md`, then
`01-principles.md`, then only the phase file(s) relevant to the current session.
