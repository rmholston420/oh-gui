# 10. Mission Control and Context (Phase 5)

- Mission control dashboard: homescreen listing all conversations with pause/resume/cancel, plus the "needs you" inbox. (v4.0) Per household user by default; a household-wide view is an explicit opt-in filter.
- Context Inspector: exposes exactly what composes the next model call - prompt, system instructions, repo instructions, active skills, selected files, retrieved code, MCP outputs, conversation history, condensed summaries, persistent project memory - each tagged with source, creation time, selection rationale, token cost, egress status, trust class, cross-linked to the audit log.
- Condensation UX: two-pane view - left is forgotten events as a collapsed transcript, right is the proposed summary with inline annotations.
- Markdown-first export: default agent-authored docs to rendered Markdown with one-click PDF/DOCX export, plus a "use as context in new conversation" action.
- Project Skill panel: wired into existing skills/MCP configuration, first-class diffable panel.
- Air-gapped mode: disables all network-dependent features, persistent badge, tested in CI under network-namespace isolation. Given the stated deployment profile, this mode will likely be active in most sessions - internal priority elevated relative to other Phase 5 items.
