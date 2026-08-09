# 13. Hard Constraints Checklist (Verify Before Every PR)

> **EXECUTABLE 2026-08-08 by [ADR-018](../../adrs/ADR-018-hard-constraints-runner.md).**
> This file is the **source of truth** and is reconciled by `scripts/check-hard-constraints.py`
> against `scripts/hard_constraints/registry.py`, which assigns every gate below exactly one tier:
> `STATIC` (a predicate runs against the tree now), `PHASE` (the surface does not exist yet; an
> owning phase is named), `WITNESS` (no mechanical test exists; the recording artefact is named),
> or `RETIRED` (struck, with the retiring ADR named). Adding a gate here without registering it
> fails the build, and so does a registry entry matching no gate. Run it with
> `./scripts/verify-local.sh --constraints-only`.
>
> Gates are **never** edited to make the runner green. The runner adapts to this file, not the
> reverse. The one strike below predates the runner and implements an already-ratified ADR.

- [ ] No UI path calls conversation.execute_tool() for anything above LOW risk, scoped correctly to LocalConversation.
- [ ] Every reject action requires and passes a free-text reason to reject_pending_actions(reason).
- [ ] Trust dial changes call set_confirmation_policy() and do not require conversation restart.
- [ ] The "writes outside worktree" stop is implemented as a custom SecurityAnalyzerBase, NOT a custom ConfirmationPolicyBase.
- [ ] A pending action's confirmation policy is locked to the policy in force when raised - mid-flight dial changes never retroactively (auto-)approve or (auto-)reject it.
- [ ] ~~Risk badges display analyzer identity, not just a risk level.~~ **RETIRED 2026-08-08
      by [ADR-015](../../adrs/ADR-015-native-fidelity-boundary.md) Status amendment**, which
      already removed the same requirement from `04-authorization.md` §4.2. Analyzer identity is
      not merely unimplemented, it is **not recoverable**: `SecurityAnalyzerBase.security_risk()`
      returns a bare four-value enum with no provenance carrier, and `EnsembleSecurityAnalyzer`
      discards child attribution at the return boundary. This gate demanded a field ADR-015 proved
      cannot be supplied without manufacturing it. See ADR-015 for the native substitutes.
- [ ] Untrusted-content provenance badges are visually distinct from risk badges on authorization cards.
- [ ] Every approval, rejection, and "relax for this class" grant is written to the audit log; relaxation grants expire at conversation end.
- [ ] AgentErrorEvent, ConversationErrorEvent, and partial-streaming-failure states never share the same UI treatment.
- [ ] All telemetry reads route through your versioned adapter, never a hardcoded StatsConversationStateUpdateEvent reference.
- [ ] Local-provider telemetry distinguishes thermal/power-limit degradation from layer-offload degradation, fused when both fire simultaneously.
- [ ] Any diff view enforces all four latency/fps/memory gates before shipping, plus the fifth semantic-diff comprehension gate.
- [ ] Accept All is never the heaviest-weight button on any review screen.
- [ ] The batch-review line threshold is user-configurable, not hardcoded; a "lines accepted without inspection" counter is persisted per session.
- [ ] Agent-authored commit trailers use the X-Agent-* namespace, not Co-authored-by.
- [ ] Every new theme token has a CI-checked contrast ratio; Target Size Minimum labeled AA and Focus Appearance labeled AAA - never bundled under one AA claim.
- [ ] Screen-reader mode is detectable and functional across conversation, authorization-card, terminal, plan-tree, and diff-view surfaces.
- [ ] Non-rewindable side effects are explicitly surfaced in any rewind/fork-from-step UI, and a rewind produces a new Plan revision rather than overwriting.
- [ ] Fork-from-step, rewind, and the v1.2.0 conversation-branch feature route through one shared primitive; plan-revision history renders as a DAG, not an assumed tree.
- [ ] ~~Before adding a new tab/route, confirm it doesn't duplicate an existing one - extend in place.~~ **RETIRED v4.2 by ADR-001** - replaced by the v4.2 gates below.
- [ ] StuckDetector is wired directly, not rebuilt.
- [ ] ask_agent() backs the explain affordance, not a bespoke call.
- [ ] Any action rated LOW risk under the current trust dial produces zero modal interruptions.
- [ ] Trust-class tags are consistently visible across the Context Inspector, authorization cards, and plan evidence chains.
- [ ] A plan exceeding the configurable untrusted-evidence threshold blocks task approval behind an explicit interstitial.
- [ ] The scope-shape review screen renders before hunk-level review is reachable.
- [ ] Budget ceiling is denominated correctly per provider and is orthogonal to the trust dial.
- [ ] Kinetic-feedback/motion treatments never relax a diff-performance gate or an accessibility gate.
- [ ] Authorization-card actions above read-only are unavailable below the 900px breakpoint (**done** —
      `AuthorizationCard` + `e2e/authorization-narrow.spec.ts`, ADR-022); hunk-level swipe review
      remains available (**not done** — no diff surface exists yet; unchecked until it does).
