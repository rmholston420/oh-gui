<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Original filename : openhands-io-contracts.md
Origin            : Forge-OH, the predecessor project. Supplied by the operator on 2026-08-09 01:01 EDT.
Filed by          : agent, verbatim, unmodified below the marker line.
sha256 (body)     : 8214f37d2b5b68e3
Why filed         : OpenHands I/O contracts. Directly relevant to ADR-015 native fidelity: treat every claim here as UNVERIFIED until checked against review/_sdk_src/.

Standing rules for this directory (docs/donor-specs/):
  1. The body below the marker is the operator's document. Never edit it, never "correct" it,
     never summarise it in place. Disagreements go in an ADR that cites this file, not in edits.
  2. Nothing here is a specification of OH-GUI. These are donor documents. A statement becomes
     binding on OH-GUI only when an ADR or a file under docs/specs/ adopts it.
  3. Every OpenHands API, field, or extension surface named below is UNVERIFIED until checked
     against review/_sdk_src/ per ADR-015. Documentation is not verification.
  4. These files exist because iterating a spec drops information. Source-shaped memory is the
     structural fix; summary-shaped memory is what failed.
-->

<!-- ===================== VERBATIM DONOR DOCUMENT BELOW ===================== -->

# OpenHands Input/Output Contract Audit and Optimal Integration Contracts

## Scope and Method

This audit reads the current OpenHands documentation set (docs.openhands.dev, the software-agent-sdk source tree, and its DeepWiki-indexed architecture pages) to enumerate every input and output surface the framework exposes, then derives the contract set an external system (backend orchestration layer, developer GUI, non-technical front door) should build against. OpenHands V1 is organized into four Python packages — `openhands.sdk` (core abstractions: Agent, Conversation, LLM, Tool, MCP, Event), `openhands.tools` (concrete tool implementations), `openhands.workspace` (execution environments: Docker, hosted API), and `openhands.agent_server` (the FastAPI server exposing REST and WebSocket). All contracts below are drawn directly from this surface — none are invented.[^1]

## 1. The Event System — The Single Source of Truth

Every input and output in OpenHands ultimately becomes an entry in one append-only, immutable event log. The Event System has four responsibilities: type safety via Pydantic schemas, LLM message conversion, append-only history, and service integration for external observers. This is the contract every downstream consumer (GUI, memory layer, safety checker) should read from — never a parallel state store.[^2]

### Base Event Envelope

Every event, regardless of subtype, carries this fixed envelope:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique event identifier (UUID hex, no hyphens) |
| `source` | enum | `user` \| `agent` \| `environment` — attribution, not display role |
| `timestamp` | string | ISO 8601 with microsecond precision |
| `kind` | string | Fully qualified event type name (discriminated union tag) |

[^3]

**Critical distinction to preserve in any GUI or plain-language layer:** `Event.source` (attribution) and LLM `role` (how the event is formatted for the model: `system`/`user`/`assistant`/`tool`) are intentionally independent fields. A tool result is `source="environment"` but `role="tool"`; a synthetic hook-injected message can be `source="environment"` while carrying `role="user"` so the agent reads it as an instruction. Any consumer that infers origin from role will misattribute framework-injected content as human input.[^2]

### Full Event Type Catalog (Inputs to the LLM)

| Event Type | Source | Content | LLM Role |
|---|---|---|---|
| `MessageEvent` (user) | user | Text, images | `user` |
| `MessageEvent` (agent) | agent | Text reasoning, skills | `assistant` |
| `ActionEvent` | agent | Tool call: thought, reasoning, security_risk | `assistant` + `tool_calls` |
| `ObservationEvent` | environment | Tool execution result | `tool` |
| `UserRejectObservation` | environment | Rejection reason | `tool` |
| `AgentErrorEvent` | agent | Error details (tool-scoped, non-terminal) | `tool` |
| `SystemPromptEvent` | agent | System prompt + tool schemas | `system` |
| `CondensationSummaryEvent` | environment | Summary of forgotten events | `user` |

[^1][^2]

### Internal Events (Never Sent to the LLM)

