# Kosmos Session Handoff — 2026-08-09 05:33 EDT

## Current build-sequencing position
- **Stage / phase:** Phase 1 · GUI shell + authorization surface
- **Plugin / kernel component:** `apps/gui` shell, authorization, audit-log
- **Port(s) in progress:** none open; `agentServer` client is the only I/O surface

## Completed this session
- `d9570da` — registered `qwen3.5:0.8b-q8_0` as exploratory bench cell K
- `5db6ffb` — spec 15 requirement IDs, coverage register 370 → 393 reqs / 17 specs
- `9a24da0` — ADR-031 **revision 2**: breakpoint is **1700px**, sides `17vw`/`23vw`
- `d0c32c6` — browser coverage at real windowed widths on 3440x1440
- `9bbfee8` — untrusted-content badge (wired) + audit-log module (**unwired**), tsconfig fix

State: 204 unit tests / 29 files, 49 browser tests, build clean, hard constraints `=== PASSED ===`.

## Three defects found this session that outlive it
1. **ADR-031 was wrong twice.** Both wrong answers came from arithmetic; only a DOM probe found
   the truth. The unit test agreed with the error because it shared the ADR's model. **A test
   derived from the same assumption as the implementation cannot falsify that assumption.**
2. **`git add -u` while subagents run** swept an unrelated edit into `9a24da0`, leaving it
   unbuildable in isolation. Stage explicit paths only.
3. **`?raw` CSS imports return `''` under the test runner**, so assertions pass vacuously. A build
   error is better than a silent green.

## Remaining before "OH-GUI can help write its own code"
1. **Workspace targeting.** `working_dir` is hardcoded to `/workspace/project`
   (`apps/gui/src/api/types.ts:219`). The agent can only edit what the container mounts there.
   Fix at the container level first (below); make it selectable in the GUI second.
2. **Follow-up message composer.** `agentServer.sendMessage` exists but **no UI calls it**. A run
   can be started, approved and stopped, but not steered mid-flight. This is the single largest
   gap for iterative self-coding. Needs: a composer in `RunView`, a `send` action in
   `useConversation`, unit + live-Playwright coverage.
3. **Mount the audit-log panel** into the shell (module and tests are done and unmounted).

## Open questions / awaiting user answer
- **Benchmark confirmatory set is three-quarters Qwen** (A/C/D); only B (Devstral) is
  architecturally independent. Proposal: promote `glm-4.7-flash` to confirmatory if it screens
  well. **Undecided.**
- **Ultrawide layout** (KNOWN_ISSUES): larger side caps, a stage max-width with a fourth region,
  or a splittable stage. Option 3 is likely the real 21:9 win and interacts with ADR-030.
- **900px approval floor** disables all authorization in a quarter-tile window (860px). Keying it
  on pointer type instead of width alone would need an ADR amending ADR-003.

## Exact next action
Run the benchmark (it is ready and unrun):
`cd ~/dev/oh-gui && git pull --ff-only && ./bench/toolcall/run_overnight.sh`
Then build the follow-up composer (item 2 above).
