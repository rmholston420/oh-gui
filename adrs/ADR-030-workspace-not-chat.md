# ADR-030 — The conversation is a view over the workspace, never the workspace itself

**Status:** Ratified
**Lock-in phase:** Phase 1 · applies to every surface, all phases
**Supersedes:** —

## Context

Operator, 2026-08-09: *"the main problem with your GUI is that your developers started with a chat
interface and you are a more advanced extension of that, instead of being purpose designed based on
GUI best practices."*

The diagnosis generalizes past any one product. Chat is a **transport** that is routinely promoted
to an **architecture**. Once the message is the atomic unit of the interface, every surface
inherits the message's properties whether or not they suit the data:

1. **One linear stream.** A build has concurrent state — a running plan, a diff, a terminal, a test
   run, an envelope. Chat serializes them into a single time-ordered column, which is the least
   useful ordering for nearly all of them.
2. **Nothing is addressable.** A message is a position in a log, not an object with identity. There
   is no way to reference *the current plan*; there is only the most recent rendering of a plan,
   which may already be superseded. Every artifact is a snapshot of state that has moved on.
3. **Modality collapse.** Prose becomes the default output for things that are not prose — a
   dependency graph, a coverage matrix, a diff, a resource meter — because prose is what the
   channel carries.
4. **No direct manipulation.** The operator describes a change to something already on screen and
   waits for a re-render, instead of editing it. This is a command line with better typography.
5. **State is ephemeral by construction.** When the log is the memory, compaction *is* memory loss.

Point 5 is not hypothetical for this project. The operator's three most-repeated complaints — no
persistent memory, spec drift, and having to re-establish context every session — are one complaint
wearing three hats: **the durable state lives somewhere that is not a durable state store.**

This is also the same conclusion ADR-028 reached from the corpus side (requirements need permanent
identity or they drift) arriving from the interaction side. Two independent derivations.

## Decision

**1. The workspace is a set of durable, addressable objects. The conversation is a view over them.**

At minimum: `plan`, `envelope`, `run`, `requirement`, `change`, `session`. Each has a stable id, a
canonical view, and a current value that is read from the store — never reconstructed by scrolling.

**2. No object's authoritative state may live only in the transcript.**

If a surface renders state, that state is read from the store. A rendered message is a *projection*
and is permitted to be stale; the object is not. Where a projection can be stale, it must be
visibly identified as a point-in-time rendering.

**3. The transcript is append-only narration and carries no authority.**

Nothing may be recovered by parsing prior messages. Compaction, truncation, or loss of the
transcript must not change the value of any object.

**4. Output modality is chosen by the data, not by the channel.**

A graph renders as a graph, a diff as a diff, a matrix as a matrix, a measurement as a meter. Prose
is a legitimate choice only where the content is prose. "It was easier to emit text" is not a
reason.

**5. Direct manipulation where the object supports it.**

An editable object is edited in place. Editing step 3 of a plan means editing step 3 — not
describing the edit and awaiting a re-render. Approve/reject on a whole artifact is acceptable only
where the artifact is genuinely atomic.

**6. Concurrent views with spatial persistence.**

Surfaces that are simultaneously relevant are simultaneously visible, and keep their position
across renders and sessions. A surface must not move because something else emitted output.

**7. Free-text input is retained, and demoted.**

Unbounded natural-language input is genuinely valuable — it expresses intents no designer
anticipated a control for — and is **not** removed. It is one input among several, and it may
never be the only route to an operation that has a dedicated surface. The failure mode being
prohibited is not *having* a chat box; it is the chat box acting as the window manager.

## Rationale

The alternative — a chat surface extended with rich attachments — is what the operator identified
as the defect, and it fails specifically at scale: the more state a build accumulates, the worse a
linear log serves it. OH-GUI's whole premise (ADR-027: OpenHands is the harness; we supply the
surface) is that the surface layer is the contribution. Inheriting chat's architecture by default
would make the contribution an incremental one.

Rejected alternatives:

- **Chat-primary with rich cards.** Rejected: cards inside a log are still positions in a log. The
  addressability and staleness problems survive intact.
- **No conversational input at all.** Rejected under decision 7: discards the one thing chat is
  genuinely best at, and every anticipated-control-only interface fails on the unanticipated
  request.
- **Defer the question to a later phase.** Rejected: this is a foundational posture. Every surface
  built before it is settled would need rebuilding, and the operator has stated that important
  decisions are exactly what get dropped across spec iterations.

## Consequences

- `03-layout.md` must define the object set and their canonical views, and state which surfaces are
  concurrent. This is the largest downstream edit.
- `05-plan-model.md`: a plan is a durable object with an id, per ADR-029's envelope field.
- `docs/specs/10-mission-control.md:5` describes condensation as a collapsed **transcript** pane.
  That remains valid — it is narration being condensed, which is exactly what decision 3 says the
  transcript is for.
- ADR-029's plan-level authorization presumes an addressable plan; this ADR supplies it.
- A new hard constraint is owed: no surface reads authoritative state from message history. It is
  recorded **DEFERRED to Phase 1** rather than half-built, per ADR-028 amendment 1 clause 3.
- Non-goal: this ADR does not specify visual design (`07-visual-design.md`) or name the surfaces.
  It constrains what a surface may be, not what it looks like.

## Lock-in phase

Phase 1. Binding on every surface from the first one built; retrofitting is the cost this ADR
exists to avoid.

## References

- `docs/specs/01-principles.md` REQ-01-001 (never a bare chat box as the only input surface) —
  decision 7 is that principle generalized from input to the whole interface
- `docs/specs/03-layout.md`, `docs/specs/05-plan-model.md`, `docs/specs/10-mission-control.md`
- `adrs/ADR-027-openhands-is-the-harness.md` (the surface layer is our contribution)
- `adrs/ADR-028-living-specs-requirement-ids-and-coverage.md` (same conclusion, corpus side)
- `adrs/ADR-029-plan-level-decision-boundary-and-lens-defaults.md` (presumes an addressable plan)
