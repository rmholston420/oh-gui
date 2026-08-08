# ADR-015 — Native-fidelity boundary: OH-GUI exposes only verified native fields, and the upstream code is the source of truth

**Status:** Ratified, with one OPEN sub-question (§ Open question)
**Lock-in phase:** Phase 0 — binding immediately on every port, surface, and spec amendment
**Supersedes:** —

## Context

Operator instruction, 2026-08-08, given as a standing constraint on all porting from Forge-OH and on
all new surfaces:

> the gui must strictly and only expose the exact inputs and outputs present in openhands (and any
> other apps used), they must be verified native fields
>
> the OpenHands API and SDK must be treated as the authoritative single source of truth, translate
> native API/events without modifying their meaning, they are non-negotiable invariants
>
> trust the OpenHands actual code over its documentation

This is not a new position so much as the generalization of three failures already recorded in this
repo, each of which cost real work:

1. **ADR-001 Amendment #1** retracted four Context claims — "remote conversations only", "no OpenAPI
   document", "ports 8000/8001", "no Node dependency" — every one taken from prose rather than the
   shipped artifact. One of them was load-bearing for the authorization boundary. The recorded
   lesson was verbatim: *"Every one of these four errors came from trusting prose over the
   artifact."* That is clause 3 of the instruction, learned retroactively and at cost.
2. **The Forge-OH donor's central defect is a native-fidelity violation.** `AgentPreset` declares
   `maxCost`, `toolAllowlist`, `loopGuard`, `systemPrompt` and `maxSteps`; the tool set is hard-coded
   at `runs.py:430-435` and none of the five is ever applied. The GUI exposed five inputs that
   corresponded to nothing downstream. An operator setting `toolAllowlist` was configuring a field
   that did not exist.
3. **`trajectory/hook.py:157-196` defaults a verdict-less stop to `SUCCESS`.** Where the native
   signal is absent, the donor manufactures a value — and the manufactured value is the favorable
   one. Aborted runs are recorded as successful.

Under Principle 8, "display is not enforcement", a control that displays and enforces nothing is
worse than an absent one. A **field** that displays and means nothing is the same failure in the
data layer, and items 2 and 3 are what it looks like in practice.

## Decision

**Every input and output surfaced by OH-GUI must trace to a verified native field of the system that
supplies it. Verification is against that system's code, not its documentation.**

1. **Native means verified in the shipped artifact.** A field is native when it has been located in
   the pinned artifact — SDK sdist, agent-server OpenAPI schema, NVML, `nvidia-smi`, Ollama's API —
   and recorded with **path and line or schema location**. Documentation, a README, a blog post, a
   changelog, or a model card is **not** verification. Where code and docs disagree, the code wins
   and the disagreement is logged.
2. **Translation preserves meaning.** An adapter may rename, retype, or reshape for transport. It
   may not merge two distinct native states into one, split one into two, reinterpret an enum, or
   change a unit without recording the conversion. A native event kind we do not yet handle is
   **unhandled and visible as such**, never silently folded into a neighbour.
3. **Absent is `null`, never a default.** Where the native signal is missing, the field is `null`
   and the surface says so. Manufacturing a value — especially the favorable one — is the
   `trajectory/hook.py` defect and is forbidden.
4. **No input without a consumer.** No control may be rendered unless the value it sets is
   demonstrably read by the system it claims to configure. A test must fail if the input exists and
   the consumer does not. This is the `AgentPreset` defect, and it is an authorization hazard
   whenever the orphaned input looks like a safety control.
5. **The upstream contract is the anti-corruption layer's only source.** ADR-001 Amendment #1 C#2
   established that a formal, contract-tested OpenAPI document exists upstream. DTOs are
   **generated and diffed** from it, not hand-written. A hand-written DTO is a second source of
   truth and is forbidden where a generated one is available.
6. **"Any other apps used" is held to the same standard.** GPU telemetry is NVML/`nvidia-smi`, not
   OpenHands, and its fields must be native NVML fields. This forecloses one item already flagged in
   the review: **GPU polling cannot produce tok/s.** Tok/s is not a GPU field; it must come from a
   native inference-server field or be `null`. It may not be computed from GPU utilization and
   presented next to native readings as though it were one.
7. **One source of truth per semantic.** Where OH-GUI re-implements upstream semantics for display,
   that mirror is a divergence risk and must be eliminated, not merely tested. This makes the open
   `KNOWN_ISSUES.md` entry on the TypeScript trust-dial mirror a **Phase 1 deletion requirement**,
   not an accepted risk.
8. **Every port entry records its native basis.** `PORTING_LEDGER.md` entries for anything carrying
   OpenHands data gain a **Native basis** field: the artifact, path, and line/schema location each
   exposed field was verified against.

## Consequences for the Forge-OH port plan

The review's verdicts mostly survive; these change:

