# 04. Authorization - The Missing Primitive (Phase 1, Highest Priority)

## 4.1 Trust dial (not a checkbox)

| Stop | Maps to | Behavior |
|---|---|---|
| Ask always | AlwaysConfirm() | Every action pauses for approval |
| Ask on risky | ConfirmRisky(threshold=HIGH, confirm_unknown=True) | Only HIGH-risk (and by default UNKNOWN) actions pause |
| Ask on writes outside worktree | Custom SecurityAnalyzerBase subclass composed into EnsembleSecurityAnalyzer, feeding ConfirmRisky() | Read-only and in-scope writes proceed; out-of-scope pauses |
| Never | NeverConfirm() | Full autonomy - explicit opt-in only |

(v4.0 correction) The threshold and confirm_unknown parameters that actually exist on ConfirmRisky() must be surfaced in the trust-dial settings UI, not left as invisible defaults - a user should be able to see and adjust whether UNKNOWN-risk actions pause or proceed.

Hard correction (final, do not re-litigate): ConfirmationPolicyBase.should_confirm() receives only a SecurityRisk enum value - path-scoping logic is architecturally impossible at the policy layer. The correct implementation is a custom SecurityAnalyzerBase subclass (whose security_risk(action) DOES receive the full action) that elevates any out-of-worktree write to at least MEDIUM, composed into EnsembleSecurityAnalyzer, paired with standard ConfirmRisky(). Do not subclass ConfirmationPolicyBase for this stop.

- Must be settable per task type, not only globally.
- Must be mutable mid-run without cancelling the conversation - wire directly to conversation.set_confirmation_policy().
- Race-condition rule: if the trust dial is made stricter while an action is WAITING_FOR_CONFIRMATION, that pending action is evaluated against the policy in force at the time it was raised and is never retroactively auto-approved or auto-rejected.
- (v4.0) In household deployments, per-user default stops seed this control at profile creation but never hard-lock it.

### 4.1.1 Policy-lock visualization

Add a small lock icon and tooltip on any pending authorization card explaining a dial change won't affect this pending action.

## 4.2 Interrupt / authorization cards

When the conversation enters WAITING_FOR_CONFIRMATION, render a rail-anchored card containing:
- The exact command/patch/tool call about to execute.
- The risk level AND which analyzer flagged it (pattern/policy-rail/LLM/GraySwan/ensemble) plus rationale.
- Blast radius: files, paths, network hosts, credentials touched.
- If upstream context is tagged untrusted per 04a-prompt-injection.md, display a distinct badge separate from the risk badge.
- Three actions: Approve / Reject with reason (free-text required) / Approve and relax for this class.
- Wire Reject directly to conversation.reject_pending_actions(reason).
- (v4.0) For non-technical users, this card's copy must pass a comprehension check with a non-technical reviewer before Phase 1 exit - see 15-household-profiles.md section 15.2.
- UX pattern references (read source directly, see 12-portable-components.md): agentkitai/agentgate's dashboard/policy engine, CopilotKit's human-in-the-loop example.

### 4.2.1 Authorization audit log

- Every approval, rejection-with-reason, and "relax for this class" event is written to a visible, exportable authorization log.
- Every "relax for this class" grant is session-scoped and expires automatically at conversation end.
- The trust-dial widget displays a live badge count of currently-active relaxations for the session.
- Cross-links to the Context Inspector's per-item provenance data.
- (v4.0) Every log entry carries a created_by field (household user); cross-user "assist" actions logged with both identities - see 15-household-profiles.md section 15.4.
- Delegated approvals are also logged here, recording delegator, delegate approver, owning conversation user, original risk level, final decision, and whether the delegate approved directly or returned the card unresolved.

## 4.2.2 Optional delegated approval for novice-owned conversations

To preserve autonomy without forcing novices to adjudicate blast radius alone, add an optional delegated-approval path for household deployments.

