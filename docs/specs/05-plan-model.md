# 05. Plan/Task Model - Durable Object, Not a Raw Event Projection (Phase 3)

## 5.1 Why binding directly to the event stream is wrong

The event log is a flat, append-only trace; a plan is a hierarchy of intent. Multiple ActionEvents can share one llm_response_id, and third-party ACP agents don't necessarily expose OpenHands' own plan schema.

## 5.2 Existing precursor - extend, don't rebuild

src/routes/planner-tab.tsx already exists. Evolve it into a plan workbench. Net-new schema required:

Goal: id, title, success_criteria list, status, created_from_event_id
Task: id, parent_id, title, description, status, dependencies list, assigned_agent, worktree_id, scope_paths list, risk_level, acceptance_criteria list, evidence list, revision
Attempt: id, task_id, start_event_id, end_event_id, model, tool_calls list, changed_files list, test_runs list, outcome

- Statuses: proposed, approved, queued, running, waiting-for-user, blocked, validating, completed, failed, superseded, canceled.
- Construction is hybrid: consume agent-emitted plan events when available; fall back to heuristic folding for ACP agents without a plan schema.
- Every evidence item inherits the trust class from 04a-prompt-injection.md. A plan built partly from third-party-untrusted evidence must surface that in the plan tree.

## 5.2.1 Plan-level provenance gate

- If a Plan's aggregate evidence chain exceeds a configurable threshold (default 50 percent) tagged third-party-untrusted, task approval is blocked behind an explicit interstitial confirming the evidence chain has been reviewed.
- Logged to 04-authorization.md section 4.2.1 with the computed percentage at approval time.
- Threshold is project-configurable; current live percentage visible in the plan-tree header.

## 5.3 Drift detection - the differentiating feature

Explicitly render divergence wherever the trace disagrees with the declared plan step.

## 5.4 Collaborative planning affordances

Approve the whole plan, edit task wording, reorder independent tasks, mark do-not-touch, add acceptance criteria, assign to another agent/model, retry from checkpoint, fork an alternative attempt, redirect only the active task, lock files to a task, promote a discovered issue into a new task.

## 5.5 Rewind and fork-from-step

- Truncate event log at event n, restore worktree commit, allow prompt edit, re-run.
- Expose "fork from here" as a plan-tree gesture on any completed step.
- Audit the shipped branch-a-conversation feature (v1.2.0) first - do not duplicate.
- UX reference: microsoft/agdebugger's interactive message viewer and conversation-graph visualization (read source, see 12-portable-components.md).
- Document non-rewindable side effects: files written outside worktree, network calls made, database writes, migrations applied.
- Plan-versioning rule: rewinding forks the Plan object at the Task/Attempt boundary rather than mutating in place; pre-rewind revision remains inspectable, linked as superseded-by-rewind.
- Non-determinism disclosure (v4.0, now conditional): if the active model profile's backend has deterministic-replay enabled (vLLM batch-invariant mode), the disclosure changes to "replay exactly." Otherwise retain "replay approximately." See 08-telemetry.md section 8.4 for the deterministic_replay field.

## 5.5.1 Fork taxonomy - one primitive, three UI entry points

- One underlying primitive - the v1.2.0 conversation-branch feature is the foundation.
- Conversation view on fork: always opens a new conversation with a "forked from X, step N" banner.
- Plan revisions form a DAG, not a tree - render with explicit merged-from links at diamond points; consider lifting agdebugger's graph component directly.
- Merge-back position: explicit non-support for automatic merge-back; done manually via Compare mode's three-way merge viewer.
- The DAG-capable data model ships as specified but UI renders as a simple linear list in the common single-fork case.

## 5.6 Three layers of activity - never conflate

1. Plan layer - what should happen.
2. Narrative layer - human-readable account of what is happening and why.
3. Event layer - raw actions/observations/timestamps, on demand.

## 5.7 Session Profile Card

Accumulates per conversation: observed style signals, recurring failure patterns with a one-click "add as constraint," a free-text scratchpad. (v4.0) In household deployments, per created_by user - see 15-household-profiles.md section 15.3.

Phase 3 exit criteria: a redirected task correctly forks a new worktree; drift is visibly flagged; a rewind produces a linked new Plan revision; fork-from-step and rewind both produce correctly-linked new conversations; the DAG renders correctly for the diamond case; an over-threshold plan cannot have a task approved without the interstitial; the disclosure text correctly reflects the deterministic_replay flag.
