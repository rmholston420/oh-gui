# ADR-025 — How canvas reuse actually works: source-level ports, never a runtime dependency

**Status:** Ratified
**Lock-in phase:** Phase 1, ongoing for every subsequent slice
**Supersedes:** — (corrects `UPSTREAM_PINS.md` §3a only)

## What was already decided — this ADR does not re-decide it

`00-ground-truth.md`, as amended by ADR-001, already settles the donor question:

> "Agent Canvas is reclassified from *base* to *donor* — vendor its MIT components into OH-GUI and
> log them in `PORTING_LEDGER.md`." … "Do not treat this as a greenfield build." … "The point of the
> original rule — do not rebuild from scratch what already exists — still stands and is now enforced
> by the porting ledger."

`01-principles.md` supplies the intent this serves: #4 expose decision boundaries rather than
maximise autonomy, #7 budget friction so the low-risk path feels instant, #10 design for one capable
local model.

**ADR-001 and the ground-truth spec were right and are not amended here.** The single document that
was wrong is `UPSTREAM_PINS.md` §3a, which read "reference only, not consumed" — an outlier that
contradicted its own baseline. This ADR corrects that line and otherwise confines itself to the
*mechanics* of reuse, which no existing document specifies: how source is recovered, which areas are
portable, and what must never be taken.

## Context

The operator clarified the project's scope in terms that change how every future slice is built:

> "our OH-GUI is essentially a restructuring and extension of Agent Canvas. it is also meant to
> expose everything useful in the full OpenHands suite (SDK, Agent Server, Tools, Workspace, etc.)"
> … "i want to reuse what we can of canvas, but i also want to add better things as well"

This restates, in the operator's words, what the specs already required. The open question was never
*whether* to reuse canvas but **how** — which is unspecified, and which the measurements below settle.

### Canvas source is fully recoverable from the pinned tarball

The npm package ships no `.tsx`, but **every sampled sourcemap carries `sourcesContent`**
(400/400 in the first sample; 745 original `.ts`/`.tsx` files, ~2.84 M chars recovered in total).
The original pre-compilation source is therefore obtainable from an artifact we have already
pinned by hash — tarball sha256 `fa110b20f400efe74d8888122e9db1c91e4b892776d2e248c40074113acf39ab`.

This matters procedurally: "inspect donor code before porting" is satisfiable offline, against a
hash-verified snapshot, with no dependency on monorepo network access.

### Coupling is bimodal, and it inverts the obvious conclusion

Measured across the recovered source, by marker counts per feature area:

| Area | Files | Size | Coupling markers |
|---|---|---|---|
| `files` | 2 | 1 k | **none** |
| `terminal` | 2 | 1 k | xterm, i18n, 2 local hooks |
| `browser` | 4 | 4 k | i18n only |
| `sidebar` | 10 | 34 k | i18n, 4 local hooks |
| `conversation` | 29 | 87 k | react-router, 36 hooks, 1 `#/api` |
| `settings` | 40 | 140 k | axios, `useQuery`, **12 `#/api`** |
| `conversation-panel` | 70 | 244 k | **30 `#/api`**, HeroUI |
| `chat` | 75 | 246 k | tanstack, `useQuery`/`useMutation`, socket ×5, 82 hooks, `#/api` |

The naive reading — "depend on the package to move fast" — is wrong in both directions:

- The areas that are **cheap to consume are cheaper still to vendor**. `terminal` + `browser` +
  `files` total 8 files and ~6 k characters. Taking them as a dependency would drag in HeroUI
  2.8.10, react-router 7.18.2, Monaco, xterm 6 and tanstack-query to obtain six kilobytes of code.
- The areas that would **save real work are the ones that fetch for themselves** — 30 `#/api`
  imports in `conversation-panel`, 12 in `settings`, tanstack plus sockets in `chat`. Those talk to
  agent-server directly, which **ADR-001 forbids**: our client is type-only and all traffic passes
  through our Python middleware.

So dependency-consumption offers savings only in precisely the places our architecture cannot
accept it. That settles the question on evidence rather than preference.

### What canvas already solves, that we were about to hand-build

A search of the recovered source for the fields in spec 04 §4.2 found canvas already handles them:

| Concern | Canvas donor file | Size |
|---|---|---|
| `thought` / `reasoning_content` / `thinking_blocks` | `src/components/conversation-events/chat/event-thought-helpers.ts` | 3.8 k |
| Event → UI normalisation | `src/utils/handle-event-for-ui.ts` | 15.0 k |
| `critic_result` rendering | `…/event-message-components/critic-result-display.tsx` | 7.3 k |
| `summary` in action titles | `…/event-content-helpers/get-action-event-title.ts` | 4.2 k |
| `security_risk` confirm/reject UI | `src/components/shared/buttons/conversation-confirmation-buttons.tsx` | 4.4 k |

