# 13. Hard Constraints Checklist (Verify Before Every PR)

- [ ] No UI path calls conversation.execute_tool() for anything above LOW risk, scoped correctly to LocalConversation.
- [ ] Every reject action requires and passes a free-text reason to reject_pending_actions(reason).
- [ ] Trust dial changes call set_confirmation_policy() and do not require conversation restart.
- [ ] The "writes outside worktree" stop is implemented as a custom SecurityAnalyzerBase, NOT a custom ConfirmationPolicyBase.
- [ ] A pending action's confirmation policy is locked to the policy in force when raised - mid-flight dial changes never retroactively (auto-)approve or (auto-)reject it.
- [ ] Risk badges display analyzer identity, not just a risk level.
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
- [ ] Authorization-card actions above read-only are unavailable below the 900px breakpoint; hunk-level swipe review remains available.
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
- [ ] Below 900px the surface is read-only with no exception path. Approve/reject/relax require >=900px.
- [ ] Vibe and Pro lenses remain a semantic-zoom pair for one operator; every Phase 1-5 exit criterion is still demonstrated in both.
