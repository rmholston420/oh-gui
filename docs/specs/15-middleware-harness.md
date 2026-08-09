# 15. Middleware — Surface/Protocol Adapter and Harness Residue (Phase 1)

**Governing ADRs:** [ADR-026](../../adrs/ADR-026-extension-only-posture-and-capability-allocation.md)
(extension-only allocation) and [ADR-027](../../adrs/ADR-027-openhands-is-the-harness.md)
(OpenHands is the harness).

## 15.1 Boundary and admission

OpenHands owns the agent harness: its conversation loop, event store, context system, tool
dispatch, skills, hooks, subagents, plugins, and native confirmation machinery. OH-GUI's
middleware is the remaining surface/protocol adapter layer, not a replacement runtime. The
pinned SDK's `Conversation.run()` executes the agent until the current message is processed or
the iteration limit is reached
(`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/conversation/base.py:213-218`);
`EventLog` already persists events with locking
(`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/conversation/event_store.py:30-40`).

- OH-GUI must consume OpenHands only through its published interfaces: it must not fork, patch, <!-- [REQ-15-001] -->
  monkey-patch, vendor-and-edit, or shadow-import OpenHands source. Evidence snapshots under
  `review/_sdk_src/` are authoring evidence only, never runtime dependencies.
- The middleware is a separate OH-GUI process that composes the Agent Server over its HTTP <!-- [REQ-15-002] -->
  surface. The GUI communicates with this process, rather than directly with the Agent Server
  for policy-bearing operations.
- Middleware must not implement a plan–act–observe loop, own tool dispatch, or orchestrate agent <!-- [REQ-15-003] -->
  turns. These are harness responsibilities and a second implementation is refused.
- A capability enters middleware only when all three admission conditions hold: it is not advice, <!-- [REQ-15-004] -->
  it is not a binary allow/deny decision that completes within the hook bound, and it is not
  scoped to one agent run. The allocating spec must record a cited pinned-SDK finding that no
  native OpenHands surface carries the capability.
- Middleware uses the lowest capable tier before admitting residue: guidance belongs in a skill; <!-- [REQ-15-005] -->
  deterministic, bounded binary denial belongs in a hook; a bounded role belongs in a subagent;
  and a plugin packages those native contributions.
- The agent-side OH-GUI footprint remains one versioned, uninstallable OpenHands plugin; the <!-- [REQ-15-006] -->
  middleware neither reimplements nor becomes a substitute for that plugin's native tiers.


## 15.2 Native seams and preservation rules

Hooks expose only `ALLOW` and `DENY`; `ASK` is absent and explicitly marked future in the pinned
SDK (`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/hooks/types.py:35-40`).
Native conversations already expose `set_confirmation_policy`, `reject_pending_actions`, `pause`,
and `interrupt`
(`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/conversation/base.py:238-290`).
The middleware adapts these seams; it does not recreate their semantics.

- Middleware projections must preserve native event kinds, states, identifiers, and terminal <!-- [REQ-15-007] -->
  distinctions. An upstream state that is unavailable renders as `null`; it must not be merged,
  split, relabelled, or given a manufactured default.
- The upstream conversation event log remains the source of truth for agent execution history. <!-- [REQ-15-008] -->
  Middleware may maintain read models and its own decision records, but must not present a
  parallel event log as agent execution truth.
- Middleware owns anti-corruption adapters and generated-or-explicitly-provisional DTO boundaries <!-- [REQ-15-009] -->
  between the Agent Server and OH-GUI. It exposes stable OH-GUI contracts without importing
  private SDK symbols or leaking unverified upstream-shaped types into the GUI.
- Middleware is the sole policy-bearing boundary between the GUI and OpenHands. A GUI control <!-- [REQ-15-010] -->
  captures an operator decision; middleware validates, records, and applies it through the
  native seam. A browser-only rule is not enforcement.

## 15.3 Phase 1 residue

The following Phase 1 responsibilities satisfy the admission test because they either span
conversations or require an operator decision. Their detailed user-visible behavior remains
specified by the owning Phase 1 files rather than duplicated here.
`AgentDefinition` natively carries an allowed-tool list, permission mode, per-run iteration cap,
and per-run budget cap
(`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/subagent/schema.py:198-253`);
the SDK also supplies `StuckDetector.is_stuck()`
(`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/conversation/stuck_detector.py:24-154`).

