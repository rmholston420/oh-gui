# ADR-003 — Single-Operator Deployment: Remove Household Multi-User Mode

**Status:** Ratified
**Lock-in phase:** Phase 0
**Supersedes:** [ADR-002](ADR-002-household-mode-phase-1.md)

## Context

`00-ground-truth.md` line 67 and `01-principles.md` Principle 11 asserted that this install
"may serve multiple household users of mixed technical proficiency, not a single expert
operator." Section 15 was written on that premise, and ADR-002 (ratified earlier the same
day) scheduled it into Phase 1.

The user has confirmed the premise is wrong: **OH-GUI is single-operator.** The operator is
the user, an expert. There is no second profile, no novice tier, and no delegation
relationship to model.

The user's phrasing was "remove the household and auth stuff." Clarification established
that "auth" was read as user authentication. `04-authorization.md` is not about
authenticating people — it authorizes **the agent's actions**. The user confirmed the
safety plane stays; only the multi-user dimension is removed.

## Decision

**1. Household multi-user mode is removed entirely.** ADR-002 is superseded before any
code was written against it. `15-household-profiles.md` moves to
`docs/specs/archive/` with a superseded banner.

**2. The authorization safety plane is retained in full.** Specifically retained:

- Trust dial and the four stops, including the custom `SecurityAnalyzerBase` subclass
  for out-of-worktree writes and the pending-action policy lock (§4.1, §4.1.1)
- Interrupt/authorization cards with Approve / Reject-with-reason / Relax-for-class (§4.2)
- Authorization audit log and session-scoped relaxation expiry (§4.2.1)
- Batching, capability manifest, emergency stop, isolation-boundary visibility
  (§4.3–§4.6)
- Vision-browser elevated-risk default (§4.7)
- `execute_tool()` bypass closure (§4.8)
- Untrusted-content provenance and structural quarantine (§4.9, `04a-prompt-injection.md`)
- Speculative-execution controls (§4.10) and stuck-state intervention (§4.11)

**3. The multi-user dimension is removed from the retained safety plane:**

| Removed | Location |
|---|---|
| Per-user default trust-dial stops seeded at profile creation | §4.1 |
| Non-technical comprehension check as a Phase 1 exit gate | §4.2 |
| `created_by` field; cross-user "assist" dual-identity logging | §4.2.1 |
| Delegated approval, in full | §4.2.2, §4.2.1, §3.2, §3.4 |
| Per-user "needs you" inbox and notification scoping | §9, §10 |
| Per-user budget ceilings and project-level pooling | §8.4 |
| Per-`created_by` Session Profile Card | §5.7 |
| Principle 11's mixed-proficiency mandate | `01-principles.md` |
| Nine household gates | `13-hard-constraints.md` |

**4. Vibe/Pro dual-lens design is retained**, on different grounds. Principle 11 justified
it as a novice accommodation; that justification is void. It survives because semantic
zoom serves one operator at different times — Vibe for supervising a routine run, Pro for
debugging a stuck one. The dual-lens exit-criterion requirement is retained; the
"non-technical household member" framing is removed.

**5. Single-operator assumption returns to `99-appendix-superseded.md`** as the *current*
position, reversing the v4.0 entry that had superseded it.

## Rationale

**Why remove rather than defer.** No code exists against ADR-002. Removing now costs one
spec pass; deferring means Phase 1 ships identity plumbing (`created_by` on three schemas,
inbox scoping, delegation routing) with exactly one possible value forever. ADR-002's
own argument — that identity is cheapest at first write — inverts cleanly: with no second
user, the cheapest identity is none.

**Why the safety plane is not multi-user machinery.** The trust dial constrains what the
*agent* may do without asking. Its counterparty is the operator, not another user. A
single-operator deployment does not weaken the case; it means the operator is the only
control between an autonomous agent and the Colossus filesystem. `04-authorization.md`
titles itself "The Missing Primitive" and Phase 1's highest priority for that reason. The
prompt-injection quarantine in `04a` is likewise orthogonal to user count — its threat
model is hostile content in fetched web pages and repository files, which is unchanged.

**Alternative considered — keep §15 dormant behind a feature flag.** Rejected. A dormant
multi-user path is untested surface that constrains every schema it touches and is
indistinguishable from dead code within two phases.

**Alternative considered — cut authorization too.** Offered and explicitly declined by the
user. Had it been chosen it would have required its own ADR recording accepted risk.

## Consequences

Files amended: `00-ground-truth.md`, `01-principles.md`, `02-repo-setup.md`,
`03-layout.md`, `04-authorization.md`, `05-plan-model.md`, `08-telemetry.md`,
`09-missing-states.md`, `10-mission-control.md`, `11-dev-plan.md`,
`12-portable-components.md`, `13-hard-constraints.md`, `99-appendix-superseded.md`,
`README.md`.

Files moved: `15-household-profiles.md` → `docs/specs/archive/`.

Other consequences:

- Phase 1 shrinks materially. Its exit criteria lose the §15 clause, the delegated-approval
  clause, and the comprehension-testing gate.
- `13-hard-constraints.md` loses nine gates; the remainder are renumbered under a v4.3
  heading.
- The first-run wizard loses its household fork (§3.4 step 2) and the delegated-approval
  walkthrough (step 7).
- The `langchain-ai/agent-inbox` reference in `12-portable-components.md` remains a valid
  donor for the single-operator "needs you" inbox; only its per-user-scoping note is cut.
- Spec version → **v4.3**.
- No `PORTING_LEDGER.md` change: nothing was ported against §15.

## Lock-in phase

Phase 0, before Phase 0 exit and before any Phase 1 code.

## References

- [ADR-001](ADR-001-integration-boundary.md), [ADR-002](ADR-002-household-mode-phase-1.md)
- `docs/specs/04-authorization.md`, `docs/specs/04a-prompt-injection.md`
- `docs/specs/archive/15-household-profiles.md`
- `docs/specs/99-appendix-superseded.md`