- [ ] Vibe Mode and Pro Mode share one data model; switching lenses never triggers a route change, data refetch, or loss of in-progress input.
- [ ] Notifications for the five specified event types write to the inbox as the record of truth, independent of desktop-notification delivery success.
- [ ] Air-gapped mode passes CI under network-namespace isolation with all network-dependent features disabled.
- [ ] The mode toggle is a binary control, never a segmented control implying a third state.
- [ ] Stock/unmodified Agent Canvas is never exposed as a runtime-selectable mode, settings option, or documented user-facing surface.
- [ ] Model profiles record generation/family version and dense-vs-MoE architecture as fields distinct from parameter count and quantization.
- [ ] The local-provider budget ceiling includes a tool-call-depth axis independent of turn count and wall-clock time.
- [ ] Malformed-tool-call-output, tool-call-abandonment, and circular-retry are each surfaced with a distinct diagnostic.
- [ ] The cloud-fallback escape hatch preserves conversation and plan context across a per-task model substitution.
- [ ] Rewind/fork UI displays the correct disclosure conditional on the deterministic_replay flag, not a dismissible one-time tooltip.
- [ ] No Compare-mode or speculative-execution worktree-spawn UI ships before Phase 6.
- [ ] The scope-shape screen's security checklist fires before generic pattern-analyzer risk scoring.

## v4.0 additions

- [ ] No third-party-untrusted-tagged content reaches the privileged planning conversation without first passing through a quarantined summarization step or an Action-Selector-constrained tool call.
- [ ] Quarantine invocations are logged to the authorization audit log with source and trust class.
- [ ] The vision-based browser fallback has no exception path around quarantine.
- [ ] The trust-dial settings UI names the threshold and confirm_unknown parameters of ConfirmRisky(), not just a single "Ask on risky" label.
- [ ] motion/react is used for all new animation code; framer-motion is not added as a new dependency.
- [ ] Aceternity UI and Magic UI components are vendored source in components/ui/, not listed as npm dependencies, and pass the same CI contrast gates as project code.
- [ ] Model profiles include a deterministic_replay boolean field, correctly read by the rewind/fork disclosure UI.
- [ ] Shared conversation visibility is opt-in per conversation, never a global "family can see everything" toggle.
- [ ] Every Phase 1-5 exit criterion is demonstrated in both Vibe and Pro lenses, not only Pro.

## v4.1 additions


## v4.2 additions (ADR-001 - integration boundary)

- [ ] No OpenHands source file is modified, forked, or patched by this project. The
      upstream checkout is read-only.
- [ ] OpenHands is consumed only as pinned artifacts: `agent-server` Docker image pinned
      by digest, `openhands-sdk` family pinned in the Python lockfile,
      `@openhands/typescript-client` pinned in the frontend lockfile.
- [ ] Before building any new surface, confirm no Agent Canvas donor component already
      solves it; if one does, vendor it and log the port in `PORTING_LEDGER.md` with
      source URL, commit SHA, SPDX license, and modification notes.
