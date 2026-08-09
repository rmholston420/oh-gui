# 06. Change Review Workbench (Phase 1/2)

## 6.1 Existing precursors - audit first

Agent Canvas's src/routes/changes-tab.tsx, commits-tab.tsx (per-commit diffs, v1.5.0), and task-list-tab.tsx are **donor sources** under [ADR-001](../../adrs/ADR-001-integration-boundary.md) - audit them, vendor what is useful with attribution, log each port in `PORTING_LEDGER.md`, then build on the vendored copy. Do not edit them upstream.

## 6.2 Target failure mode: rubber-stamping, not invisibility

Reviewers either rubber-stamp AI-generated diffs or over-scrutinize every line. A prominent Accept All button engineers the rubber stamp; design against this explicitly. Automation-bias research supports this: erroneous automated recommendations are followed at meaningfully higher rates when presented authoritatively.

## 6.3 Diff rendering - benchmark before committing

Benchmark two paths: (1) extend Monaco Diff Editor, (2) port react-virtualized-diff (see 12-portable-components.md). Choose based on measured performance. Pin cold vs warm cache, worker vs main-thread computation, fixed reference hardware.

Fourth benchmark metric: peak memory under a 50,000-line diff - memory contention, not frame drops, is the failure mode most likely to bite a local-LLM user.

## 6.4 Risk-ranked review, not alphabetical

Default sort: auth/secrets/migrations/CI config/dependency manifests first; generated files, lockfiles, test fixtures collapsed by default with a visible count.

## 6.4.1 Scope-shape review (v4.0: promoted to Phase 1)

Before opening any file/hunk, present a scope-shape screen showing:
- Declared-vs-actual file scope, with delta flagged.
- "While I'm here" detector: files modified with no corresponding plan task.
- Test-claim summary: one-line extracted claim per test file.

Converts review from "read N lines" to "verify five architectural claims." v4.0: promoted to Phase 1 since it is a safety control, not a review convenience.

## 6.4.2 Vibe-coding-specific security checklist

Sub-panel checking: service-role keys in client bundles/public env vars, permissive row-level-security policies, storage buckets flipped public, webhooks without signature verification, hardcoded fallback secrets, unresolvable/hallucinated dependencies, missing CSRF protection on new state-changing endpoints. Each fires before generic pattern-analyzer scoring.

## 6.5 Budgeted review sessions

When a turn exceeds a review-line threshold, split into review batches with a visible progress meter. Accept All above threshold requires explicit override. Threshold user-configurable (default 400 lines). Persistent "lines accepted without inspection" counter.

## 6.6 Review hierarchy and acceptance semantics

Five levels: entire run, task, checkpoint, file, hunk. Every turn begins from a known checkpoint; edits occur in a task-specific worktree; review produces an accepted patch set distinct from raw output; rejecting a hunk reconstructs from base plus remaining accepted hunks; tests run against raw AND accepted candidate. Accept is not merge. Merge is not push.

## 6.7 Verification strip and author-class provenance

Persistent strip: last test run, pass/fail delta, coverage on changed lines. Every hunk tagged human/agent-assisted/agent-authored, persisted to commit trailers using a dedicated namespace (X-Agent-Authored, X-Agent-Model, X-Agent-Review-Status) - do not overload Co-authored-by.

## 6.8 Non-text and structural changes

Account for: new/deleted/renamed files, binary assets, lockfiles, migrations, generated code, permission-bit changes, symlinks, submodules, large files, secrets, infra/env files.

## 6.9 Engineering constraint - virtualization is mandatory

Hard gates: 10,000-line diff first paint under 200ms; scroll sustains 60fps; hunk-nav under 50ms; peak memory under a 50,000-line diff stays within a documented ceiling.

## 6.10 "Why did you change this?" - generalized

Any event supports an inline explain affordance backed by conversation.ask_agent(question).

## 6.11 Semantic-diff comprehension benchmark (fifth gate)

Given a synthetic diff with a moved function, renamed symbol, and extracted-to-new-file change, a reviewer must correctly identify each in under 5 seconds per change.

Phase 1 addition (v4.0): sections 6.4.1 and 6.4.2 ship in Phase 1.

> **AMENDED 2026-08-08 20:52 EDT by [ADR-017](../../adrs/ADR-017-phase-1-exit-criteria-resolution.md).**
> The seven-pattern synthetic-fixture assertion below is a **Phase 1** gate, not only a Phase 2 one.
> §6.4.2 ships in Phase 1, so its fixture ships with it; shipping the checklist a phase ahead of
> anything that proves its patterns fire is the inert-control failure of ADR-006 and Principle 8.
> The clause stays in the Phase 2 list as a regression gate.

Phase 2 exit criteria: a 10,000-line synthetic diff meets all four gates; semantic-diff comprehension gate passes for all three change types; Accept All above threshold requires explicit override; security checklist correctly flags each of the seven patterns in a synthetic fixture.
