# ADR-021 — Where generated DTOs end and OH-GUI's own contract begins, and what `ipc/schema.py` currently is

**Status:** Ratified
**Lock-in phase:** Phase 1 — generator lands with ADR-014's verification harness
**Supersedes:** —

## Context

`13-hard-constraints.md` §v4.4, from ADR-015, contains:

> - [ ] DTOs for the Agent Server are generated from the upstream OpenAPI document and diffed, never
>   hand-written.

`services/middleware/src/ohgui_middleware/ipc/schema.py` is hand-written. Nothing in the repo says
whether that gate reaches it, and shipping a slice whose compliance is undetermined is not
acceptable at a native-fidelity boundary.

Inspecting the file rather than reasoning about it produces a sharper finding than the one recorded
in `KNOWN_ISSUES.md`. Its module docstring reads:

> The request mirrors the SDK's documented `pre_tool_use` stdin envelope field-for-field and adds
> nothing.

Two problems, both mine, both from the slice already merged to `main`.

**First, the word "documented".** ADR-015's first gate requires every exposed field to trace to a
*verified native* field "with the artifact path and line/schema location recorded", and states
plainly that documentation is not verification. `AuthorizeRequest`'s six fields record no artifact
path and no line. They were written from the hook documentation, not read out of pinned 1.41.0
source. This is the identical defect the same file's own docstring warns about two paragraphs later,
citing `trust-dial.ts` and DEBUG_LOG 2026-08-08 20:05 EDT.

**Second, the gate as written does not actually cover it.** The `pre_tool_use` hook envelope is an
SDK in-process contract, not an Agent Server HTTP surface, so it appears in no OpenAPI document and
cannot be generated from one. The constraint has a hole: an entire class of upstream-shaped
hand-written types sits outside it.

Mitigating, and the reason this is yellow rather than red: the seam is **pre-enforcement**. It denies
everything unconditionally, no hook is installed, and `extra="allow"` means an inaccurate field list
cannot cause a wrong verdict today — an unrecognised field is preserved, not dropped. The risk is
latent, not live.

## Decision

**Three classes, one rule each.**

| Class | Definition | Rule |
|---|---|---|
| **Agent Server DTO** | Any type crossing the middleware↔agent-server HTTP boundary | **Generated** from the pinned agent-server OpenAPI document into `upstream/_generated/`, diffed on every pin bump. Hand-writing is prohibited. |
| **Upstream-shaped in-process type** | Any type mirroring an SDK contract that has no OpenAPI representation — the hook envelope, event payloads, enums | Hand-authored is **permitted**, and each field **must** carry an ADR-015 native basis: pinned artifact path plus line or schema location, read from source. |
| **OH-GUI's own contract** | Types OH-GUI defines for itself — `Decision`, `verdict`, `reason`, `source` | Hand-authored, no native basis required. Must not be confused with the above. |

**Consequent decisions.**

1. **`Decision` is OH-GUI's own contract.** `verdict` / `reason` / `source` are this project's
   invention. Compliant as written; no change.

2. **`AuthorizeRequest` is an upstream-shaped in-process type and is currently non-compliant.** It is
   marked **PROVISIONAL — UNVERIFIED** in the module docstring, in the same commit as this ADR, and
   its six fields are annotated as unverified against pinned source. It is not deleted, because the
   fail-closed behaviour that depends on it is correct regardless of the field list.

3. **Verification is folded into ADR-014's harness.** ADR-014's verification item 3 already requires
   confirming what `tool_input` carries per tool class, against the running pinned agent-server.
   Reading the envelope out of pinned 1.41.0 source and recording each field's artifact path is added
   as a fifth item to that harness. **The PROVISIONAL marker is removed only by that reading.**

4. **No hook is installed while the marker stands.** This is the enforceable half. Enforcement cannot
   go live against a field list nobody has verified.

5. **The generator is vendored, not written.** `datamodel-code-generator` (MIT) produces pydantic v2
   models from OpenAPI. Logged in `PORTING_LEDGER.md` as `PLANNED`, per the vendor-before-hand-build
   rule. It lands with the ADR-014 harness, since fetching the OpenAPI document requires the pinned
   container running.

6. **The gate text is widened.** `13-hard-constraints.md` gains a companion gate covering the second
   class, closing the hole. Under ADR-018 both are registry entries: the generation gate is
   `STATIC` — it passes today because no hand-written Agent Server DTO exists, and would go red the
   moment one appeared — and the native-basis gate is `PHASE(1)`, owned by the ADR-014 harness.

## Rationale

**Alternative: declare `ipc/schema.py` out of scope as "OH-GUI's own IPC contract" and move on.**
Rejected, and it was the tempting answer because it exonerates code I wrote. It is false: the file's
own docstring says the type mirrors an upstream envelope field-for-field. A mirror is exactly what
ADR-015 governs. Classifying it as an OH-GUI invention to avoid the gate would be the manufacturing
that ADR-015 exists to prevent.

**Alternative: generate everything, including the hook envelope.** Not possible — there is no
schema document to generate it from. Hence the second class rather than a binary.

**Alternative: block Phase 1 until the envelope is verified.** Unnecessary. The seam denies
unconditionally; there is no wrong verdict to reach. Blocking installation of the hook, rather than
blocking all work, is the proportionate control and is the point at which the field list starts to
matter.

## Consequences

- `services/middleware/src/ohgui_middleware/ipc/schema.py` — PROVISIONAL marker and per-field
  unverified annotations.
- A test asserting the marker and the no-hook-installed condition move together, so the marker cannot
  be deleted without the verification that removes it.
- `docs/specs/13-hard-constraints.md` — companion gate added under v4.4.
- `PORTING_LEDGER.md` — `datamodel-code-generator`, `PLANNED`.
- `adrs/ADR-014-*.md` — amended with a fifth verification item.
- ADR-018 registry — two entries.

## Lock-in phase

Phase 1, at ADR-014 ratification. The generator and the envelope verification land together, because
both need the pinned container.

## References

- `docs/specs/13-hard-constraints.md` §v4.4
- `adrs/ADR-015-native-fidelity-boundary.md`
- `adrs/ADR-014-authorization-enforcement-seam.md`
- `services/middleware/src/ohgui_middleware/ipc/schema.py`
- `DEBUG_LOG.md` 2026-08-08 20:05 EDT (`trust-dial.ts`, the precedent defect)
- `KNOWN_ISSUES.md` 2026-08-08 item 10