| Event Type | Source | Purpose | Key Fields |
|---|---|---|---|
| `ConversationStateUpdateEvent` | environment | State synchronization (also sent synthetically over WebSocket, not stored in the log) | `key`, `value` |
| `CondensationRequest` | environment | Trigger context-window compression | signal only |
| `Condensation` | environment | Compression result | `forgotten_event_ids`, `summary`, `summary_offset` |
| `PauseEvent` | user | User-requested pause | none |
| `ConversationErrorEvent` | environment | Conversation-level runtime failure (distinct from `AgentErrorEvent`) | none; not LLM-convertible; transitions run loop to `ERROR` |

[^2]

**Contract implication:** the optimal contract distinguishes `AgentErrorEvent` (tool-call-scoped, recoverable, conversation continues) from `ConversationErrorEvent` (fatal, terminal, raises `ConversationRunError` client-side). Any GUI or safety layer needs separate handling paths for these two — collapsing them into one generic "error" event loses the recoverable/fatal distinction that determines whether the UI should show inline retry or a blocking failure screen.

### Parallel Function-Call Grouping Rule

When multiple `ActionEvent`s share the same `llm_response_id` (parallel tool calls in one LLM turn), consumers must group them: combine into a single logical turn, and only the first event's `thought`/`reasoning_content`/`thinking_blocks` carries content — subsequent grouped events have empty thought fields by design. Any event-timeline UI that renders each `ActionEvent` independently without this grouping will show duplicate or missing reasoning text.[^2]

## 2. REST API — Discrete Control Operations

**Base path:** `/api`. **Transport:** HTTP/JSON. **Auth:** `X-Session-API-Key` header, validated against `OH_SESSION_API_KEYS`.[^3]

### Conversation Lifecycle Contract

| Method | Path | Input Contract | Output Contract | State Transition |
|---|---|---|---|---|
| POST | `/api/conversations` | `StartConversationRequest` (agent config, LLM settings, tools, context — serialized JSON) | `ConversationInfo` | → `IDLE` |
| GET | `/api/conversations/{id}` | path param | `ConversationInfo` | none |
| GET | `/api/conversations/search` | `page_id`, `limit` (1-100), `execution_status`, `sort_order` | `ConversationPage` (cursor-paginated) | none |
| GET | `/api/conversations/count` | filter params | `int` | none |
| PATCH | `/api/conversations/{id}` | `UpdateConversationRequest` (e.g. title) | `Success` | none |
| POST | `/api/conversations/{id}/pause` | none | `Success` | `RUNNING` → `PAUSED` |
| POST | `/api/conversations/{id}/resume` | none | `Success` | `PAUSED` → `RUNNING` |
| DELETE | `/api/conversations/{id}` | none | `Success` (workspace dir preserved) | any → `DELETED` |

[^4][^3]

**`ConversationInfo.execution_status` — the canonical FSM.** This is the authoritative state enum, superseding any custom FSM a downstream spec might invent: `IDLE`, `RUNNING`, `PAUSED`, `WAITING_FOR_CONFIRMATION`, `FINISHED`, `ERROR`, `REJECTED`, `STUCK`. Any integrated spec's "task state" model should be defined as a direct projection of this enum plus conversation-local metadata, not a parallel invented state machine.[^3]

### Event Endpoints Contract

| Method | Path | Input | Output |
|---|---|---|---|
| GET | `/events/search` | `page_id`, `limit`, `kind`, `source`, `body` (text search), `sort_order`, `timestamp__gte`, `timestamp__lt` | `EventPage` |
| GET | `/events/count` | same filters minus pagination | `int` |
| GET | `/events/{event_id}` | path param | `Event` (404 if missing) |
| GET | `/events?event_ids=…` | list of IDs | `list[Event \| None]`, order-preserving, nulls for missing |
| POST | `/events` | `SendMessageRequest{role, content[], run:bool}` | `Success` |
| POST | `/events/respond_to_confirmation` | `ConfirmationResponseRequest{accept:bool}` | `Success` |

[^3]