- Available only when the owning conversation user is a novice-tier household profile, or when any profile explicitly opts into it for that conversation.
- The owner may nominate one or more household expert/intermediate delegates at profile setup or per conversation; default is off.
- For actions at or above a configurable threshold (default HIGH), the authorization card adds a fourth action: "Ask delegate to review."
- This action does not approve anything. It routes the pending card to the selected delegate's "needs you" inbox and desktop notifications, marks the owner card as awaiting delegated review, and preserves the original policy lock semantics from section 4.1.
- The delegate can Approve, Reject with reason, or Return to owner with note; all three outcomes are logged in section 4.2.1.
- The owner can always revoke delegation for future cards and can still approve or reject the currently pending card themselves from a >=900px viewport.
- Delegation is advisory-assistive, not a hard permission wall: it never prevents the owner from switching to Pro Mode or making their own decision from an eligible viewport.
- Below the 900px breakpoint, delegated review is the only above-read-only path exposed in the novice owner's UI; direct Approve / Reject / Relax remain unavailable there per 03-layout.md section 3.2.
- For a delegate acting on someone else's conversation, the UI enters explicit assist mode and the conversation banner shows "currently assisted by [user]" per 15-household-profiles.md section 15.4.

## 4.3 Batching to avoid approval fatigue

Batch low-risk items into a single review screen; interrupt immediately only for HIGH risk. Trigger confirmation for: deleting many files, writing outside project root, reading .env/SSH keys/cloud credentials, network calls to new hosts, package installation, privileged commands, CI/CD config changes, git push, package publish, database migrations, browser control, first-time MCP server access.

## 4.4 Capability manifest

Each task carries a visible, human-readable capability envelope: repository read/write scope, shell permissions, network allow-list, secrets access, git push permission, cloud API access.

## 4.5 Emergency stop

Global, always-visible control distinct from "cancel conversation": pauses the loop, terminates active processes, revokes network access and credentials, freezes the worktree, captures an incident snapshot.

## 4.6 Isolation boundary must be visible

Visually distinguish Git isolation from runtime isolation.

## 4.7 Vision-based browser fallback - elevated risk default

The highest prompt-injection surface. Default to confirm-by-default regardless of global trust-dial setting.

## 4.8 Close the execute_tool() bypass

Hard constraint: conversation.execute_tool() skips both the analyzer and confirmation policy. No UI affordance may route through it for anything above LOW risk.

## 4.9 Untrusted-content provenance - see 04a-prompt-injection.md

The trust-class tagging described there is necessary but, per Principle 8, insufficient on its own.

## 4.10 Speculative execution - a trust-dial-adjacent mode (execution scope demoted)

A "Speculative" mode: the agent spawns N parallel attempts in disposable worktrees with varied prompts/constraints, auto-prunes failures, surfaces only survivors.
- Tracked separately in the audit log.
- Respects the budget model.
- Scope: control, audit-log wiring, budget pre-check ship in Phase 1; actual spawn mechanism ships in Phase 6.

## 4.11 Stuck-state intervention surface (elevated priority)

StuckDetector.is_stuck() firing triggers a dismissible-but-persistent card with one-click actions: Nudge simplify, Nudge add constraint, Nudge switch model, Fork and restart from step N, Kill and open post-mortem. Each logged to section 4.2.1.

Phase 1 exit criteria (cumulative): a user can approve, reject-with-reason, and adjust the trust dial mid-run without restarting; a pending action never retroactively (auto-)approved; an untrusted-content-derived action correctly surfaces its provenance badge; a "relax for this class" grant correctly expires and appears in the audit log; a synthetic stuck-loop scenario surfaces the intervention card with all five actions wired; a synthetic hard-budget scenario correctly pauses with Extend/Review; reliability-tier indicator and malformed-tool-call diagnostic pass synthetic tests; cloud-fallback escape hatch preserves context; (v4.0) scope-shape review screen is present and functional; (v4.0) UNKNOWN-risk handling is visibly configurable; (v4.1) delegated approval routes a HIGH-risk novice-owned card to the selected delegate without changing the underlying pending-action policy lock, and the delegate outcome is attributed correctly in the audit log.