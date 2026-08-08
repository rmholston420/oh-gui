# OH-GUI Porting Ledger

Every vendored or ported component is logged here **before** it is wrapped behind
an OH-GUI port. Vendoring a verified permissively-licensed OSS component is
always preferred over hand-building anything already solved upstream.

Entry format:

```
## <component name>
- Sub-problem:
- Source URL:
- Commit SHA:
- SPDX license:
- Vendored to:
- Wrapped behind port:
- Modification notes:
- Logged: YYYY-MM-DD HH:MM EDT
```

---

## Primary donor - OpenHands Agent Canvas (ADR-001)

Per [ADR-001](adrs/ADR-001-integration-boundary.md), Agent Canvas is a **donor source**,
not a base to extend. Vendor selectively, attribute, log here.

> **CORRECTED 2026-08-08 (ADR-001 Amendment #2).** This section previously said Agent Canvas
> "is MIT-licensed and was archived 2026-07-27, which makes it a frozen, stable donor with no
> upgrade treadmill." That conflated two repositories and was false about both.
>
> - `github.com/OpenHands/agent-canvas` is archived, but is a **README-only stub with no LICENSE
>   file**. It is **not** MIT and there is nothing in it to vendor. **Never vendor from it.**
> - The real donor is **`github.com/OpenHands/OpenHands`** — MIT, `LICENSE` at root, root
>   `package.json` named `@openhands/agent-canvas`. It is **not archived** (pushed 2026-08-08), so
>   the "no upgrade treadmill" premise was wrong; that is exactly why it is pinned.

| Field | Value |
|---|---|
| Donor repo | `https://github.com/OpenHands/OpenHands` |
| Pin | tag `v1.12.0` = commit `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364` (verified 2026-08-08) |
| SPDX | `MIT` (verified: `LICENSE` at root of the pinned tree) |
| Reference checkout | `~/dev/oh-gui-ref/agent-canvas/v1.12.0/`, read-only, outside the repo |
| Provisioned by | `scripts/provision-reference-checkout.sh` |

| Surface | Donor path | Status |
|---|---|---|
| Conversation / terminal / files / settings / browser panes | `src/components/*` | Not ported - survey first |
| Planner surface | `src/routes/planner-tab.tsx` | Not ported - donor for the Phase 3 Plan workbench |
| Changes surface | `src/routes/changes-tab.tsx` | Not ported - donor for the Phase 2 review workbench |
| Commits surface | `src/routes/commits-tab.tsx` | Not ported |
| Task list surface | `src/routes/task-list-tab.tsx` | Not ported |

All donor paths above were verified to exist at the pinned commit on 2026-08-08.

Attribution requirement: every vendored file carries an SPDX header and a source
comment naming the upstream repo, path, and commit SHA it came from — concretely
`OpenHands/OpenHands`, the path, and `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364`.

## Runtime dependencies (pinned, NOT ports)

Recorded here so they are never mistaken for vendored code.

**Pinned 2026-08-08.** Authoritative values, digests and re-verification procedure live in
[`docs/UPSTREAM_PINS.md`](docs/UPSTREAM_PINS.md). The table below is a summary only; on any conflict
that file wins.

| Artifact | Pin | Notes |
|---|---|---|
| `ghcr.io/openhands/agent-server` | `sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520` | index digest; tag `ca46719-python` = `refs/tags/v1.41.0`, provenance only. Exposes **8000 + 8002**, not 8001 (ADR-001 Amdt #1) |
| `openhands-sdk`, `openhands-tools`, `openhands-workspace`, `openhands-agent-server` | **1.41.0** (all four) | `requires_python >=3.12`. Middleware-side; owns the policy plane |
| `@openhands/typescript-client` | **1.37.0** | MIT. **Four minor versions behind the server**, no compat matrix. Ships a working `LocalConversation` and a hard `@openrouter/sdk` dependency — both must be gated out of the frontend (ADR-001 Amdt #1) |

## Pre-identified port candidates (not yet ported)

From `docs/specs/12-portable-components.md`. These are **candidates only** - no
entry below counts as ported until it has a full entry in the section above with
a pinned commit SHA and verified SPDX license.

| Sub-problem | Candidate source | Status |
|---|---|---|
| Diff virtualization | Zhang-JiahangH/react-virtualized-diff | Not ported - benchmark against Monaco first (spec 6.3) |
| Terminal pane | Qovery/react-xtermjs | Not ported |
| Command palette | cmdk / react-cmdk | Not ported |
| Rewind/fork UX + DAG graph | microsoft/agdebugger | Not ported - lift graph component (spec 5.5.1) |
| Authorization card UX | agentkitai/agentgate | Not ported - reference only, read dashboard source |
| "Needs you" inbox UX | langchain-ai/agent-inbox | Not ported - reference only |
| Motion stack | motion (`motion/react`) | Not vendored - npm dependency, not a port |
| Glassmorphism / UI material | Aceternity UI, Magic UI | Not vendored - copy-paste source into `components/ui/`, never npm-installed |

## First-party SDK primitives - wire directly, do NOT port or rebuild

Recorded here so no future session mistakes these for port candidates. **All are Python
and run in the OH-GUI middleware, never in the browser** (ADR-001).

- `StuckDetector` (openhands-sdk)
- `conversation.ask_agent()` (openhands-sdk)
- `state.block_action()` / `state.block_message()` (openhands-sdk)
- `switch_llm` built-in tool (openhands-sdk)
- Confirmation policies: `AlwaysConfirm()`, `NeverConfirm()`, `ConfirmRisky()`
- Security analyzers: `Pattern`, `PolicyRail`, `LLM`, `GraySwan`, `Ensemble`

## Confirmed new-build work - no upstream equivalent

- The durable Plan object (`docs/specs/05-plan-model.md`)
- Drift detection
- Capability manifest
- Compare-mode merge logic
- The multi-backend GPU/accelerator telemetry adapter
  (`nvidia-smi` / `rocm-smi` / `powermetrics` / `/sys/class/thermal`)