**Contract note on `SendMessageRequest.run`:** `run=false` appends the message without triggering execution; `run=true` appends and starts the agent loop if idle. Any "Start Building" button in a plain-language front end maps directly to a single `POST /events` call with `run=true` — no separate "start" endpoint exists or is needed.

**Contract note on confirmation:** `respond_to_confirmation` is the *only* mechanism for resolving `WAITING_FOR_CONFIRMATION`. `accept=true` executes the pending action and resumes the run; `accept=false` rejects and pauses. This is the exact backend hook for both the developer GUI's "Approve/Reject" diff controls and the non-technical layer's plain-language decision cards — both are just different renderings of the same one-field boolean contract.[^3]

### Bash Execution Contract (Independent of Conversation Events)

| Method | Path | Input | Output |
|---|---|---|---|
| POST | `/api/bash` | `ExecuteBashRequest{command, timeout?}` | `BashCommand` (async; output fetched separately) |
| GET | `/api/bash/search` | `kind__eq` (`BashCommand`/`BashOutput`), `command_id__eq`, timestamp filters | `BashEventPage` |

`BashOutput` fields: `command_id`, `order` (chunk sequence), `stdout`, `stderr`, `exit_code` (only on final chunk). This is a separate channel from the agent's own terminal tool calls — useful for an operator "run a quick command" affordance that should not pollute the agent's own event/context history.[^3]

### Error Contract

| Code | Meaning |
|---|---|
| 400 | Bad request / invalid params |
| 401 | Missing/invalid API key |
| 404 | Conversation or event not found |
| 422 | Request validation failed (structured field errors) |
| 503 | Server not ready (startup) |

[^3]

## 3. WebSocket API — Real-Time Event Streaming

**Endpoint:** `ws://{host}:{port}/sockets/events/{conversation_id}`. **Auth:** `session_api_key` query parameter (not header — browser WebSocket cannot set custom headers at handshake). **Query flag:** `resend_all=true` replays full history before live streaming.[^5]

### Connection Contract

1. On subscribe, the server immediately sends a synthetic `ConversationStateUpdateEvent` — **not persisted in the SDK event log** — containing `execution_status`, `stats` (iteration count, token usage, cost), `delegate` (multi-agent info if applicable), and `last_event_timestamp`. This is the correct, documented mechanism for a GUI's status header (VRAM/tokens/session-state strip) to initialize on load, rather than polling REST.[^5]
2. Thereafter, every event flows through a publish-subscribe pipeline: `LocalConversation` → `callbacks` → `AsyncCallbackWrapper` → `PubSub[Event]` → serialized JSON → client.[^5]
3. Events are serialized via Pydantic `model_dump()`; no compression or diffing — full event bodies each time.[^5]

### Delivery Guarantees (Contract-Critical)

| Property | WebSocket | Webhook (alternative channel) |
|---|---|---|
| Delivery guarantee | Best-effort; lost on disconnect | Retried with exponential backoff |
| Backpressure | None at application layer; TCP flow control only | N/A (batched HTTP POST) |
| Ordering | Guaranteed within one connection | Guaranteed within one batch |
| Reconnection | Client must implement; `resend_all=true` on reconnect recovers full history | Not applicable |

[^5]

**Contract implication:** any GUI relying solely on WebSocket for state must implement reconnect-with-`resend_all` logic, since the server provides no gap-filling on silent drops. For audit-grade guarantees (e.g., a Safety Check log that cannot silently miss an event), the webhook channel — not WebSocket — is the correct contract, per OpenHands' own documented trade-off table.[^5]

## 4. Webhook System — Guaranteed-Delivery Integration Channel

Two independent webhook types exist, each with its own contract:[^6]

| Webhook Type | Trigger | Target URL | Payload | Delivery |
|---|---|---|---|---|
| `ConversationWebhookSubscriber` | Conversation created/updated/deleted | `POST {base_url}/conversations` | Single `ConversationInfo` JSON object | Immediate, unbatched |
| `WebhookSubscriber` (event stream) | Any conversation event | `POST {base_url}/events/{conversation_id.hex}` | Array of `Event` JSON objects | Batched, configurable buffer size, retried with exponential backoff |

