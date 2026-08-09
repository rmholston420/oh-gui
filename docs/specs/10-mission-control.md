# 10. Mission Control and Context (Phase 5)

- Mission control dashboard: homescreen listing all conversations with pause/resume/cancel, plus the "needs you" inbox. <!-- [REQ-10-001] -->
- Context Inspector: exposes exactly what composes the next model call - prompt, system instructions, repo instructions, active skills, selected files, retrieved code, MCP outputs, conversation history, condensed summaries, persistent project memory - each tagged with source, creation time, selection rationale, token cost, egress status, trust class, cross-linked to the audit log. <!-- [REQ-10-002] -->
- Condensation UX: two-pane view - left is forgotten events as a collapsed transcript, right is the proposed summary with inline annotations. <!-- [REQ-10-003] -->
- Markdown-first export: default agent-authored docs to rendered Markdown with one-click PDF/DOCX export, plus a "use as context in new conversation" action. <!-- [REQ-10-004] -->
- Project Skill panel: wired into existing skills/MCP configuration, first-class diffable panel. <!-- [REQ-10-005] -->
- Air-gapped mode: disables all network-dependent features, persistent badge, tested in CI under network-namespace isolation. Given the stated deployment profile, this mode will likely be active in most sessions - internal priority elevated relative to other Phase 5 items. <!-- [REQ-10-006] -->
