# ADR-015 — Native-fidelity boundary: OH-GUI exposes only verified native fields, and the upstream code is the source of truth

**Status:** Ratified · amended 2026-08-08 (OPEN sub-question resolved) · amended 2026-08-09 (PRESENT-BUT-UNCONSUMED added to the register — see Status amendment 2)
**Lock-in phase:** Phase 0 — binding immediately on every port, surface, and spec amendment
**Supersedes:** —

## Status amendment — 2026-08-08 19:25 EDT — OPEN question resolved by verification

The open question below is **closed**. It was resolved by opening the shipped 1.41.0 SDK source
rather than by choosing between the two options I offered, and the verification **overturned my own
recommendation**. I had proposed adopting DERIVED but excluding the authorization card from it, on
the reasoning that a misread number is most dangerous where it precedes an irreversible action. That
split is wrong. The evidence inverts it: the one authorization-card item that is cleanly derivable
is blast radius, and the two items I would have preserved via a DERIVED tier are not derivable at
all — they do not exist to be derived.

All citations below are to the shipped artifact, per clause 1.

### Finding 1 — analyzer identity is not native, and is not recoverable

`SecurityAnalyzerBase.security_risk()` returns a bare `SecurityRisk` enum and nothing else
(`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/security/analyzer.py:26`). `SecurityRisk` is a four-value `str, Enum` — `UNKNOWN`,
`LOW`, `MEDIUM`, `HIGH` — with no carrier for provenance (`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/security/risk.py:13-23`).

`EnsembleSecurityAnalyzer.security_risk()` collects each child's verdict into a **local** list and
returns `max(concrete)` (`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/security/ensemble.py:80-101`). `results` is never attached to the
action, never emitted, never persisted. Which analyzer produced the winning severity is destroyed at
the return boundary.

This is stronger than "not a native field." It is **not derivable**, because DERIVED requires
computation solely from named native fields and the input does not survive anywhere downstream. No
adapter, no middleware, and no amount of recomputation recovers it. A GUI that displayed
"flagged by: policy-rail" would be manufacturing it.

### Finding 2 — "rationale" does not exist, but three native explainability fields do

There is no rationale field on the analyzer return path. `ActionEvent`, however, natively carries
`summary: str | None` — an LLM-provided ~10-word description of what the action does, whose field
description names explainability as its purpose — alongside `thought: Sequence[TextContent]` and
`reasoning_content: str | None` (`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/event/llm_convertible/action.py:26-88`). These are real,
native, and serve the operator's actual need better than an invented rationale string.

Note also that `ActionEvent.security_risk` is documented as "**The LLM's** assessment of the safety
risk of this action" (`action.py:66-69`) — it is the LLM-analyzer value, not necessarily the
ensemble's. Labelling it generically as "risk" would misstate its provenance and violate clause 2.

### Finding 3 — blast radius is legitimately DERIVED, and its inputs are native

`ActionEvent` carries `action: Action | None` (the typed tool action) and `tool_call:
MessageToolCall` with the LLM's arguments, plus `tool_name` (`action.py:40-56`). Paths, commands and
hosts are read out of typed native fields on the concrete `Action` subtype. Blast radius is a
per-tool **projection** of native fields — exactly what the DERIVED tier was drafted for.

### Finding 4 — a zero-sentinel trap in the first DERIVED value we would ship

Context pressure would be computed from `TokenUsage.per_turn_token` and `TokenUsage.context_window`.
Both are native — and both are declared `default=0` (`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/llm/utils/metrics.py:53-58`). A
native `0` is therefore **indistinguishable from "not reported."** Computed naively, context
pressure either divides by zero or silently renders 0% pressure when telemetry is merely absent —
precisely the manufactured-default failure clause 3 exists to prevent, live in the first derived
value on the list. Condition (c) is sharpened below to cover it.

## Decision — DERIVED is ratified, with five conditions

A third classification alongside NATIVE and ABSENT:

> **DERIVED** — permitted only when it:
> **(a)** is computed **solely** from named native fields, each individually verified per clause 1;
> **(b)** is visually and structurally distinguishable from a native reading, never interleaved as
> though measured;
> **(c)** becomes `null` when any input native field is `null` **or is a sentinel default that
> cannot be distinguished from an unreported value** — for numeric upstream fields declared
> `default=0`, a `0` input yields `null`, never a computed result;
> **(d)** is listed in the port ledger with its native basis and formula;
> **(e)** **on the authorization card only:** displays its native inputs inline, at their native
> field names and values, so the operator can audit the derivation instead of trusting the label.

Condition (e) answers the Principle 8 objection recorded in Rationale. My earlier concern was that
(b) is a display rule, and display is not enforcement. Condition (e) does not ask the operator to
trust styling — it puts the native readings on screen next to the derived one. A wrong derivation
becomes visible rather than merely differently coloured. This is why the authorization card gets
*stricter* treatment under DERIVED rather than exclusion from it.

## Decision — spec 04 §4.2 is amended

- **"Blast radius: files, paths, network hosts, credentials touched"** — **retained as DERIVED**,
  per-tool projection over `ActionEvent.action` / `tool_call`, subject to condition (e). One
  declared formula per tool class; a tool class without a declared projection renders `null`, not an
  empty blast radius. An empty list and an uncomputed list must not look alike.