**Contract implication for the evidence/audit layer:** the Safety Check and evidence-packager subsystems identified as under-specified in the prior architectural review should be built against the event-stream webhook, not the WebSocket feed — it is the only channel in the framework with a documented retry/delivery guarantee, which is a hard requirement for anything claiming to produce auditable evidence.

## 5. Hooks — The Repository-Local Extension Contract

Hooks are configured **per-repository** via `.openhands/hooks.json`, not globally, and work identically across Cloud, CLI, and local GUI deployments. This is the single most important correction to any prior spec that assumed hooks were a global policy mechanism.[^7]

### Hook Type Contract

| Hook | Fires | Can Block |
|---|---|---|
| `PreToolUse` | Before tool execution | Yes |
| `PostToolUse` | After tool execution | No |
| `UserPromptSubmit` | Before user message processed | Yes |
| `Stop` | When agent attempts to finish | Yes |
| `SessionStart` | Conversation begins | No |
| `SessionEnd` | Conversation ends | No |

[^7]

### Hook I/O Contract

**Input (stdin JSON):**
```
{
  "event_type": "PreToolUse",
  "tool_name": "terminal",
  "tool_input": { "command": "..." },
  "session_id": "abc-123",
  "working_dir": "/workspace"
}
```
Plus environment variables: `OPENHANDS_EVENT_TYPE`, `OPENHANDS_TOOL_NAME`, `OPENHANDS_PROJECT_DIR`, `OPENHANDS_SESSION_ID`.[^7]

**Output (exit code + optional stdout JSON):**

| Exit Code | Meaning |
|---|---|
| 0 | Success, proceed |
| 2 | Block (deny) |
| other | Error logged, proceeds anyway |

Optional JSON: `{"decision": "allow"|"deny", "reason": "...", "additionalContext": "..."}` — `decision` overrides the exit code; `reason` surfaces in the UI; `additionalContext` is injected into the agent's prompt[^7]. Hooks with `"async": true` never block regardless of type.

**Hard architectural consequence:** because hooks live in `.openhands/hooks.json` inside the target repository, a fresh clone, a hostile repository, or a repository the operator has not yet configured **has no hooks at all**. Any safety architecture (dangerous-command blocking, plain-language event injection, completion gates) that depends on hooks as its sole enforcement layer has a bypass built into the framework's own design. The optimal contract treats hooks as a *repo-authored convenience layer*, and places non-negotiable enforcement (secret scanning, destructive-command blocking) at the sandbox-image or security-analyzer layer instead, which applies unconditionally.

## 6. Security, Risk, and Confirmation — The Real Approval Contract

This is the actual mechanism underlying any "approve/reject" UI, and it is richer than a binary gate.

### Risk Assessment Contract

Every `ActionEvent` can carry a `security_risk` field scored by a `SecurityAnalyzer`. The default `LLMSecurityAnalyzer` adds `security_risk` to each tool's JSON schema so the model scores its own action inline, with no extra inference call. MCP tool annotations (`readOnlyHint`, `destructiveHint`, etc.) also feed the score. `SecurityRisk` is a totally ordered enum: `UNKNOWN`, `LOW` < `MEDIUM` < `HIGH`.[^8][^9]

### Confirmation Policy Contract

| Policy | Behavior |
|---|---|
| `NeverConfirm` | No pausing; all actions execute immediately (default; hard-forced in headless mode) |
| `AlwaysConfirm` | Pause before every action except `FinishAction`/`ThinkAction` |
| `ConfirmRisky(threshold=HIGH)` | Pause only when risk ≥ threshold; `UNKNOWN` risk confirms by default (`confirm_unknown=True`) |

Confirmation mode is active only when **both** a `SecurityAnalyzer` is set **and** the policy is not `NeverConfirm`. Setting only a policy without an analyzer is a no-op — a contract trap worth flagging explicitly for any implementer.[^9][^10][^11]

### Confirmation State Machine

