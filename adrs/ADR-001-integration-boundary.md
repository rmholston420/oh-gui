# ADR-001 — OpenHands Integration Boundary: Standalone App over Agent Server API

**Status:** Ratified
**Lock-in phase:** Phase 0 (pre-kickoff)
**Supersedes:** —

## Context

`docs/specs/00-ground-truth.md` declares the architecture decision "EXTEND, not fork":
clone `OpenHands/OpenHands` at tag `v1.12.0` and extend `planner-tab.tsx`,
`changes-tab.tsx`, `commits-tab.tsx`, `task-list-tab.tsx` **in place, never duplicated**.
`docs/specs/13-hard-constraints.md` gates every PR on that same rule.

The user's actual requirement, stated at project kickoff, is different in a way the
spec never contemplated:

> "I don't want to change anything in the OpenHands source, I want to be able to keep
> upgrading it. What I'm doing is creating my own custom GUI and middleware for
> OpenHands, which will keep changing regularly."

Extending upstream source in place is incompatible with frictionless upstream
upgrades. Upstream historically releases roughly every 2-3 days. Any in-place
modification becomes a rebase liability on that cadence.

Investigation of the live upstream surface (2026-08-08) established that OpenHands
ships a supported consumption boundary the spec does not mention:

- **Agent Server** — standalone Docker image `ghcr.io/openhands/agent-server:<sha>-python`,
  ports 8000/8001, HTTP + WebSocket, `SESSION_API_KEY` auth, `OH_ALLOW_CORS_ORIGINS`.
- **`@openhands/typescript-client`** — browser-compatible client for the Agent Server
  API, no Node dependency, mirrors the Python SDK, **remote conversations only**,
  explicitly intended for "web applications, React applications, other browser-based
  projects."
- **`openhands-sdk` / `openhands-tools` / `openhands-workspace` / `openhands-agent-server`**
  — pip-installable Python packages. The SDK is documented as the engine behind the
  OpenHands CLI and OpenHands Cloud, and is offered for "building new developer
  experiences."

Four options were considered. See Rationale.

## Decision

**OH-GUI is a standalone application. OpenHands is a versioned runtime dependency,
never a modified checkout.**

1. OpenHands source is **never** modified, forked, or patched by this project.
2. OpenHands is consumed exclusively as published artifacts: the `agent-server`
   Docker image (pinned by digest), and the `openhands-sdk` family of pip packages.
3. **Middleware is Python.** It runs in-process with `openhands-sdk` and owns the
   entire policy plane: confirmation policies, the security-analyzer ensemble,
   `StuckDetector`, `state.block_action()` / `state.block_message()`, the untrusted-
   content quarantine of `docs/specs/04a-prompt-injection.md`, and the authorization
   audit log. It exposes these to the frontend over an OH-GUI-owned API.
4. The frontend is a browser application that talks **only** to the OH-GUI middleware,
   never directly to the Agent Server for anything policy-bearing.
5. Agent Canvas is reclassified from *base* to **donor**. Its components may be
   vendored into OH-GUI under MIT with attribution, logged in `PORTING_LEDGER.md`
   per the standard port procedure. Vendoring is a copy, not a coupling.
6. A read-only stock Agent Canvas checkout is retained solely for the Phase 0
   regression baseline required by `docs/specs/03-layout.md` §3.0.1. It is never
   modified and is not a build input.
7. All third-party client churn is confined behind an anti-corruption layer in the
   middleware, so upstream API changes hit one module.

## Rationale

**Why not A — overlay repo with patches against a live checkout.** Retains in-place
edits to upstream source, so it does not deliver the stated upgrade requirement.
Patch rot against a 2-3 day release cadence is the dominant failure mode.

**Why not B — GitHub fork of OpenHands/OpenHands.** Spec-literal, but directly
contradicts "don't change OpenHands source." Also drags `enterprise/` into the tree,
which `docs/specs/02-repo-setup.md` item 3 flags as differently licensed and out of
scope.

**Why not C — overlay now, fork the canvas at Phase 1.** Defers the problem without
solving it; still ends in a maintained fork the user explicitly does not want.

**Why D.** It is the only option satisfying the stated requirement, and it uses a
first-party supported boundary rather than an improvised one. Upgrades become a
version bump. Two additional benefits fall out:

- `docs/specs/04-authorization.md` §4.8 (close the `execute_tool()` bypass) is largely
  satisfied structurally rather than defensively. The spec itself scopes that bypass to
  `LocalConversation`; `RemoteConversation.execute_tool()` raises `NotImplementedError`.
  A remote-only client cannot reach the hole.
- Policy enforcement sits behind a process boundary the browser cannot bypass, which is
  a materially stronger posture than the spec's in-process assumption and better serves
  Principle 8 ("display is not enforcement").

**Why Python middleware over TypeScript.** The primitives the Phase 1 authorization
slice depends on — confirmation policies, analyzers, `StuckDetector`, `block_action()` —
are Python SDK objects. A TypeScript middleware could reach them only through whatever
the Agent Server API happens to expose, which could not be verified to be complete. The
cost is a second language in the stack; accepted.

## Consequences

**Spec amendments required (marked v4.2 inline):**

| File | Change |
|---|---|
| `docs/specs/00-ground-truth.md` | "EXTEND, not fork / extend in place" superseded by this ADR |
| `docs/specs/02-repo-setup.md` | Items 1-2 replaced with dependency-pinning procedure |
| `docs/specs/12-portable-components.md` | SDK primitives reclassified as middleware-side, not in-process to the GUI; Agent Canvas added as donor |
| `docs/specs/13-hard-constraints.md` | "Extend in place, never duplicate" gate retired; replaced with a no-upstream-modification gate |
| `docs/specs/99-appendix-superseded.md` | Options A/B/C and the extend-in-place premise recorded as rejected |

**Other consequences:**

- `PORTING_LEDGER.md` gains Agent Canvas as a donor source with MIT attribution.
- Phase 0 baseline still runs against stock Agent Canvas — unchanged.
- A new unknown enters the risk register: no formal OpenAPI document, versioning
  policy, or deprecation guarantee for the Agent Server API was found. Mitigated by
  the anti-corruption layer and digest pinning; revisit if upstream publishes one.
- `@openhands/typescript-client` self-describes as alpha, with an API that "may change
  significantly between versions without notice." Accepted risk, contained per item 7.

## Lock-in phase

Phase 0. This ADR must be ratified before any Phase 0 baseline work begins, because
it determines what "the checkout" means for the baseline.

## References

- `docs/specs/00-ground-truth.md` — original EXTEND-not-fork decision, now superseded
- `docs/specs/02-repo-setup.md` items 1-3
- `docs/specs/03-layout.md` §3.0.1 — stock reference checkout requirement, retained
- `docs/specs/04-authorization.md` §4.8 — `execute_tool()` bypass
- `docs/specs/04a-prompt-injection.md` §4.9.1 — quarantine, now middleware-side
- `docs/specs/13-hard-constraints.md` — gate list amended
- OpenHands typescript-client — https://github.com/OpenHands/typescript-client
- OpenHands software-agent-sdk — https://github.com/OpenHands/software-agent-sdk
- OpenHands SDK docs — https://docs.openhands.dev/sdk/getting-started
- `PORTING_LEDGER.md` — Agent Canvas donor entry
