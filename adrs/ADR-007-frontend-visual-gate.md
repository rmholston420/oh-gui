# ADR-007 — The frontend gate renders in a real browser

**Status:** Ratified
**Lock-in phase:** Phase 0
**Supersedes:** —

## Context

The first-run wizard passed 25 Vitest tests on a build that had three visible defects: outcome cells
wrapping "Pauses for you" onto two lines in every row of the decision table, risk chips at
`text-slate-500` failing small-text contrast against the `#070d1f` background, and the policy
expression breaking mid-call. All three were found by rendering the page and looking at it.

None were findable by the unit suite. jsdom has no layout engine and no colours, so wrapping,
clipping, and contrast are invisible to it by construction. Relying on someone remembering to look
is not a control; the operator directed that Playwright be used to check the frontend every time.

## Decision

`apps/gui/e2e/wizard.spec.ts` runs every wizard step in headless Chromium and asserts:

1. **Contrast and accessibility** — `@axe-core/playwright` at `wcag2aa` + `wcag21aa`; any
   serious/critical violation fails the run.
2. **No clipped text** — any element whose computed `overflow` is `hidden`/`clip` while its scroll
   size exceeds its client size fails. `auto`/`scroll` are deliberate scrollers and are exempt, as
   are 1px `sr-only` boxes, which are clipped by design.
3. **No horizontal page scroll** at a narrow (900px) viewport.
4. **The rendered table matches the predicate** — the same assertions as the unit test, against the
   real DOM.
5. **A full-page screenshot of every step** is attached to the report, so the screens stay
   reviewable rather than merely asserted about.

`npm run verify` = `gate` (lint, unit, tsc, build) + `test:e2e`. `npm run e2e:setup` installs the
browser. `gate` stays browser-free so it remains fast; `verify` is the pre-commit command for any
change touching the frontend.

Both assertions were proven to fail on a real defect before being accepted: reverting the risk chip
to a dim slate produced a `color-contrast` failure naming all five rows, and clamping the table
wrapper to `h-16 overflow-hidden` produced a clipping failure. The first version of the clipping
check passed that probe — it skipped every element with non-visible overflow, i.e. exactly the
clipping case — and was rewritten until it failed correctly.

## Rationale

The defect class is real and recurring, was invisible to the existing suite, and the check is cheap
(~6s). Screenshot-diffing was rejected: it pins pixels, so it fails on every intentional design
change and trains people to re-baseline without looking, which is how visual gates die. Asserting
properties — readable, unclipped, agrees with the predicate — survives redesign.

This runs locally via `npm run verify`, not in GitHub Actions, per the project's standing constraint
against GitHub-native CI.

## Consequences

- New devDependencies: `@axe-core/playwright`, `axe-core`.
- `apps/gui/e2e/smoke.spec.ts` (placeholder) deleted.
- Every new frontend surface is expected to add its steps to this spec; contrast is now enforced
  rather than reviewed, which partially discharges the contrast gates in
  `docs/specs/07-visual-design.md` ahead of Phase 4.
- Playwright browsers must be installed once per machine (`npm run e2e:setup`).

## Lock-in phase

Phase 0.

## References

- `apps/gui/e2e/wizard.spec.ts`, `apps/gui/package.json`
- `docs/specs/07-visual-design.md`
- BUILD_LOG 2026-08-08 09:52 EDT