When active, the agent execution loop pauses after creating `ActionEvent`s but before executing them; conversation enters `WAITING_FOR_CONFIRMATION`; pending actions sit in the log without observations until `POST /events/respond_to_confirmation` resolves them. `FinishAction` and `ThinkAction` always bypass confirmation regardless of policy, since they have no external side effects.[^11]

### Headless Mode Contract (Critical for a Fully Autonomous Local System)

**Headless mode hard-disables confirmation — it is always `NeverConfirm`.** This means headless mode's blast radius is exactly whatever the sandbox/workspace permits, which is precisely why headless deployment requires Docker isolation as a non-negotiable, not a nice-to-have. Any local autonomous system spec that plans to run unattended must treat sandbox egress and filesystem boundaries — not confirmation policy — as the actual security perimeter, since confirmation is architecturally unavailable in that mode.[^8]

### Documented Risk Tiers (Policy Text, Not Code)

OpenHands' own security guidance defines three tiers: things the agent may do autonomously, things requiring explicit user consent (e.g., opening PRs on the original repository), and things never permitted regardless of user intent (e.g., uploading API keys/tokens, illegal activity, cryptocurrency mining). This is the authoritative tier language an integrated spec's "risk-tiered approval policy" should reference directly rather than re-deriving from scratch.[^9]

## 7. Secret Registry — Credential Contract

Each conversation owns an isolated `SecretRegistry` instance. Contract properties:[^12][^13][^8]

- Secrets are **late-bound** — resolved only at tool-execution time, never held in agent context.
- Values may be static strings or callables (e.g., token refreshers), enabling live rotation without restarting the agent.
- The terminal tool scans commands for known secret keys, exports matches as environment variables, and replaces their occurrences in output with a constant mask (`<secret-hidden>`).
- Secrets are redacted during serialization and can be encrypted at rest with a configurable cipher.
- Secrets are updatable mid-conversation, either locally or via the agent server API — supporting rotation without a restart.

**Contract implication for the Safety Check subsystem:** secret exposure prevention is already a first-class, built-in guarantee at the tool-execution layer, not something a downstream Safety Check needs to reimplement from scratch. The optimal contract is for any custom safety layer to *verify* Secret Registry masking behavior in its test corpus rather than duplicate masking logic.

## 8. Git Provider Integration Contract

A unified `GitService` protocol abstracts GitHub, GitLab, Bitbucket Cloud, Bitbucket Data Center, Forgejo, and Azure DevOps behind one interface, covering repository discovery, branch operations, suggested-tasks retrieval (open PRs/issues), microagent (repo-specific prompt) discovery, and PR/MR status checks. For a spec that wants "branch/PR automation," this protocol — not a bespoke GitHub-only integration — is the correct contract boundary, since it is provider-agnostic by design.[^14]

## 9. Consolidated Contract Map (What to Build Against)

| System Need | Correct OpenHands Contract | Not This |
|---|---|---|
| Task/session state | `ConversationInfo.execution_status` enum (8 states) | A custom-invented FSM |
| Live GUI updates | WebSocket `/sockets/events/{id}` + initial synthetic `ConversationStateUpdateEvent` | REST polling |
| Guaranteed audit trail | Event-stream webhook (`POST {base}/events/{id}`), batched + retried | WebSocket (best-effort only) |
| Start a run | `POST /events {run:true}` | A separate "start" endpoint (does not exist) |
| Approve/reject (both dev and plain-language UI) | `POST /events/respond_to_confirmation {accept:bool}` | Custom approval schema |
| Global safety enforcement | `SecurityAnalyzer` + `ConfirmationPolicy` + sandbox boundary | Repo-local `.openhands/hooks.json` alone |
| Secret handling | Built-in `SecretRegistry` (late-bound, masked, encrypted) | Custom secret-scanning reimplementation |
| Repo-specific automation | Global `GitService` protocol | Bespoke single-provider integration |
| Error handling (recoverable vs. fatal) | `AgentErrorEvent` (tool-scoped, continues) vs. `ConversationErrorEvent` (terminal, raises) | One generic error type |
| Ad-hoc operator commands | `/api/bash` + `/api/bash/search` | Injecting into agent's own terminal tool calls |

