# 01. Governing UX Principles (Always Load)

1. [REQ-01-001] Precision in, precision out - scaffold structured intent capture; never ship a bare chat box as the only input surface.
2. [REQ-01-002] First output is a sketch, not a final answer - every surface must make review effortless.
3. [REQ-01-003] Iterate in bounded sections - default all agent requests to scoped, section-by-section changes.
4. [REQ-01-004] Expose decision boundaries; do not maximize autonomy.
5. [REQ-01-005] Proactivity has a disruption cost - pay it down with visible presence/context cues, not silent background action.
6. [REQ-01-006] The review budget is finite (~400 lines/session, configurable) - design batching and pacing explicitly.
7. [REQ-01-007] Friction is budgeted and spent deliberately; the low-risk path must feel instant. Input echo under 100ms, time-to-first-token under 1s, zero modal interruptions for LOW risk actions.
8. [REQ-01-008] Provenance is a first-class governing concern. Every context/action/authorization decision carries a trust class. Display is not enforcement - see 05-plan-model.md section 5.2.1 and 04a-prompt-injection.md.
9. [REQ-01-009] Two depth layers, one system, never two products. Vibe Mode (default) and Pro Mode as semantic-zoom lenses over one shared data model. Mode switch is a binary toggle, not a segmented control.
10. [REQ-01-010] Design for one capable local model, not a fleet. Every surface assuming multiple simultaneous models/worktrees must degrade gracefully to single-model default. Parallel capability is additive, opt-in, Phase 6.
11. [REQ-01-011] (v4.3, ADR-003) Design two lenses for one operator at different times, not for
    different people. Vibe Mode is for supervising a routine run; Pro Mode is for
    debugging a stuck one. Every Phase 1-5 exit criterion must still be demonstrable in
    both lenses - that requirement survives the removal of the household premise.
