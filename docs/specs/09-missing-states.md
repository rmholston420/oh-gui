# 09. Missing States (Phase 5)

- WebSocket disconnect / sandbox death mid-run: plan tree freezes at last known event with a reconnecting affordance; diff canvas remains usable; conversation rail queues input rather than discarding. <!-- [REQ-09-001] -->
- Empty states for every zone. <!-- [REQ-09-002] -->
- Agent stuck/failing repeatedly: loop-detection surfacing, an escalation path when confidence is low. <!-- [REQ-09-003] -->
- Cost/budget anxiety: soft and hard limits per 08-telemetry.md section 8.5. <!-- [REQ-09-004] -->
- Three-class error model (never merge into one toast type): AgentErrorEvent (non-terminal, treat inline); ConversationErrorEvent (terminal, hard-stop); partial streaming failure (render with visible "incomplete" marker, never auto-retry an above-LOW action without confirmation). <!-- [REQ-09-005] -->
- 08-telemetry.md section 8.6's local-failure-signature vocabulary is additive to, not a replacement for, this three-class model. <!-- [REQ-09-006] -->
- Notification model: desktop notification fires on run completion, run error, WAITING_FOR_CONFIRMATION, hard budget hit, STUCK detected. Every notification also writes to the inbox and persists until acknowledged. Per-event-type preferences in settings. Suppressed for the actively viewed conversation. <!-- [REQ-09-007] -->
- Return-to-context re-orientation view: on return, present a summary combining plan-tree state, last N authorization decisions, drift flagged, current STUCK/error state. <!-- [REQ-09-008] -->