- **"Which analyzer flagged it (pattern/policy-rail/LLM/GraySwan/ensemble)"** — **dropped.** Not
  native, not derivable (Finding 1). Substituted with what *is* native: `EnsembleSecurityAnalyzer.
  analyzers` is a model field (`ensemble.py:64-68`), so the card may show which analyzers are
  **configured**, labelled as configuration and never as attribution.
- **"plus rationale"** — **dropped as specified**, substituted with the native
  `ActionEvent.summary`, `thought`, and `reasoning_content` (Finding 2), each labelled as the LLM's
  own account of the action rather than as an analyzer's justification.
- The risk reading must be labelled to preserve its native provenance as the **LLM's** assessment
  (`action.py:66-69`), not as an unattributed verdict.

## Decision — spec 08 telemetry

- **Context pressure** — DERIVED from `per_turn_token` / `context_window`, `null` when either is `0`
  per condition (c).
- **tok/s** — unchanged from clause 6: not a GPU field. Native inference-server field or `null`.

Clause 1 is not softened by this amendment. DERIVED is a bounded exception whose every input is
still subject to clause 1 verification, and the two requirements that could not meet that bar were
removed from the spec rather than accommodated.

## Status amendment 2 — 2026-08-09 01:14 EDT — a third failure mode: the field that exists and does nothing

Clause 1 of this ADR asks one question of every field: *does it exist natively?* Verification of
`Skill.allowed_tools` shows that question is not sufficient. The field exists, is typed, is
documented in its own `Field(description=...)`, parses two spellings, and survives serialization —
and **nothing in the shipped 1.41.0 artifacts ever reads it.** It passes clause 1 and is still
unsafe to build on.

So the register gains a third classification alongside NATIVE and DERIVED.

### Finding 5 — `allowed_tools` is present, typed, documented, and inert

Declared in two places:

- `review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/skills/skill.py:271` — on `Skill`,
  described as "List of pre-approved tools for this skill," with a validator at
  `skills/skill.py:299-309` accepting a space-delimited string or a list, and frontmatter mapping
  of both `allowed-tools` and `allowed_tools` at `skills/skill.py:524-537`.
- `review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/plugin/types.py:271` — on
  `CommandDefinition` (a slash command), parsed from frontmatter at `plugin/types.py:308-342` and
  propagated into a generated `Skill` at `plugin/types.py:392`.

An exhaustive search of all four shipped packages (`openhands_sdk`, `openhands_tools`,
`openhands_workspace`, `openhands_agent_server`) for `allowed_tools`, `allowed-tools`, and
`allowedTools` returns **24 occurrences, every one of them a declaration, a parse, or a
re-serialization.** There is no read site. No tool executor, confirmation policy, security
analyzer, or agent consults it. Setting it changes nothing about what a tool call is permitted to
do.

Two further traps in the same field:

1. **Its name says restriction; its description says approval.** "Pre-approved" is
   confirmation-bypass semantics — *these need no operator prompt* — not gating semantics — *only
   these may run.* Those are opposite behaviours, and the field's identifier argues for the one its
   own documentation contradicts. Had a consumer existed, reading the name would still have been
   wrong.
2. **It is the exact shape of an attractive nuisance.** A tool allowlist per skill is a thing our
   harness genuinely wants. The field is already there, already typed, already round-trips through
   the plugin format. Wiring an enforcement path to it would have looked like using a native
   contract while in fact inventing one — the precise Forge-OH failure this ADR exists to prevent,
   made harder to spot because the field name would appear in a native artifact when audited.

**Scope of the claim, stated precisely.** This is a claim about the four packages vendored at
`review/_sdk_src/1.41.0/`, which are what we build against. A downstream OpenHands product outside
those artifacts may consume the field. That possibility does not license us to rely on it: ADR-026
D1 says we compose the published artifacts, so a behaviour absent from them is absent from our
system.

### Decision — the register gains PRESENT-BUT-UNCONSUMED

A field is **PRESENT-BUT-UNCONSUMED** when it is declared in a verified upstream artifact but has
no read site in that artifact — only declaration, parsing, and serialization.

- Such a field **may be recorded** in the native register, with its declaration site and the
  evidence of the absent consumer.
- Such a field **may not be read, written, displayed, or enforced against** by any OH-GUI surface.
  It is not a contract. It is an announcement of a contract someone may write later.
- Clause 1 is amended accordingly: verifying a field means locating **both its declaration and its
  consumer.** A declaration alone is necessary and not sufficient. Where a register entry cannot
  name a consumer, it is classified PRESENT-BUT-UNCONSUMED and no enforcement path is wired to it.
- Should a future SDK version add a consumer, the entry is re-verified at that version and
  reclassified NATIVE. Version-pinned re-verification, never assumption.

This mirrors the treatment `PROVISIONAL - UNVERIFIED` already receives under ADR-021, and the
mechanism is the same: name the defect in the register, and make the register enforceable so the
name cannot quietly rot.

### Enforcement

A new hard constraint in `docs/specs/13-hard-constraints.md` and a matching STATIC check
(`unconsumed_native_fields_not_wired`) fail the gate if any OH-GUI source references a field on the
PRESENT-BUT-UNCONSUMED list. The list starts with `allowed_tools`. Rationale for enforcing rather
than merely documenting: a documented prohibition against a field that is *useful and already
typed* survives exactly as long as nobody is in a hurry.

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

> **RESOLVED 2026-08-08 19:25 EDT** — see the Status amendment at the top of this ADR. Both, in part: DERIVED is
> ratified with a fifth condition, and §4.2 is amended to drop analyzer identity and rationale,
> which verification showed are not merely non-native but unrecoverable.


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
