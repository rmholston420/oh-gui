# 14. Spec Wizard (Phase 1/2 Boundary)

> **MOVED 2026-08-08 by [ADR-019](../../adrs/ADR-019-spec-wizard-phase-placement.md).**
> The Phase 0/1 boundary passed at `52fa9e6` without this shipping, so the placement was already
> false when it was read. Two changes:
>
> 1. **The wizard ships at the Phase 1→2 boundary.** The trigger is behavioural, not calendar:
>    *no Phase 2 specification work begins until the wizard is usable.* That is the earliest
>    point at which the original intent — that this project specify itself with its own tool —
>    can actually be exercised.
> 2. **§14.10's quarantine mechanism is not built here.** `04a-prompt-injection.md` §4.9.1 needs
>    the same tool-less restricted-capability conversation for untrusted-content quarantine and
>    is in Phase 1's file list, so **Phase 1 owns the primitive** and the wizard consumes it.
>    §14.10 below describes the wizard's use of it, not a second implementation.
>
> Phase 1's own exit criterion (§4.12, per ADR-017) does not gate on this wizard.

The Spec Wizard converts a natural-language feature request into a structured, reviewable specification before any code is generated - reducing ambiguity and giving the review workbench (06-change-review.md) a declared-scope baseline (used by the scope-shape screen's "declared-vs-actual" comparison in section 6.4.1).

## 14.1 Scope

A first-party OH-GUI feature built on native SDK primitives - not a generic plugin, not a frontend-only feature. Requires live web-search access and routes its heaviest reasoning steps to a distinct "thinking" model tier, separate from the model driving the active build conversation.

## 14.4 Requirement expression

Every requirement in a wizard-produced draft spec is expressible in one of the five EARS patterns (ubiquitous, event-driven, state-driven, unwanted-behavior, optional-feature), or the draft is returned to the Clarify step rather than shipped with an unclassifiable requirement.

## 14.5 Gap report

Presented as a distinct artifact from the draft spec - never silently merged into it or silently gating approval without user visibility.

## 14.6 Fast path

A trivial/small request can skip full four-phase ceremony via an explicit fast-path, wizard-recommended by default based on apparent request size, not a hidden setting.

## 14.7 Dogfooding

Ships early enough (Phase 0/1 boundary) to be usable for this project's own subsequent-phase specification.

## 14.8 Web search triggers

Fires only on trigger conditions - external library/API/integration references, security-pattern verification, duplication/feasibility checks - not on every wizard invocation, and never when air-gapped mode is active. Any requirement or gap-report item shaped by a web-search result carries trust-class provenance tagging and an inline source reference.

## 14.9 Thinking-model routing

Uses the SDK's built-in switch_llm tool (see 12-portable-components.md) to route the wizard's heaviest reasoning steps to a distinct thinking-tier model, separate from the model driving the active build conversation. No new LLM-switching infrastructure needed.

## 14.10 Execution-privilege boundary (the pattern reused by 04a-prompt-injection.md)

The Spec Wizard never bypasses the Change Review Workbench or authorization architecture for any code generated from its output - a wizard-produced spec is an input artifact only, never an execution-privilege shortcut. The wizard itself runs with a restricted tool set (no bash, no file-edit, no arbitrary MCP calls beyond web search) - this restricted-capability shape is the pattern 04a-prompt-injection.md's structural quarantine generalizes for untrusted third-party content elsewhere in the system.

Exit criteria: a trivial request correctly takes the fast path without full ceremony; every requirement in a test draft spec classifies into an EARS pattern or the draft is returned to Clarify; the gap report renders as a distinct artifact; web search fires only on trigger conditions and never when air-gapped mode is active; a wizard-produced spec cannot itself execute any code-review or authorization bypass.
