# ADR-029 — The decision boundary is the plan, and Vibe/Pro are its defaults

**Status:** Ratified
**Lock-in phase:** Phase 1 · authorization slice
**Supersedes:** —

## Context

Three requirements in the Phase 1 corpus were recorded as conflicting. On inspection they
resolve through one mechanism, so they are settled together rather than in three ADRs.

**1. Autonomy (red).** `01-principles.md` REQ-01-004 reads, in full: *"Expose decision
boundaries; do not maximize autonomy."* The operator's definition of Vibe Mode is *"a
mostly/fully autonomous app factory, where i describe an app or upload a spec and it builds
it from start to finish, frontend and backend, and gets it up and running on my local
workstation."*

The conflict as originally logged was misstated, and the correction matters. REQ-01-004 does
**not** require per-action approval. It requires that decision *boundaries* be exposed. The
per-action reading comes from `04-authorization.md` §4.2 — REQ-04-011's three-button card
(Approve / Reject with reason / Approve and relax for this class), raised once per action.
The real conflict is therefore between the **card granularity** and autonomous operation, not
between the principle and Vibe Mode. An app build is thousands of actions; a card per action
at that volume is not a safety control, it is a denial of service against the operator, and
it produces the well-documented failure where a reviewer approves without reading.

**2. One product or two (red).** REQ-01-009: *"Two depth layers, one system, never two
products… semantic-zoom lenses over one shared data model."* REQ-01-011 (from ADR-003):
*"Design two lenses for one operator at different times, not for different people."* Against
this, the operator's own definitions read as two audiences: Vibe for someone describing an
app, Pro *"for advanced programmers who want maximum control of the OpenHands suite."*

**3. Review budget (yellow).** REQ-01-006 budgets *"~400 lines/session, configurable"* of
reviewed output. The operator has since stated: *"i don't generally have to look at diffs and
code because i trust you enough, what i want to see is what you are doing and the results,
only making decisions when necessary."* A line budget prices the wrong unit.

## Decision

**1. The unit of authorization is the plan, not the action.**

An approved plan carries an **envelope**. Every action the agent takes inside its envelope
executes without an authorization card. Any action that would leave the envelope raises a
card, at which point the existing §4.2 three-button interaction applies unchanged.

**2. The envelope is expressed only in mechanically checkable terms.**

An envelope is a set of allowed filesystem paths, network hosts, and tool classes. It may not
contain prose conditions, intent descriptions, or natural-language scope statements. An
envelope that cannot be evaluated by a program is not an envelope, because it can only be
enforced by the same model whose behaviour it is meant to bound.

**3. Envelope enforcement is a COMMAND-type hook returning a deterministic exit code.**

AGENT-type hooks fail open on an unparseable decision (`hooks/executor.py:343-351`, pinned
1.41.0), and `HookDecision` carries no ASK value (`hooks/types.py:35-40`). A boundary that
fails open is not a boundary. Escape from the envelope is therefore denied in a COMMAND hook
by exit code, never by an AGENT hook's advisory return.

**4. Envelope width is the trust dial, extended from task type to plan.**

REQ-04-001 already requires the dial be settable per task type. The plan envelope is that
same control at plan scope. No new control surface is introduced.

**5. Vibe and Pro are default positions on that dial, not two products.**

REQ-01-009 and REQ-01-011 are reaffirmed without amendment. The operator's audience-shaped
definitions are read as **task modes, not personas** — he is an advanced programmer *and* the
person who wants to describe an app and walk away, at different hours of the same week, which
is precisely what ADR-003 already said.

Consequently: one data model; the mode toggle is view state only; **no capability exists in
one lens and not the other**. What differs is defaults — Vibe defaults to a wide plan
envelope and high autonomy, Pro to a narrow envelope and full event detail. Both lenses can
reach both settings.

**6. The review budget is denominated in decisions, not lines.**

REQ-01-006's ~400-line budget is superseded for plan-level review: the reviewed artifact is
the plan and its envelope, and the budget constrains **cards raised per session**, not lines
of diff. The line budget survives only where a diff is the artifact under review
(`06-change-review.md`).

## Rationale

Raising the granularity of the boundary preserves every constraint at once, which no other
option does.

- REQ-01-004 is satisfied **literally**: a boundary is exposed, and autonomy is bounded rather
  than maximized. The principle never named per-action as the unit.
- The safety plane ADR-003 retained in full stays intact — trust dial, audit log, session-scoped
  relaxation expiry, emergency stop, capability manifest, structural quarantine all continue to
  apply to every action, inside the envelope or not. The envelope governs **whether the operator
  is interrupted**, never whether a control runs.
- Vibe Mode becomes buildable as specified.

Alternatives considered and rejected:

- **Keep per-action cards; drop autonomous Vibe.** Rejected: contradicts the operator's stated
  definition of the product's default mode, and REQ-01-004 does not require it.
- **Exempt Vibe Mode from authorization.** Rejected: creates exactly the failure mode where Vibe
  is the unsafe build and Pro the safe one, which violates REQ-01-009 and makes the safety plane
  a Pro-only feature.
- **Prose envelopes reviewed by the model.** Rejected under decision 2: unenforceable, and
  self-referential in the way ADR-015 clause 3 forbids.
- **Three separate ADRs.** Rejected: the three conflicts share one mechanism, and splitting them
  would let the resolutions drift apart.

## Consequences

- `04-authorization.md` gains a plan-envelope section; §4.2 cards are rescoped to envelope
  escapes. REQ-04-001's per-task-type dial extends to plan scope.
- `01-principles.md` REQ-01-004 gains a clarifying note that the boundary unit is the plan;
  REQ-01-006 is annotated as superseded for plan-level review by decision 6.
- `05-plan-model.md` must carry the envelope as a first-class field of a plan.
- The envelope escape hook is a COMMAND hook; it is blocked behind the same live agent-server
  verification ADR-014 requires, and inherits that ADR's declined-until-executed status.
- `docs/specs/COVERAGE.md`: REQ-01-004, REQ-01-006, REQ-01-009, REQ-01-011 and the §4.2
  requirements carry their status against this ADR.
- No PORTING_LEDGER change; no new port.

## Lock-in phase

Phase 1, authorization slice. Decision 3 cannot be marked verified until ADR-014's four items
execute against a live pinned agent-server on Colossus.

## References

- `docs/specs/01-principles.md` REQ-01-004, REQ-01-006, REQ-01-009, REQ-01-011
- `docs/specs/04-authorization.md` §4.1–§4.3 (REQ-04-001, REQ-04-011, REQ-04-012)
- `adrs/ADR-003-single-operator-remove-household.md` (two lenses, one operator)
- `adrs/ADR-014-authorization-enforcement-seam.md` (COMMAND-hook enforcement, unverified)
- `adrs/ADR-015-native-fidelity-boundary.md` clause 3 (no manufactured fields)
- `review/_sdk_src/1.41.0/.../hooks/executor.py:343-351`, `hooks/types.py:35-40`
