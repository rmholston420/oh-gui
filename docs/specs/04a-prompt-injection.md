# 04a. Prompt-Injection Containment (NEW in v4.0, Phase 1)

## 4.9 Untrusted-content provenance and prompt-injection surface

Every MCP tool output, fetched web page, third-party issue/PR comment, and file read from outside the user's own workspace is a potential injected-instruction vector.
- [REQ-04a-001] Every item entering the Context Inspector must carry a trust class: first-party / workspace-derived / third-party-untrusted.
- [REQ-04a-002] Any ActionEvent whose justification traces back to a third-party-untrusted context item must propagate that flag into its authorization card as a distinct badge - injection risk and execution risk are different axes.
- [REQ-04a-003] Use the SDK's state.block_action(reason) / state.block_message(reason) as the enforcement point.
- [REQ-04a-004] Treat the open upstream OPA/Rego policy-guard proposal as the likely long-term home for this logic.

## 4.9.1 Structural quarantine (v4.0 addition - closes the display-is-not-enforcement gap)

Trust-class display (section 4.9) is a labeling layer, not a defense on its own. Once a privileged planning context has ingested untrusted tokens, downstream gating (confirmation cards, provenance badges) cannot reliably undo that ingestion - the more reliable defenses operate before ingestion, isolating untrusted content from the agent's control flow.

Required pattern: reuse the Spec Wizard's quarantine shape (14-spec-wizard.md section 14.10), generalized.

> **AMENDED 2026-08-08 by [ADR-019](../../adrs/ADR-019-spec-wizard-phase-placement.md) and
> [ADR-020](../../adrs/ADR-020-audit-log-provenance-reference.md).**
>
> - **The dependency direction is inverted.** "Reuse the Spec Wizard's shape" reads as though
>   the wizard ships first, but the wizard is at the Phase 1→2 boundary and this section is in
>   Phase 1. **Phase 1 builds the restricted-capability primitive**; the wizard is its second
>   consumer, not its origin. §14.10 and this section describe the same mechanism, built once.
> - **Audit logging** (bullet 4 below) writes into the structured `provenance` shape defined by
>   ADR-020 in `04-authorization.md` §4.2.1 — stable `id`, `trust_class`, `source`, captured at
>   invocation time. The "cross-linked from the Context Inspector" half is Phase 5; Phase 1
>   records the IDs and does not render a cross-link.

- [REQ-04a-005] Any content tagged third-party-untrusted MUST first pass through a quarantined summarization step: a dedicated, short-lived SDK Conversation/Agent instance with no tool access (no bash, no file-edit, no further MCP calls) that reads the untrusted content and returns only a plain-text summary or a small set of symbolic variables - never the raw untrusted bytes.
- [REQ-04a-006] The privileged planning conversation only ever sees the quarantined summary or symbolic references, never the raw content.
- [REQ-04a-007] Where summarization cannot be applied (a tool's raw structured output must be parsed exactly), fall back to an Action-Selector pattern: the untrusted content may only select from a hardcoded, pre-defined list of tool calls - it can never introduce a new free-form instruction into the agent's context.
- [REQ-04a-008] This quarantine step is itself audited: every invocation is logged (source, trust class, summary produced) to the authorization audit log, cross-linked from the Context Inspector.
- [REQ-04a-009] Performance note: quarantine adds one extra LLM round-trip per untrusted-content ingestion. For a single local Qwen3 27B-35B instance, this is a real latency cost - batch quarantine requests where multiple untrusted items arrive in the same turn, and surface a distinct "summarizing untrusted content" state.
- [REQ-04a-010] Vision-based browser fallback is the highest-risk case for this pattern - any content extracted from a rendered page MUST pass through quarantine before reaching the planning context, with no exception path.

Hard Constraints Checklist addition (cross-reference 13-hard-constraints.md):
- [ ] [REQ-04a-011] No third-party-untrusted-tagged content reaches the privileged planning conversation without first passing through a quarantined summarization step or an Action-Selector-constrained tool call.
- [ ] [REQ-04a-012] Quarantine invocations are logged to the authorization audit log with source and trust class.
- [ ] [REQ-04a-013] The vision-based browser fallback has no exception path around quarantine.