| Item | Change under this ADR |
|---|---|
| `event_normalize.py` | Still port-early as a **reference**, now with a hard requirement: a native round-trip test per event kind, and the five unhandled kinds (`InterruptEvent`, `HookExecutionEvent`, `StreamingDeltaEvent`, `ACPToolCallEvent`, `UserRejectObservation`) surfaced as unhandled rather than dropped. The donor's bootstrap/live-relay asymmetry is now a **rule violation**, not just a logged bug |
| `AgentPreset` and any preset UI | **Excluded outright.** Canonical clause-4 violation |
| `trajectory/hook.py` | Already excluded; now excluded by rule (clause 3) |
| `GpuStrip.tsx` / `GpuChipPopover.tsx` / `gpu_monitor.py` / `nvml_sampler.py` | Still port-early. Field set must be pinned to native NVML names; any tok/s or context-pressure slot ships `null` until a native source exists (clause 6) |
| Hand-written DTOs anywhere in the donor's routers | Regenerate from the upstream OpenAPI document instead (clause 5) |
| TypeScript trust-dial mirror (`apps/gui/src/features/first-run/trust-dial.ts`) | Accepted-for-Phase-0 status stands; **Phase 1 must delete it**, not re-test it (clause 7) |

ADR-014's verification gate is unchanged and is now also an instance of clause 1: it refuses to
ratify a seam described from sdists until a hook has actually been executed against the pinned
server.

## Open question — three spec requirements may not be native fields

Flagging rather than resolving, because the answer changes Phase 1 scope and this ADR's clause 1
would otherwise be silently softened.

`docs/specs/04-authorization.md` §4.2 requires the authorization card to show:

- **"Blast radius: files, paths, network hosts, credentials touched."** Almost certainly *computed*
  from a tool call, not read from a native field.
- **"which analyzer flagged it (pattern/policy-rail/LLM/GraySwan/ensemble) plus rationale."**
  Whether analyzer identity and rationale survive as fields on the SDK's security-analyzer output is
  **unverified**.

`docs/specs/08-telemetry.md` likewise assumes derived telemetry (context pressure, tok/s).

A strict reading of clause 1 forbids all of these. The spec requires them. **Proposed resolution,
not yet ratified:** a third classification alongside NATIVE and ABSENT —

> **DERIVED** — permitted only when it (a) is computed **solely** from named native fields, each
> recorded per clause 1; (b) is visually and structurally distinguishable from a native reading in
> the UI, never interleaved as though measured; (c) becomes `null` when any input native field is
> `null`, never partially computed; (d) is listed in the port ledger with its native basis and
> formula.

**Decision needed:** adopt the DERIVED tier, or hold clause 1 strictly and amend §4.2 / spec 08 to
drop what cannot be sourced natively. I have not assumed either.

## Rationale

**Why a rule rather than case-by-case review.** All three recorded failures passed review at the
time. The `AgentPreset` fields look correct in the type definition; `trajectory`'s `SUCCESS` default
looks like defensive programming; ADR-001's four claims were drawn from official documentation. None
was caught by reading carefully — they were caught by executing or by opening the artifact. A rule
that names the artifact as the only evidence is the only version of this that works.

**Why code over documentation specifically.** Documented behavior is behavior someone intended.
`@openhands/typescript-client` documented itself as remote-only and shipped a working
`LocalConversation` from its top-level barrel. The gap between the two was an authorization bypass.

**Why "no input without a consumer" is an authorization rule and not a tidiness rule.** An operator
who sets a `toolAllowlist` believes they have constrained the agent. If nothing reads it, the belief
is false and the operator's behavior changes because of it. That is strictly worse than not offering
the control — Principle 8 and ADR-006 both.

**Alternatives rejected:**

- **Advisory guideline.** Would not have caught any of the three recorded failures.
- **Lint/type checking alone.** A hand-written DTO type-checks perfectly. The defect is that it is a
  second source of truth, which types cannot see.
- **Allow derived values freely if labelled.** Labelling is display, and Principle 8 says display is
  not enforcement. Hence the strict default plus the explicit open question, rather than a soft
  default.

## Consequences

- `docs/specs/13-hard-constraints.md` gains a v4.4 block (below) checked before every PR.
- `PORTING_LEDGER.md` entry format gains **Native basis**; existing OpenHands-carrying entries need
  backfilling before their ports proceed.
- ADR-014 is unaffected in substance; its verification gate is re-read as an instance of clause 1.
- The `KNOWN_ISSUES.md` trust-dial-mirror entry's closing condition changes from "contained by
  tests" to "deleted in Phase 1".
- Spec 04 §4.2 and spec 08 are **blocked pending the open question above** for the fields named.
- Cost, stated plainly: field-level verification with recorded provenance is slower per surface than
  reading a type definition. The three recorded failures are the argument that it is cheaper overall.

## References

- Operator instruction, 2026-08-08 (verbatim in Context)
- ADR-001 Amendment #1 — four retracted claims and the "prose over the artifact" lesson; C#2 on the upstream OpenAPI document
- ADR-006 — an inert control is worse than an absent one
- ADR-014 — authorization seam; its verification gate
- `docs/specs/01-principles.md` Principle 8; `docs/specs/04-authorization.md` §4.2; `docs/specs/08-telemetry.md`; `docs/specs/13-hard-constraints.md`
- `docs/forge-oh-code-review.md` §§1, 2, 3 — `AgentPreset` orphans, `trajectory` SUCCESS default, tok/s
- `KNOWN_ISSUES.md` — trust-dial display mirror
