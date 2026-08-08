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

---

## Amendment #1 — 2026-08-08 — four Context/Rationale premises corrected against the pinned artifacts

**Status: Ratified. The DECISION is unchanged. Four supporting factual claims were wrong, one of
them load-bearing for the authorization architecture.**

Pinning the artifacts (`docs/UPSTREAM_PINS.md`) required inspecting them, and the inspection
contradicted four statements in this ADR's Context and Rationale. All four were written from
documentation and repository prose rather than from the shipped artifacts.

### C#1 — "remote conversations only" is FALSE, and the §4.8 argument built on it does not hold

This ADR's Context describes `@openhands/typescript-client` as **"remote conversations only"**, and
the Rationale rests a security conclusion on it:

> "`RemoteConversation.execute_tool()` raises `NotImplementedError`. A remote-only client cannot
> reach the hole."

The shipped package (1.37.0) exports **`LocalConversation`** from its top-level barrel
(`dist/index.js:9`). It is not a stub: it runs the agent loop locally, defines a bash tool
(`"The bash command to execute…"`), accepts a caller-supplied `toolExecutor`, and ships parallel
`security/confirmation-policy`, `security/security-analyzer`, `conversation/stuck-detector`, and
`conversation/secret-registry` modules. Its own docstring: *"runs the agent loop locally without
connecting to a remote server. This mirrors the Python SDK's LocalConversation class."*

**Consequence.** The structural guarantee this ADR claimed does not exist. Nothing in the package
prevents frontend code from importing `LocalConversation` and driving an agent loop that never
transits the middleware — which would bypass the entire policy plane of item 3 and defeat
Principle 8 ("display is not enforcement").

The decision does not change; if anything this strengthens it. But the protection must be
**enforced**, not assumed:

> **New binding requirement.** The frontend MUST NOT import `LocalConversation`, `LocalWorkspace`,
> or anything under `@openhands/typescript-client/llm` or `.../security`. This requires a mechanical
> gate — an import restriction plus a test that fails the build on violation. Local to this repo, no
> GitHub-native CI. Not yet implemented; it is a Phase 1 authorization-slice prerequisite, and until
> it exists the item 4 boundary is a convention rather than a control.

Whether a browser can actually execute the built-in tools is a separate and unanswered question
(there is no `child_process` in a browser, and `toolExecutor` is caller-supplied). That uncertainty
is not a mitigation: the correct posture is the gate above, not a bet on the sandbox.

### C#2 — "no formal OpenAPI document … was found" is FALSE

This ADR's risk register states that no formal OpenAPI document, versioning policy, or deprecation
guarantee was found. Upstream ships all of the following in `software-agent-sdk`:

- `openhands-agent-server/openhands/agent_server/openapi.py`
- `.github/scripts/export_agent_server_openapi.py`
- `tests/agent_server/test_openapi_contract.py` — a **contract test**
- `.github/scripts/check_agent_server_openapi_quality.py` plus a weak-schema allowlist

The client's `dist/generated/agent-server-schema.d.ts` (20,863 lines) is generated from it.

**Revised risk:** a formal, contract-tested, machine-readable schema **does** exist, which is a
materially better position than recorded and makes the anti-corruption layer cheaper — it can be
generated and diffed rather than hand-written. **No versioning or deprecation policy was found**;
that half of the original risk stands.

### C#3 — "ports 8000/8001" is wrong

The pinned image exposes **8000/tcp and 8002/tcp**, and 8002 is `NOVNC_PORT` (a VNC surface), not
the WebSocket. There is no 8001. Any compose file or health check written from this ADR's Context
would have probed a closed port.

### C#4 — "no Node dependency" is wrong about the dependency graph

The client declares `ws ^8.20.0` as a normal runtime dependency. Browser **behaviour** is as this
ADR assumed — `dist/events/websocket-client.js` prefers `window.WebSocket` and only falls back to a
guarded `require('ws')` — but the dependency is installed unconditionally and a bare `require` in an
ESM module can break bundlers. Plan an alias or `external`.

Separately, and not previously noted at all: the client declares **`@openrouter/sdk ^0.13.24`** and
ships `dist/llm/openrouter-llm.js`. A cloud LLM SDK is a non-optional dependency of the frontend
client in a project whose standing constraint is local-only. Before this package is admitted,
verify no code path reaches OpenRouter and that the module is tree-shaken from the production
bundle. Treat an outbound OpenRouter request as a defect.

### Also recorded

