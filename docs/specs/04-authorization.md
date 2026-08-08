# 04. Authorization - The Missing Primitive (Phase 1, Highest Priority)

> **AMENDED v4.3 (2026-08-08) by [ADR-003](../../adrs/ADR-003-single-operator-remove-household.md).**
> The authorization safety plane is **retained in full**. Only the multi-user dimension is
> removed: per-user default stops, the non-technical comprehension gate, `created_by`
> attribution, assist mode, and delegated approval (4.2.2). This file authorizes *the
> agent's actions*; it is not user authentication and is not weakened by single-operator
> deployment.

## 4.1 Trust dial (not a checkbox)

| Stop | Maps to | Behavior |
|---|---|---|
| Ask always | AlwaysConfirm() | Every action pauses for approval |
| Ask on risky | ConfirmRisky(threshold=HIGH, confirm_unknown=True) | Only HIGH-risk (and by default UNKNOWN) actions pause |
| Ask on writes outside worktree | Custom SecurityAnalyzerBase subclass composed into EnsembleSecurityAnalyzer, elevating out-of-worktree writes to **HIGH**, feeding standard ConfirmRisky(threshold=HIGH) | Read-only and in-scope writes proceed; out-of-scope pauses |
| Never | NeverConfirm() | Full autonomy - explicit opt-in only |

(v4.0 correction) The threshold and confirm_unknown parameters that actually exist on ConfirmRisky() must be surfaced in the trust-dial settings UI, not left as invisible defaults - a user should be able to see and adjust whether UNKNOWN-risk actions pause or proceed.

> **CORRECTION 2026-08-08 - ratified as ADR-006.**
> The row above previously said the analyzer elevates out-of-worktree writes "to at least MEDIUM"
> paired with "standard ConfirmRisky()". Implementing it as an executable predicate showed that
> combination **cannot produce this row's own stated behavior**: standard ConfirmRisky is
> threshold=HIGH, so a MEDIUM elevation is below the threshold and the stop becomes **inert** -
> it would ship looking correct while pausing on nothing new. Lowering the threshold to MEDIUM
> instead makes ordinary in-scope MEDIUM edits pause, contradicting "in-scope writes proceed".
> Elevating to **HIGH** against the standard HIGH threshold is the only combination that matches.
> This does not re-litigate the hard correction below - the analyzer still does the path-scoping.

Hard correction (final, do not re-litigate): ConfirmationPolicyBase.should_confirm() receives only a SecurityRisk enum value - path-scoping logic is architecturally impossible at the policy layer. The correct implementation is a custom SecurityAnalyzerBase subclass (whose security_risk(action) DOES receive the full action) that elevates any out-of-worktree write to at least MEDIUM, composed into EnsembleSecurityAnalyzer, paired with standard ConfirmRisky(). Do not subclass ConfirmationPolicyBase for this stop.

- Must be settable per task type, not only globally.
- Must be mutable mid-run without cancelling the conversation - wire directly to conversation.set_confirmation_policy().
- Race-condition rule: if the trust dial is made stricter while an action is WAITING_FOR_CONFIRMATION, that pending action is evaluated against the policy in force at the time it was raised and is never retroactively auto-approved or auto-rejected.

### 4.1.1 Policy-lock visualization

Add a small lock icon and tooltip on any pending authorization card explaining a dial change won't affect this pending action.

## 4.2 Interrupt / authorization cards

When the conversation enters WAITING_FOR_CONFIRMATION, render a rail-anchored card containing:
- The exact command/patch/tool call about to execute.
- The risk level, labelled as **the LLM's** assessment — `ActionEvent.security_risk`, whose native field description reads "The LLM's assessment of the safety risk of this action" (`sdk/event/llm_convertible/action.py:66-69`). Never render it as an unattributed verdict.
- ~~which analyzer flagged it (pattern/policy-rail/LLM/GraySwan/ensemble) plus rationale~~ — **REMOVED 2026-08-08 by ADR-015 Status amendment.** Not native and **not recoverable**: `SecurityAnalyzerBase.security_risk()` returns a bare four-value enum with no provenance carrier (`sdk/security/analyzer.py:26`, `sdk/security/risk.py:13-23`), and `EnsembleSecurityAnalyzer` collects child verdicts into a *local* list and returns `max(concrete)`, discarding attribution at the return boundary (`sdk/security/ensemble.py:80-101`). Displaying it would be manufacturing it.
- **Substituted for the above, all native:** the LLM's own account of the action — `ActionEvent.summary` (LLM-provided ~10-word explainability string), `thought`, and `reasoning_content` (`action.py:26-88`) — each labelled as the agent's account, not an analyzer's justification. Optionally the **configured** analyzer set from `EnsembleSecurityAnalyzer.analyzers` (`ensemble.py:64-68`), labelled as configuration, never as attribution.
- Blast radius: files, paths, network hosts, credentials touched. **Classified DERIVED** under ADR-015: a per-tool projection over the native `ActionEvent.action`, `tool_call`, and `tool_name` (`action.py:40-56`). Subject to all five DERIVED conditions, including **(e)** — the native inputs must be displayed inline at their native field names so the operator can audit the derivation. One declared formula per tool class; a tool class with no declared projection renders `null`, not an empty blast radius. An empty list and an uncomputed list must never look alike.
- If upstream context is tagged untrusted per 04a-prompt-injection.md, display a distinct badge separate from the risk badge.
- Three actions: Approve / Reject with reason (free-text required) / Approve and relax for this class.
- Wire Reject directly to conversation.reject_pending_actions(reason).
- UX pattern references (read source directly, see 12-portable-components.md): agentkitai/agentgate's dashboard/policy engine, CopilotKit's human-in-the-loop example.

### 4.2.1 Authorization audit log

- Every approval, rejection-with-reason, and "relax for this class" event is written to a visible, exportable authorization log.
- Every "relax for this class" grant is session-scoped and expires automatically at conversation end.
- The trust-dial widget displays a live badge count of currently-active relaxations for the session.
- Cross-links to the Context Inspector's per-item provenance data.

## 4.2.2 ~~Optional delegated approval~~ - REMOVED v4.3

> **AMENDED v4.3 (2026-08-08) by [ADR-003](../../adrs/ADR-003-single-operator-remove-household.md).**
Single-operator deployment: there is no delegate to route to. The pending-action policy
lock semantics from 4.1 are unaffected.

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

Phase 1 exit criteria (cumulative, v4.3): the operator can approve, reject-with-reason, and adjust the trust dial mid-run without restarting; a pending action is never retroactively (auto-)approved; an untrusted-content-derived action correctly surfaces its provenance badge; a "relax for this class" grant correctly expires and appears in the audit log; a synthetic stuck-loop scenario surfaces the intervention card with all five actions wired; a synthetic hard-budget scenario correctly pauses with Extend/Review; reliability-tier indicator and malformed-tool-call diagnostic pass synthetic tests; cloud-fallback escape hatch preserves context; the scope-shape review screen is present and functional; UNKNOWN-risk handling is visibly configurable. All demonstrable in both Vibe and Pro lenses (Principle 11).