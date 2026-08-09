# ADR-024 — Agent Canvas alignment: hold the client at 1.37.0, defer `canvas_extensions`

**Status:** Ratified · amended 2026-08-09
**Lock-in phase:** Phase 1, authorization surface
**Supersedes:** —

> **STATUS AMENDMENT (2026-08-09 00:02 EDT):** decision 2's *rationale and revisit trigger were
> wrong*, though the deferral itself stands. This ADR deferred `canvas_extensions` partly because
> "canvas 1.12.0 has zero awareness of it" and set the revisit trigger as "canvas itself ships a
> consumer". The underlying fact still holds — re-grepping the 1.12.0 package for
> `canvas-extension` returns zero hits. But the inference made canvas the gatekeeper, when
> ADR-025 establishes that **OH-GUI is canvas's restructured successor and is therefore the
> consumer that trigger was waiting for**. Corrected trigger: revisit when OH-GUI has a page host
> capable of mounting a contributed page, or when a spec requires extension-contributed UI —
> whichever comes first. Both are conditions we control, not upstream's. The original decision
> text below is unchanged.

## Context

Two questions arose from verifying what the newest Agent Canvas is built against, and whether
OH-GUI needs to extend to agent-server 1.41.0.

Verified facts (npm and PyPI metadata, read directly — not inferred from our own pin notes, which
were wrong on one point):

| Fact | Value |
|---|---|
| Latest `@openhands/agent-canvas` | **1.12.0**, published 2026-08-07 |
| Canvas `config/defaults.json` → `versions.agentServer` | 1.40.1 |
| Canvas `compatibility.minimumAgentServer` | 1.28.0 |
| Canvas-shipped `@openhands/typescript-client` | **1.36.1** |
| Latest `@openhands/typescript-client` on npm | **1.37.0**, published 2026-08-04 |
| Latest `openhands-agent-server` on PyPI | **1.41.0**, published 2026-08-06 |
| Our pinned image | 1.41.0 (`sha256:f0244fd…0520`) |
| Our pinned client | 1.37.0 |

This confirms, from the npm side, what ADR-001 established from the git side: the
`OpenHands/agent-canvas` repository is an archived README-only stub, and the live package is
published from the `OpenHands/OpenHands` monorepo. The move happened between canvas 1.6.1 and
1.9.0. `@openhands/agent-canvas` is actively maintained — 1.12.0 is four days old — so "archived"
must never be read as "the package is dead".

### The 1.40.1 → 1.41.0 delta

Diffed from the two sdists:

- **The action surface is identical.** 37 `Action` subclasses in both, zero field changes. This is
  the surface ADR-023's projection table is built on, so 1.41.0 requires no projection changes.
- **Removals**, all previously deprecated with `removed_in="1.41.0"`: `_RemoteMCPServerSpec.api_key`,
  the `ACPConversationInfo` / `ACPConversationPage` aliases, and the `StartACPConversationRequest`
  re-export. Canvas 1.12.0 uses `auth.strategy` (559 occurrences), contains no top-level
  `{api_key:` literal and no reference to the ACP aliases — so canvas 1.12.0 is compatible with
  1.41.0 despite declaring 1.40.1.
- **One addition:** `openhands/agent_server/canvas_extensions/` — installable UI bundles that
  contribute pages via a `canvas-extension.json` manifest, with path-traversal and symlink-escape
  containment. Canvas 1.12.0 has **zero** awareness of it.

Three action classes — `ApplyPatchAction`, `ConsultTomAction`, `SleeptimeComputeAction` — exist in
the image but appear in **neither** client schema version. They have no typed wire representation.

## Decision

**1. Hold `@openhands/typescript-client` at 1.37.0.** Do not follow canvas down to 1.36.1.

**2. Do not adopt `canvas_extensions` in Phase 1.** Record the evaluation and revisit when the
trigger below fires.

## Rationale

### On the client pin

1.37.0 is a strict superset of 1.36.1 for everything we consume. It adds `ErrorClassification` and
`FailureKind`, `ACPToolCallEvent`, `StreamingDeltaEvent`, and an `enabled` field on the MCP config.
Nothing is removed.

The obvious objection is that we would be typing against a schema newer than the one canvas itself
uses, risking types for fields the server never sends. That objection does not survive checking:
`ErrorClassification` is present in the SDK at 1.40.1 and 1.41.0, so the additions describe the
server we actually pinned, not a speculative future one. Canvas trailing at 1.36.1 reflects canvas's
own release cadence, not a compatibility statement.

The alternative — pinning to 1.36.1 to match canvas — would mean deliberately choosing a client that
cannot type error classifications our pinned server emits, in order to match a project whose
version choices we do not control and whose declared `agentServer` (1.40.1) is already behind ours.

The remaining risk is the reverse direction: the client is at 1.37.0 while the server is at 1.41.0,
so a 1.41.0-only wire addition would be untyped. The delta above shows there are none on the action
surface. `blast-radius-contract.test.ts` fails loudly if that changes, by walking both the pinned
image's evidence file and the installed client's generated union.

### On `canvas_extensions`

It is two days old, has zero upstream consumers, and canvas itself does not know it exists. Adopting
it in Phase 1 would mean building against an interface with no shipped implementation to check our
reading against — the exact failure mode ADR-015 exists to prevent, since "SDK source beats SDK
docs" offers no protection when the source has no callers either.

It is also not on the Phase 1 critical path. Nothing in spec 04 needs it.

Rejected alternative: vendor it now to avoid a later migration. This assumes the interface is
stable, which nothing supports at two days old and zero consumers; a migration from a wrong early
guess costs more than a later adoption of a settled interface.

## Consequences

- `docs/UPSTREAM_PINS.md` gains a canvas subsection: 1.12.0, its declared `agentServer` 1.40.1,
  `minimumAgentServer` 1.28.0, and its shipped client 1.36.1, recorded alongside our chosen 1.37.0
  with this ADR as the reason for the divergence.
- No change to `apps/gui/package.json` or `package-lock.json` — 1.37.0 stands.
- No `canvas_extensions` code, dependency, or directory enters the repo in Phase 1.
- `PORTING_LEDGER.md` gains a `REJECTED (deferred)` entry for `canvas_extensions` citing this ADR,
  so the evaluation is not silently repeated.

### Revisit trigger

Reopen when **either** holds:

1. `@openhands/agent-canvas` ships a release that itself consumes `canvas_extensions` — i.e. the
   interface has a real consumer to check a reading against; **or**
2. OH-GUI needs to surface a UI contributed by an agent-server-installed extension, which is not a
   Phase 1 requirement in any spec.

Re-verify at the next phase gate regardless, per `docs/UPSTREAM_PINS.md`.

## Lock-in phase

Phase 1. The client pin is load-bearing for every generated DTO (ADR-021) and for the blast-radius
contract test.

## References

- `adrs/ADR-001-integration-boundary.md` (Amendment #3 — client is a type-only devDependency)
- `adrs/ADR-015-native-fidelity-boundary.md`
- `adrs/ADR-021-generated-dtos.md`
- `adrs/ADR-023-blast-radius-projection-table.md`
- `docs/UPSTREAM_PINS.md` §2
- `apps/gui/src/__tests__/blast-radius-contract.test.ts`