Server/SDK **1.41.0** against client **1.37.0** — four minor versions of skew, separate repos, no
`peerDependencies`, no published compatibility matrix. Unquantified, so the first integration slice
must verify the endpoints it calls against the pinned server rather than trusting version proximity.

### Lesson

Every one of these four errors came from trusting prose over the artifact. The artifacts were
available for inspection the entire time. This ADR gated Phase 0 and the errors would have
propagated into the compose file, the health check, and the authorization boundary.

---

## Amendment #2 — 2026-08-08 — reference-checkout location, and the donor was misidentified

**Status: Ratified. Implements item 6. Also corrects a licensing error in `PORTING_LEDGER.md`.**

### The donor was the wrong repository

`PORTING_LEDGER.md` said Agent Canvas "is MIT-licensed and was archived 2026-07-27, which makes it
a frozen, stable donor with no upgrade treadmill." That sentence describes **two different
repositories** and is false about both:

| Repo | Reality (checked 2026-08-08) |
|---|---|
| `github.com/OpenHands/agent-canvas` | Archived 2026-07-27, but a **README-only stub — one file, and no LICENSE at all**. Not MIT. Nothing to vendor. |
| `github.com/OpenHands/OpenHands` | The actual donor. **MIT**, `LICENSE` at root, root `package.json` is literally `@openhands/agent-canvas`. **Not archived** — pushed 2026-08-08. |

Two consequences. First, **the "frozen donor, no upgrade treadmill" premise is wrong**: the real
donor is actively developed, which is precisely why item 6 says to pin. Second, and worse, anyone
acting on the ledger's MIT claim while looking at the archived repo would have vendored **unlicensed
code** into an MIT-attributed project.

`docs/specs/00-ground-truth.md` had the correct pin all along — `OpenHands/OpenHands`, tag
`v1.12.0`, commit `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364` — and that is now verified: the tag
resolves to that commit, and all five donor paths the ledger names exist at it.

### Decision — the checkout lives outside the repo

```
~/dev/oh-gui-ref/agent-canvas/v1.12.0/     pristine, chmod a-w, never installed, never run
~/.oh-gui/reference/agent-canvas-run/      disposable writable copy, for baseline metrics only
```

Provisioned and re-verified by `scripts/provision-reference-checkout.sh`, which is the only artifact
committed to this repo. Sibling to `~/dev/oh-gui`, never inside it.

**Why not vendored in-repo.** The decisive reason is not size — a shallow single-tag clone is
**21 MB**, measured, so size was never the constraint. It is that **git does not track write
permissions**; it records only the executable bit. An in-repo checkout is writable the moment anyone
clones, so item 6's "never modified" would be unenforceable by construction — reduced to a comment.
Outside the repo, `chmod -R a-w` is a real control: writes and deletes were both attempted against
the provisioned tree and both were refused. Secondarily, an in-repo copy carries its own
`package.json` and would be swept up by npm workspaces, `tsconfig` includes, eslint globs and test
discovery, making it a build input in exactly the way item 6 forbids.

**Why not a submodule.** A gitlink is a coupling, and item 5 says "vendoring is a copy, not a
coupling." It also lands the tree inside the working directory (same build-input hazard) and adds
`git submodule update` to every clone for something that is deliberately pinned and inert.

**Why the two-layer split.** §3.0.1 asks the checkout to be both a *diff reference* and the *Phase 0
regression baseline*. The second requires running stock Agent Canvas, which requires `npm ci` and a
`node_modules/` — i.e. writing into the tree. One read-only tree cannot serve both. The pristine
layer stays inert and authoritative; the run copy is regenerated from it on demand and may be
deleted at any time. Neither is a build input to OH-GUI.

**Why version-scoped directories.** `agent-canvas/v1.12.0/` rather than `agent-canvas/` means a
future re-pin is additive, and two pins can be diffed against each other.

### Guard against recurrence

The script refuses to install a tree whose root `package.json` is not named
`@openhands/agent-canvas`, and refuses one whose `LICENSE` is not MIT. Pointing it at the archived
stub fails closed rather than silently producing an unlicensed reference.

### Consequences

- `PORTING_LEDGER.md` donor section corrected: right repo, right commit, MIT confirmed, plus an
  explicit do-not-vendor note for the archived stub.
- Attribution requirement is now concrete: SPDX header naming `OpenHands/OpenHands`, the file path,
  and commit `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364`.
- Phase 0 exit item 2 is **not** met until the script has been run on Colossus and logged.