- [ ] All policy-bearing logic - confirmation policies, security analyzers, StuckDetector,
      block_action/block_message, untrusted-content quarantine, audit log - lives in the
      Python middleware, never in the browser.
- [ ] The frontend never calls the Agent Server directly for anything policy-bearing; it
      goes through the OH-GUI middleware API.
- [ ] Third-party client surface is confined behind the middleware anti-corruption layer,
      so an upstream API change touches one module.

## v4.3 additions (ADR-003 - single operator)

- [ ] No schema carries a user/owner/profile identity field. One operator, no attribution dimension.
- [ ] No UI surface references profiles, proficiency tiers, delegates, assist mode, or a household-wide view.
- [ ] The authorization safety plane is intact: trust dial, authorization cards, capability manifest, emergency stop, `execute_tool()` bypass closure, untrusted-content quarantine, and audit log all ship in Phase 1. Removing multi-user must not weaken any of these.
- [x] Below 900px the surface is read-only with no exception path. Approve/reject/relax require >=900px.
  Enforced frontend-only and deliberately not mirrored in the middleware — viewport is
  client-reported, so a server-side check would be theatre ([ADR-022](../../adrs/ADR-022-narrow-viewport-gate-is-a-ui-affordance.md)).
  Proven headed at 390/820/899/900/1280px, and mutation-tested (5 browser mutants, 11 unit mutants).
- [ ] Vibe and Pro lenses remain a semantic-zoom pair for one operator; every Phase 1-5 exit criterion is still demonstrated in both.

## v4.4 additions (ADR-015 - native-fidelity boundary)

- [ ] Every field the GUI exposes traces to a verified native field of the supplying system, with
      the artifact path and line/schema location recorded. Documentation is not verification.
- [ ] Where upstream code and upstream documentation disagree, the code is implemented and the
      disagreement is logged.
- [ ] No adapter merges two native states into one, splits one into two, reinterprets an enum, or
      changes a unit without recording the conversion.
- [ ] Unhandled native event kinds are surfaced as unhandled, never folded into a neighbouring kind
      or silently dropped.
- [ ] A missing native signal renders as `null`. No default value is manufactured - least of all a
      favorable one.
- [ ] No input control ships unless a test fails when its consumer is absent. No orphaned settings.
- [ ] DTOs for the Agent Server are generated from the upstream OpenAPI document and diffed, never
      hand-written.
- [ ] Non-OpenHands data (NVML, nvidia-smi, Ollama) uses that system's native field names. tok/s is
      never computed from GPU telemetry.
- [ ] No OH-GUI surface re-implements upstream semantics it could read; display mirrors are deleted,
      not tested.
- [ ] Every `PORTING_LEDGER.md` entry carrying OpenHands data records its Native basis.

## v4.5 additions (ADR-021 — the DTO generation boundary)

- [ ] Every upstream-shaped type that is hand-authored rather than generated carries an ADR-015
      native basis in its docstring - the artifact path and line it was read from, not the document
      that described it. A type whose basis names documentation is marked
      `PROVISIONAL - UNVERIFIED` and no enforcement path is wired to it.

## v4.6 additions (ADR-026 — the extension-only posture)

- [ ] No file under `apps/`, `services/`, or `bench/` references the vendored evidence snapshots
      under `review/_sdk_src/`. They are evidence to cite, never a dependency to import.
- [ ] No dependency declaration resolves OpenHands to a fork, git URL, or local path. Upstream is
      consumed at its published version.
- [ ] Every file under `review/_sdk_src/` is byte-identical to the published upstream artifact it
      came from, verified against a committed hash manifest.
- [ ] Every `review/_sdk_src/` path cited by an ADR or spec exists **at the cited line**. A citation
      that cannot be opened is not evidence.

## v4.7 additions (ADR-015 amendment 2 — PRESENT-BUT-UNCONSUMED)

- [ ] No OH-GUI surface reads, writes, displays, or enforces against a field classified
      PRESENT-BUT-UNCONSUMED — declared in a verified upstream artifact but with no consumer in it.
      A declaration is not a contract.
