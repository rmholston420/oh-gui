# 04a. Prompt-Injection Containment (NEW in v4.0, Phase 1)

## 4.9 Untrusted-content provenance and prompt-injection surface

Every MCP tool output, fetched web page, third-party issue/PR comment, and file read from outside the user's own workspace is a potential injected-instruction vector.
- Every item entering the Context Inspector must carry a trust class: first-party / workspace-derived / third-party-untrusted.
- Any ActionEvent whose justification traces back to a third-party-untrusted context item must propagate that flag into its authorization card as a distinct badge - injection risk and execution risk are different axes.
- Use the SDK's state.block_action(reason) / state.block_message(reason) as the enforcement point.
- Treat the open upstream OPA/Rego policy-guard proposal as the likely long-term home for this logic.

## 4.9.1 Structural quarantine (v4.0 addition - closes the display-is-not-enforcement gap)

Trust-class display (section 4.9) is a labeling layer, not a defense on its own. Once a privileged planning context has ingested untrusted tokens, downstream gating (confirmation cards, provenance badges) cannot reliably undo that ingestion - the more reliable defenses operate before ingestion, isolating untrusted content from the agent's control flow.

Required pattern: reuse the Spec Wizard's quarantine shape (14-spec-wizard.md section 14.10), generalized.

- Any content tagged third-party-untrusted MUST first pass through a quarantined summarization step: a dedicated, short-lived SDK Conversation/Agent instance with no tool access (no bash, no file-edit, no further MCP calls) that reads the untrusted content and returns only a plain-text summary or a small set of symbolic variables - never the raw untrusted bytes.
- The privileged planning conversation only ever sees the quarantined summary or symbolic references, never the raw content.
- Where summarization cannot be applied (a tool's raw structured output must be parsed exactly), fall back to an Action-Selector pattern: the untrusted content may only select from a hardcoded, pre-defined list of tool calls - it can never introduce a new free-form instruction into the agent's context.
- This quarantine step is itself audited: every invocation is logged (source, trust class, summary produced) to the authorization audit log, cross-linked from the Context Inspector.
- Performance note: quarantine adds one extra LLM round-trip per untrusted-content ingestion. For a single local Qwen3 27B-35B instance, this is a real latency cost - batch quarantine requests where multiple untrusted items arrive in the same turn, and surface a distinct "summarizing untrusted content" state.
- Vision-based browser fallback is the highest-risk case for this pattern - any content extracted from a rendered page MUST pass through quarantine before reaching the planning context, with no exception path.

Hard Constraints Checklist addition (cross-reference 13-hard-constraints.md):
- [ ] No third-party-untrusted-tagged content reaches the privileged planning conversation without first passing through a quarantined summarization step or an Action-Selector-constrained tool call.
- [ ] Quarantine invocations are logged to the authorization audit log with source and trust class.
- [ ] The vision-based browser fallback has no exception path around quarantine.