The next planned slice — rendering the agent's own account — was about to be written from scratch.
Doing so would have violated vendor-before-hand-build. It must be a port.

### What canvas does not have

Zero occurrences across all 745 files: `blast`, `untrusted`, `pending_action`, `reject_pending`,
`awaiting_confirmation`. The seven `trust` hits are extension-manifest trust
(`manifest-validation.ts`), not per-task-type trust.

Our authorization work is therefore genuinely additive, not a reimplementation: the blast-radius
projection (ADR-023), the untrusted-content badge (04a), the per-task-type trust dial (§4.1), and
the 900 px read-only gate (ADR-022) have no canvas counterpart.

## Decision

1. **Search order per component** (making the existing donor rule operational): recovered canvas
   source first, then sibling donors, then permissively-licensed OSS, then hand-build.
2. **Reuse is at source level only. `@openhands/agent-canvas` is never a runtime dependency of
   OH-GUI.** Adding it would import HeroUI's design language, react-router's shell model, and
   direct agent-server traffic — all three in conflict with ADR-001 and ADR-022.
3. **Recovery method:** extract original source from the sourcemaps of the hash-pinned tarball.
   Every port rewrites `#/…` path aliases onto our own modules and ports.
4. **Split ports by coupling:**
   - **Presentation ported near-verbatim:** `files`, `terminal`, `browser`, `sidebar`, and the
     event-rendering helpers listed above.
   - **Presentation ported, data layer replaced:** `chat`, `conversation`, `conversation-panel`,
     `settings`. Their `#/api` and data-fetching hook layers are **explicitly not ported**; data
     arrives through our middleware-backed ports.
   - **Not ported at all:** canvas's react-router shell, its HeroUI theme, and its settings routes
     as routes.
5. **Direct dependencies we accept** when a ported viewer needs them: `@xterm/xterm`,
   `@monaco-editor/react`. These are the genuine upstream solutions; taking them satisfies
   vendor-before-hand-build without inheriting canvas's shell.
6. **Every port gets a `PORTING_LEDGER.md` entry** citing both the canonical monorepo path and the
   tarball sha256 actually read, with SPDX `MIT` and modification notes.
7. **Suite-wide exposure is a north star, not a gate.** Operator's explicit call: no coverage
   matrix, no drift test, no DoD expansion. Recorded so the consequence is not silently forgotten —
   nothing mechanical will detect a suite surface we never got round to exposing.

## Rationale

Alternatives considered:

- **Consume the 9 subpath exports as a dependency.** Rejected: the valuable exports fetch directly
  from agent-server, violating ADR-001, and the harmless ones cost less to vendor than to depend on.
- **Hybrid — depend for viewers, hand-build the shell.** Rejected for the same arithmetic: the
  viewers are 6 k characters. A dependency plus HeroUI peer for that is a bad trade.
- **Keep canvas as reference only (status quo).** Rejected: now that the source is verifiably
  available and hash-pinned, reimplementing what canvas already solves is exactly the waste the
  vendor-before-hand-build rule exists to prevent.

The React and Tailwind versions align exactly (react/react-dom 19.2.8, Tailwind 4.3.3 on both
sides), so source-level ports need no framework-compatibility shimming. Our `motion` 13.0.0 is the
renamed successor of canvas's `framer-motion` 12.38.0 and needs an import rewrite per port.

## Consequences

- `UPSTREAM_PINS.md` §3a corrected: it was the only document claiming reference-only status.
- ADR-024's `canvas_extensions` deferral trigger is wrong and is amended alongside this ADR: it
  waited on "canvas ships a consumer", but under this ADR **OH-GUI is that consumer**.
- The §4.2 agent's-own-account slice converts from hand-build to port.
- `PORTING_LEDGER.md` gains a canvas donor section.
- New per-port duty: check the recovered canvas source before writing, and record the result of
  that check — including a negative result, so "canvas has nothing for this" is evidence rather
  than an assumption.

## Lock-in phase

Phase 1, and binding on every slice thereafter.

## References

- `Kosmos-Build-Spec-v25.md` vendor-before-hand-build rule
- ADR-001 (integration boundary; type-only client), ADR-015 (native fidelity),
  ADR-022 (read-only gate), ADR-023 (blast radius), ADR-024 (client pin, extensions deferral)
- `docs/UPSTREAM_PINS.md` §3a
- Canvas 1.12.0 tarball sha256 `fa110b20f400efe74d8888122e9db1c91e4b892776d2e248c40074113acf39ab`,
  gitHead `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364`, MIT
