# ADR-018 — The Hard Constraints Checklist gets an executable runner, or it is not a gate

**Status:** Ratified
**Lock-in phase:** Phase 1 (Authorization slice) — binding on every phase thereafter
**Supersedes:** —

## Context

`docs/specs/13-hard-constraints.md` opens with "Verify Before Every PR" and `README.md` describes it
as "machine-checkable — run it before every PR". Neither statement is true at `22a70a0`:

```
$ grep -rln "hard-constraints\|13-hard" scripts/ apps/gui/src apps/gui/e2e services
apps/gui/src/features/first-run/FirstRunWizard.tsx
```

The single hit is an unrelated comment. The file carries roughly sixty `- [ ]` gates and **not one
of them is executed by anything**. They are enforced by an agent or an operator reading the file and
remembering, which is precisely the failure mode ADR-006 was written about: a control that ships
looking correct and fires on nothing. Principle 8 makes the same point at the level of the product
("display is not enforcement"); it applies with equal force to the project's own governance.

Two facts make a naive fix wrong.

**Not every gate is statically checkable.** "Accept All is never the visually heaviest button on any
review screen" is a real constraint with no mechanical test. Writing a stub that always passes would
be worse than the status quo, because it would convert an acknowledged gap into a green check.

**Most gates describe surfaces that do not exist yet.** At `22a70a0` the frontend is a first-run
wizard and the middleware denies everything. A runner that fails on every unbuilt surface is noise
and will be disabled within a day.

## Decision

Ship `scripts/check-hard-constraints.py`. It parses `docs/specs/13-hard-constraints.md` as the
**source of truth** and reconciles it against a registry that assigns every gate exactly one tier.

**Tiers.**

| Tier | Meaning | Runner behaviour |
|---|---|---|
| `STATIC` | Mechanically checkable against the tree as it stands | Executes a named predicate. Failure is red. |
| `PHASE` | Checkable only once a named phase's surface exists | Records the owning phase. Not run. |
| `WITNESS` | Requires an operator to observe something | Records what must be witnessed. Not run. |

**The four properties that make this a gate rather than a list.**

1. **Drift fails the build.** A `- [ ]` line in the spec with no registry entry is a red failure, and
   so is a registry entry matching no spec line. A gate cannot be added to the spec and quietly
   ignored, and it cannot be deleted from the spec while its registry entry lingers as false comfort.
2. **A closed phase cannot leave a `PHASE` gate unproven.** When a phase closes, every `PHASE` gate
   it owns must have been promoted to `STATIC` or `WITNESS` with evidence. A `PHASE` gate whose
   owning phase is already closed is a red failure. This is the clause that stops deferral from
   becoming disposal.
3. **`WITNESS` is not an escape hatch.** Each `WITNESS` gate must name the artefact that records the
   observation. An unnamed one is a red failure.
4. **Retired gates are matched explicitly.** Struck lines (`~~...~~ **RETIRED**`) are parsed and must
   carry a `RETIRED` registry tier naming the ADR that retired them, so a retirement cannot be
   smuggled in by editing prose.

**Output is colour-coded** — green pass, yellow deferred-with-owner, red failure — and the runner
exits non-zero on any red. It is wired into `scripts/verify-local.sh` and gains a
`--constraints-only` flag.

**The runner is itself mutation-tested.** Each of the four properties above is proven by planting a
violation and observing red. A gate runner that has never been seen to fail is not a gate runner.

## Rationale

The alternative considered was **hand-writing a test per constraint in the existing suites** as each
surface ships. Rejected: it produces no reconciliation against the spec file, so the spec and the
tests drift silently, and it gives no answer to "which constraints are currently unproven?" — the
question that actually matters at a phase gate.

A second alternative was **deleting the un-checkable gates** to make the file fully executable.
Rejected: "Accept All is never the heaviest button" is a genuine product requirement whose enforcement
is human review. The honest move is to record that it is human-enforced and name where the review is
recorded, not to pretend the requirement does not exist.

Tiering, rather than a boolean checked/unchecked, is what lets the file be simultaneously honest
about what is proven and enforceable about what is deferred.

## Consequences

- New: `scripts/check-hard-constraints.py`, `scripts/hard_constraints_registry.py`,
  `scripts/tests/test_check_hard_constraints.py`.
- `scripts/verify-local.sh` gains a constraints stage and `--constraints-only`.
- `docs/specs/13-hard-constraints.md` gains a header block pointing at the runner. **The gate text
  itself is not edited** — the runner adapts to the spec, never the reverse.
- Every future ADR that adds a gate must add its registry entry in the same commit, or the runner
  goes red.
- Phase close procedure gains one step: no `PHASE` gate may remain owned by the closing phase.

## Lock-in phase

Phase 1. The runner lands before any further Phase 1 surface, so every subsequent Phase 1 commit is
reconciled against the checklist from its first line.

## References

- `docs/specs/13-hard-constraints.md`
- `adrs/ADR-006-out-of-worktree-stop-elevates-to-high.md` (the inert-control precedent)
- `docs/specs/01-principles.md` Principle 8
- `KNOWN_ISSUES.md` 2026-08-08 item 1
