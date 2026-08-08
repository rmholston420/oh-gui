> # ARCHIVED - REMOVED FROM THE SPEC v4.3 (2026-08-08)
>
> **Removed by [ADR-003](../../../adrs/ADR-003-single-operator-remove-household.md).**
> OH-GUI is single-operator. The v4.0 multi-user household premise was wrong and is
> withdrawn. Nothing in this file is in force. It is retained only so the removal is
> auditable.
>
> **Do not resurrect any of this**: household profiles, proficiency tiers, per-user default
> trust-dial stops, `created_by` attribution, assist mode, delegated approval, per-user
> inbox scoping, or per-user budget pooling. See `99-appendix-superseded.md`.

---

# 15. Multi-User Household Profiles (NEW in v4.0 — PHASE 1, fixed by ADR-002)

## 15.1 Rationale

The base spec scopes trust dial, budget, and Session Profile Card per-conversation/per-project, with an implicit single-operator assumption. A household deployment with mixed technical proficiency (expert operator plus non-technical family members) requires per-user identity to be a first-class dimension, not an afterthought bolted onto conversation metadata.

Timing decision (set at Phase 0, see 02-repo-setup.md item 9): ship in Phase 1 if a non-technical user will use the system within the first month of deployment; otherwise defer to Phase 3 alongside the Plan-model slice, since both phases touch conversation ownership semantics.

> **DECIDED 2026-08-08 by [ADR-002](../../adrs/ADR-002-household-mode-phase-1.md): PHASE 1.**
> The conditional above is resolved. Household mode ships with the Phase 1 authorization
> slice, not Phase 3. Every "if elected at Phase 0" / "Phase 1 or Phase 3" qualifier in
> this file and in 11-dev-plan.md now reads as Phase 1. The §15 exit criterion below is a
> Phase 1 exit gate.

## 15.2 User profile schema

HouseholdUser: id, display_name, proficiency_tier (novice / intermediate / expert), default_lens (Vibe / Pro), default_trust_dial_stop, default_review_line_threshold, default_budget_ceiling, can_modify_own_trust_dial (bool), can_view_other_users_conversations (bool), optional_delegate_ids list

- proficiency_tier drives defaults, never hard limits. A novice user can still switch to Pro Mode or loosen their trust dial - Principle 9 (nothing in Vibe is unavailable in Pro) and Principle 4 (expose boundaries, don't restrict autonomy) both argue against a hard-coded permission wall. The tier only seeds sane starting values at profile creation.
- Novice default stop is stricter than the system-wide default. A novice-tier profile defaults to AlwaysConfirm() for its first N conversations (configurable, default 10), stepping down to ConfirmRisky() only after an explicit "I understand what this means" acknowledgment - mirroring the first-run trust-dial walkthrough (03-layout.md section 3.4) but per-user, not per-install.
- Auto-detection is out of scope. Proficiency tier is self-declared at profile setup, not inferred from behavior.
- Optional delegated approval may be configured for novice-tier users during onboarding or later per conversation. It is off by default, records one or more eligible household delegates, and remains assistive rather than mandatory.

## 15.3 Conversation and audit attribution

- Every conversation, authorization-log entry, and budget-ledger entry carries a created_by: HouseholdUser.id field, additive to existing schema.
- Default visibility: private to the creating user, shared conversations are opt-in. A "share this conversation" action makes it visible (read-only by default) to other household users; reuses the fork-view banner pattern from 05-plan-model.md section 5.5.1.
- The "needs you" inbox is per-user, not per-install.
- Delegated-review inbox entries are addressed to the selected delegate only, never broadcast to every expert profile.

## 15.4 Trust-dial and budget interaction with existing race-condition rules

- The race-condition rule in 04-authorization.md section 4.1 is unaffected by multi-user - it already operates at the conversation level, and conversations remain single-owner.
- Cross-user override is a distinct, logged action. If a more expert household user wants to approve or adjust an action inside a conversation owned by a novice user, that requires an explicit "assist" mode: the assisting user's identity is recorded in the audit log alongside the original owner's, and the conversation banner shows "currently assisted by [user]."
- Optional delegated approval is the preferred assist-mode entry point for novice-owned conversations: the owner explicitly requests delegated review on a pending authorization card, the selected delegate receives it in their inbox, and any resulting action is logged as assist-mode rather than silently replacing the owner.
- Budget ceilings default per-user but can be pooled at the project level if explicitly configured - relevant since local-provider budget is wall-clock/turn-count denominated, and a shared GPU means one user's long-running task affects another's available thermal/VRAM headroom. Surface as a shared-resource contention notice in the telemetry strip when a second user starts a conversation while another is actively running.

## 15.5 Onboarding

- The first-run wizard forks at step 1: "Set up for yourself, or set up your household?" Selecting household mode creates the first (owner/expert) profile, then offers "add another user" as a discrete, skippable step.
- Each subsequent household user gets their own abbreviated first-run pass (trust-dial walkthrough with a live harmless example) scoped to their own default stop, without re-running the model/agent connection step already completed by the household owner.
- For novice-tier profiles, the abbreviated pass includes an optional delegated-approval setup step that explains: when it can be used, who can be selected, that it is off by default, and that it does not remove the novice user's own authority.

## 15.6 Hard Constraints Checklist additions (cross-reference 13-hard-constraints.md)

- [ ] Every conversation, audit-log entry, and budget-ledger entry carries a created_by field; no cross-user attribution occurs without an explicit, logged "assist" action.
- [ ] The "needs you" inbox and desktop notifications are scoped per-user, never broadcast to all household profiles by default.
- [ ] A novice-tier profile's trust dial defaults to AlwaysConfirm() for its configurable step-down window, distinct from the system-wide ConfirmRisky() default.
- [ ] Shared conversation visibility is opt-in per conversation, never a global "family can see everything" toggle.
- [ ] Shared-GPU resource contention across concurrent household users' conversations surfaces as a distinct telemetry notice, not a silent slowdown.
- [ ] Delegated approval remains optional and owner-initiated; enabling it never removes the owner's ability to act from an eligible viewport.
- [ ] A delegated-review request targets only the selected delegate(s), not all expert users.

Exit criterion (**Phase 1**, per ADR-002): two household profiles with different proficiency tiers correctly receive independent default trust-dial stops at first run; a cross-user "assist" action is correctly attributed to both the assisting and owning user in the audit log; a shared conversation correctly renders read-only for a non-owner until explicitly forked; per-user "needs you" inbox entries never leak to a different profile's inbox in a synthetic two-user test; an optional delegated-review request from a novice-owned conversation on a sub-900px viewport reaches only the chosen delegate and preserves owner autonomy.