## 10. Gaps Confirmed Absent From the Framework (Must Be Built Externally)

The audit confirms the following are genuinely not provided by OpenHands and must be designed as external contracts by any integrating system, consistent with the prior architectural review's findings:

- No plain-language/outcome-level event schema — `display_name` and human-readable descriptions per tool/action do not exist natively; they must be layered on top of the raw `kind`/`tool_name` fields.
- No "publish" or deployment concept — this is entirely external to the framework and must be defined by the consuming application.
- No cross-repository memory or retrieval system — the `CondensationSummaryEvent`/condenser mechanism only compresses within a single conversation's context window, not across sessions.
- No global (cross-repository) hook enforcement — as established above, hooks are strictly repo-local.

---

## References

1. [The OpenHands Software Agent SDK: A Composable and ...](https://arxiv.org/html/2511.03690v1) - It exposes REST endpoints for conversation control (e.g., POST /conversations, GET /conversations/id...

2. [Events](https://docs.openhands.dev/sdk/arch/events) - The Event System provides an immutable, type-safe event framework that drives agent execution and st...

3. [REST API Reference | openhands/software-agent-sdk | DeepWiki](https://deepwiki.com/openhands/software-agent-sdk/5.5-rest-api-reference) - This document provides a complete reference for the REST API endpoints exposed by the OpenHands Agen...

4. [Agent Server (openhands-agent-server) | openhands/software-agent-sdk | DeepWiki](https://deepwiki.com/openhands/software-agent-sdk/5-agent-server-(openhands-agent-server)) - The `openhands-agent-server` package provides a production-ready HTTP/WebSocket server that exposes ...

5. [WebSocket API | openhands/software-agent-sdk | DeepWiki](https://deepwiki.com/openhands/software-agent-sdk/5.6-websocket-api) - This document describes the WebSocket API for real-time event streaming from agent conversations in ...

6. [Webhook System | openhands/software-agent-sdk | DeepWiki](https://deepwiki.com/openhands/software-agent-sdk/5.4-webhook-system) - This document describes the webhook notification system in the agent server, which enables external ...

7. [Hooks - OpenHands Docs](https://docs.openhands.dev/openhands/usage/customization/hooks) - Hooks let you run custom shell scripts at key moments during an OpenHands session. s You can configu...

8. [🙌 OpenHands — Deep Dive & Build-Your-Own Guide 📚](https://dev.to/truongpx396/openhands-deep-dive-build-your-own-guide-1al0) - A practical, technical walkthrough of how OpenHands (formerly OpenDevin) actually works, what makes ...

9. [Security and Confirmation Mode | OpenHands/software-agent-sdk | DeepWiki](https://deepwiki.com/OpenHands/software-agent-sdk/3.4-security-and-confirmation-mode) - This document describes the security features of the OpenHands Agent SDK, including the security pol...

10. [Security & Action Confirmation](https://docs.openhands.dev/sdk/guides/security) - Confirmation policy controls whether actions require user approval before execution. They provide a ...

11. [Confirmation Mode | openhands/software-agent-sdk | DeepWiki](https://deepwiki.com/openhands/software-agent-sdk/2.3.2-confirmation-mode) - Confirmation Mode is a safety mechanism in the OpenHands SDK that pauses agent execution before perf...

12. [Secret Registry](https://docs.openhands.dev/sdk/guides/secrets) - The Secret Registry provides a secure way to handle sensitive data in your agent's workspace. It aut...

13. [The OpenHands Software Agent SDK: A Composable and ...](https://openreview.net/pdf?id=pzVmWs6yGq) - by X Wang · Cited by 34 — SecretRegistry provides secure, late-bound, and re- motely manageable cred...

14. [Command Line Interface | All-Hands-AI/OpenHands | DeepWiki](https://deepwiki.com/All-Hands-AI/OpenHands/10.1-command-line-interface) - This document describes OpenHands' Git provider integration system, which enables unified interactio...