- Middleware maps task type and the operator's trust-dial decision to the applicable native <!-- [REQ-15-011] -->
  confirmation policy and risk threshold, records the policy in force for a pending action, and
  applies changes through the native conversation seam without creating a second approval engine.

- Middleware receives and validates authorization-card decisions, including reject-with-reason and <!-- [REQ-15-012] -->
  session-scoped relaxations, then records them in the authorization audit log with the native
  action identity and the policy context used for the decision.
- Middleware owns the cross-run authorization audit record and captures provenance at decision <!-- [REQ-15-013] -->
  time. Its schema distinguishes `provenance: null` (not captured) from `provenance: []`
  (captured with no informing item); it must reject omission rather than manufacture an empty
  array.
- Middleware carries trust-class and provenance references through its projections, including <!-- [REQ-15-014] -->
  quarantined-content and authorization records, so Phase 5's Context Inspector can resolve the
  captured identifiers without reconstructing past context.
- Middleware coordinates the restricted-capability quarantine primitive required by <!-- [REQ-15-015] -->
  `04a-prompt-injection.md`: the untrusted-content worker has no tool, file-edit, or arbitrary MCP
  access.
  Middleware records each quarantine invocation and uses the native restricted
  conversation/subagent seam rather than introduce its own agent loop.
- Middleware owns cross-run budget accounting and the provider-aware budget decision boundary, <!-- [REQ-15-016] -->
  including hard-limit pause behavior. Per-run caps, tool sets, and permission modes stay in the
  native subagent definition rather than becoming parallel middleware configuration.
- Middleware owns the versioned telemetry adapter that normalizes native conversation updates and <!-- [REQ-15-017] -->
  local-provider observations into OH-GUI's stable telemetry contract. It must not invent a
  nonexistent SDK stats event or make a browser a direct telemetry-policy boundary.

- Middleware projects native stuck detection, execution state, and interruption outcomes for the <!-- [REQ-15-018] -->
  GUI intervention surfaces. It may request the native pause or interrupt seam, but may not
  replace the SDK's detector or cancellation semantics.
- Middleware provides the capability-manifest, emergency-stop, and speculative-execution control <!-- [REQ-15-019] -->
  boundaries only to the Phase 1 extent named in `04-authorization.md`: manifest and stop
  coordination, plus speculative audit/budget pre-checks. Actual parallel-attempt spawning remains
  out of scope until Phase 6.

## 15.4 Explicit non-scope

The SDK's memory loader already joins the user and workspace `MEMORY.md` indexes under a
6000-character budget
(`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/context/memory.py:1-9,20-24`).
This establishes a native baseline, not authority for a replacement memory system.

- Middleware must not replace native `MEMORY.md`, native context condensation, agent event <!-- [REQ-15-020] -->
  persistence, confirmation-policy evaluation, security-analyzer evaluation, or subagent
  resource enforcement. Any later augmentation is separately admitted behind a port and preserves
  the native source of truth.
- Middleware must not use `Conversation.execute_tool()` as an authorization shortcut. The native <!-- [REQ-15-021] -->
  method bypasses the agent loop, confirmation policies, and security-analyzer checks
  (`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/conversation/base.py:368-377`).

- A requested capability that fails the admission test, lacks the required native-absence finding, <!-- [REQ-15-022] -->
  or appears to require an upstream modification is a stop condition: re-express it in a native
  tier, record it as absent, or file an upstream dependency. A local OpenHands patch is never an
  exit.

## 15.5 Phase 1 exit evidence

- Phase 1 exit evidence must demonstrate the middleware boundary with both Vibe and Pro clients: <!-- [REQ-15-023] -->
  no policy-bearing GUI-to-Agent-Server bypass, native trust-dial changes applied mid-run, a
  reject-with-reason decision, an audit entry preserving provenance null-versus-empty semantics,
  a quarantined-content record, budget pause behavior, and a stuck-state projection.
