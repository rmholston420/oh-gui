# OH-GUI Master Build Spec v4.3 - Split-File Edition

> **v4.3 (2026-08-08) - read [ADR-001](../../adrs/ADR-001-integration-boundary.md) before
> any other file.** OH-GUI is a **standalone application** with a **Python middleware**.
> OpenHands is a pinned runtime dependency and its source is never modified. Agent Canvas
> is a **donor**, not a base. This supersedes the "EXTEND, not fork / extend in place"
> premise that appears throughout 00-ground-truth.md and 02-repo-setup.md. Amended files
> carry inline v4.3 banners.

This spec was split from a single 103KB monolith (v3.0) into per-section files so that
a single Perplexity Computer session (or a Qwen3 27B-35B local model) can load, reason
over, and execute against one phase at a time without exceeding practical context budgets.

## How to use this directory

0. Read adrs/ADR-001-integration-boundary.md first - it supersedes the architecture
   premise of several files below.
1. Read 00-ground-truth.md next, always, in every session.
2. Read 01-principles.md next.
3. Load ONLY the phase file(s) relevant to your current work session (see table below).
4. 13-hard-constraints.md is machine-checkable - run it before every PR.
5. 99-appendix-superseded.md exists so you never accidentally resurrect a rejected idea.

## File index and phase mapping

| File | Phase | Load when working on |
|---|---|---|
| 00-ground-truth.md | always | Repo state, SDK primitives, deployment profile |
| 01-principles.md | always | Any UX decision |
| 02-repo-setup.md | Phase 0 | Initial checkout, baseline metrics |
| 03-layout.md | Phase 0/4 | Vibe/Pro lens, responsiveness, first-run |
| 04-authorization.md | Phase 1 | Trust dial, authorization cards, audit log |
| 04a-prompt-injection.md | Phase 1 | Untrusted-content quarantine (NEW v4.0) |
| 05-plan-model.md | Phase 3 | Plan/Task/Attempt schema, drift, rewind/fork |
| 06-change-review.md | Phase 1/2 | Diff workbench, scope-shape, security checklist |
| 07-visual-design.md | Phase 4 | Palette, motion, accessibility |
| 08-telemetry.md | Phase 1/5 | GPU telemetry, model profiles, budget |
| 09-missing-states.md | Phase 5 | Disconnects, error classes, notifications |
| 10-mission-control.md | Phase 5 | Context Inspector, air-gapped mode |
| 11-dev-plan.md | reference | Full phase-by-phase build order |
| 12-portable-components.md | reference | What to port vs build (UPDATED v4.0) |
| 13-hard-constraints.md | always, pre-PR | Machine-checkable gate list |
| 14-spec-wizard.md | Phase 0/1 boundary | Natural-language-to-spec conversion |
| 99-appendix-superseded.md | reference | Rejected ideas, do not resurrect |

## What changed v4.1 to v4.3

- ADR-001 ratified: standalone app over the Agent Server API; OpenHands never modified.
- Middleware language decided: Python (owns the entire policy plane).
- Agent Canvas reclassified from base to donor source; vendoring logged in PORTING_LEDGER.md.
- "Extend in place, never duplicate" gate retired; six v4.3 gates added to 13-hard-constraints.md.
- 02-repo-setup.md items 1-2 replaced with dependency-pinning procedure.
- Options A/B/C and the TypeScript-middleware alternative recorded in 99-appendix-superseded.md.
- ~~ADR-002 ratified: household multi-user mode ships in **Phase 1**, not Phase 3.~~ **SUPERSEDED in v4.3 by ADR-003 - household mode removed entirely.**
- MIT LICENSE + NOTICE added; repo layout fixed as apps/gui + services/middleware.
- 05-plan-model.md and 06-change-review.md precursor sections reframed donor-side.

## What changed v3.0 to v4.0

- Split into 17 files from one 103KB document.
- Section 4.9.1 added: structural quarantine for untrusted content.
- Section 4.1 trust-dial table now includes UNKNOWN row and names threshold/confirm_unknown params.
- Motion stack corrected: framer-motion renamed to motion, import motion/react; Aceternity/Magic UI reclassified as vendored copy-paste source.
- Section 8.4 model profiles gain deterministic_replay boolean; non-determinism disclosure now conditional.
- Section 6.4.1 scope-shape review promoted from Phase 2 to Phase 1 exit criteria.
- ~~Section 15 Multi-User Household Profiles added.~~ **Removed in v4.3 by ADR-003.**
- Section 12 portable components updated with verified GitHub sources and actual API shapes.
- Section 0 archival status re-verified and confirmed accurate.

## What changed v4.2 to v4.3

- **ADR-003 ratified: single-operator deployment.** ADR-002 superseded before any code was
  written against it. `15-household-profiles.md` moved to `archive/`.
- Removed everywhere: profiles, proficiency tiers, `created_by`, assist mode, delegated
  approval (4.2.2), per-user inbox/notification scoping, per-user budget ceilings, the
  household wizard fork, and nine household gates in `13-hard-constraints.md`.
- **The authorization safety plane is retained in full.** `04-authorization.md` authorizes
  the *agent's actions*; it is not user authentication. Trust dial, authorization cards,
  capability manifest, emergency stop, `execute_tool()` closure, prompt-injection
  quarantine, and audit log all remain Phase 1's highest priority.
- Principle 11 rewritten: two lenses for one operator at different times, not for different
  people. The both-lenses exit requirement survives.
- ~~Phase 0 baseline model set fixed: `qwen3.6:27b` (planner) + `qwen3-coder:30b` (coder).~~
  **Superseded 2026-08-08 (ADR-005 Amendment #6):** planner `qwen3.6:27b` + coder
  `qwen3.6:35b-a3b-mtp-q4_K_M`. The "dense" qualifier is retired - the selected coder is MoE.
