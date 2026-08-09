# 03. Layout - Vibe/Pro Semantic-Zoom Workbench (Phase 0/4)

Two modes only. Progressive-disclosure UX research caps effective complexity jumps at two levels.

## 3.0 The two lenses

Vibe Mode (default landing state):
- Single-column, centered, generous-whitespace layout. <!-- [REQ-03-001] -->
- Plans, diffs, and authorization cards expand inline as interactive cards with spring-physics entrance. <!-- [REQ-03-002] -->
- No terminal pane, plan tree, or telemetry strip visible by default - one "expand" affordance per card. <!-- [REQ-03-003] -->
- Touch/swipe support on tablet viewports for hunk-level review. Authorization cards above LOW risk exempt from swipe-approve. <!-- [REQ-03-004] -->
- (v4.0) Permanent home surface, not a ramp - must pass same exit criteria as Pro Mode. <!-- [REQ-03-005] -->

Pro Mode (opt-in, persists per project):
- Global command bar: project/repo selector, branch/worktree indicator, active agent+model, execution mode, run state, context-use %, telemetry summary, trust dial, command palette, global pause/stop, lens toggle. <!-- [REQ-03-006] -->
- Left rail (280-360px, collapsible): projects, conversations, worktrees, automations, "needs you" inbox, settings, plan tree. <!-- [REQ-03-007] -->
- Center stage (fluid, >=60% width): Build / Review / Debug / Compare. <!-- [REQ-03-008] -->
- Right conversation column (380-440px, always present): structured intent capture, streamed reasoning, authorization cards. <!-- [REQ-03-009] -->
- Full keyboard model, Vim-modal tier, telemetry strip, plan tree, terminal - persistently visible per breakpoint table. <!-- [REQ-03-010] -->

The lens switch: a single binary toggle in the global command bar - CSS/layout transition, no route change, no data refetch. <!-- [REQ-03-011] -->

## 3.0.1 What happens to "Standard"

The unmodified Agent Canvas is not a third mode. Retained only as: a pinned reference checkout for diffing; the regression baseline for Phase 0 metrics. Never exposed as a runtime toggle or settings option. <!-- [REQ-03-012] -->

> **Located 2026-08-08 (ADR-001 Amendment #2).** Pristine read-only checkout at
> `~/dev/oh-gui-ref/agent-canvas/v1.12.0/` — outside the repo, because git does not track write
> permissions and an in-repo copy could not be held read-only. Baseline metrics run against a
> disposable copy at `~/.oh-gui/reference/agent-canvas-run/`. Both provisioned by
> `scripts/provision-reference-checkout.sh`. Donor is `OpenHands/OpenHands` @ `v1.12.0`, **not** the
> archived `OpenHands/agent-canvas` stub, which has no LICENSE.

## 3.2 Responsiveness

- One-keystroke maximize for any surface, with restore. <!-- [REQ-03-013] -->
- Breakpoints: >=1600px (up to 4 regions), 1200-1599px (2 panes + collapsible sides), 900-1199px (1 pane + drawer), <900px (monitoring/approvals/conversation only). <!-- [REQ-03-014] -->
- Mobile/tablet approval policy: below 900px, authorization cards are read-only - Approve/Reject/Relax require >=900px viewport. <!-- [REQ-03-015] -->
- Save per-mode layouts. (v4.3, ADR-003: the delegated-review exception and the <!-- [REQ-03-016] -->
  novice-default-lens rule are removed. Below 900px the surface stays read-only; approve,
  reject, and relax require a >=900px viewport, with no exception path.)

## 3.3 Implementation notes

- Terminal pane and command palette: port Qovery/react-xtermjs and cmdk/react-cmdk as commodity UI. <!-- [REQ-03-017] -->
- Frontend motion/visual stack (v4.0 correction): use motion (import from motion/react) - framer-motion was renamed in 2025 and is no longer actively developed. Aceternity UI and Magic UI are copy-paste libraries, not npm packages - vendor their source into components/ui/, subject to the same CI contrast gates as project code. <!-- [REQ-03-018] -->
- Screen-reader model: suppresses per-token announcements in favor of debounced status; authorization cards get distinct ARIA live-region priority; accessibility-help overlay for terminal/diff navigation. Extended to plan tree (flat list, parent refs) and diff/review workbench (semantic change descriptions). <!-- [REQ-03-019] -->

## 3.4 First-run experience

1. Connect a model/agent - detected local backends pre-populate from the model-profile scan. <!-- [REQ-03-020] -->
2. ~~(v4.0) Household fork at step 1.~~ **REMOVED v4.3 by ADR-003** - the wizard has a
   single path.
3. Walk trust-dial stops with one live, harmless example action shown at each stop. <!-- [REQ-03-021] -->
4. State and justify default stop explicitly: ConfirmRisky(). NeverConfirm() is opt-in-only and the wizard must say why. <!-- [REQ-03-022] -->
5. Seed "lines accepted without inspection" counter at zero with a one-line explanation. <!-- [REQ-03-023] -->
6. Show a sample plan tree (clearly labeled "example"). <!-- [REQ-03-024] -->
7. ~~(v4.1) Delegated-approval walkthrough.~~ **REMOVED v4.3 by ADR-003.**

Phase 0 exit criterion addition: first-run wizard ships ~~with Phase 0 baseline-metrics report
and~~ states the default trust-dial stop explicitly in its own UI copy.

> **AMENDED 2026-08-08 20:05 EDT by ADR-016.** The baseline-metrics report is no longer a Phase 0
> exit criterion, so the wizard no longer ships paired with it. The surviving half of this sentence
> — the wizard stating its default trust-dial stop explicitly in its own UI copy — is unchanged and
> is delivered by step 3 of `apps/gui/src/features/first-run/FirstRunWizard.tsx`.

> **DELIVERY NOTE 2026-08-08 20:05 EDT.** Items 4, 5 and 6 above ship functional. Items 1 and 3 ship
> as labelled inert placeholders, and this is architectural rather than incidental: ADR-001 item 4
> confines the frontend to talking to the OH-GUI middleware, which does not exist until Phase 1.
> Item 1 (backend detection via the model-profile scan) therefore cannot reach Ollama from the
> browser, and item 3's "one **live**, harmless example action" cannot execute an action. What
> Phase 0 does deliver for item 3 is the *decision* for each stop, computed by the same predicate
> the review UI will call rather than written as copy. Both remain owed in Phase 1 and are tracked
> in KNOWN_ISSUES.md.

## 3.5 Kinetic feedback layer

- Thinking/generating state: organic, low-amplitude pulsing gradient, honoring prefers-reduced-motion. <!-- [REQ-03-025] -->
- Diff materialization: brief spring-physics entrance in Vibe Mode; disabled under reduced-motion; never affects Pro Mode's virtualized diff rendering gates. <!-- [REQ-03-026] -->
- Authorization card emphasis: z-axis emphasis with background dimming when WAITING_FOR_CONFIRMATION - elevation/shadow/backdrop, not a true modal, must not block emergency stop or trust-dial controls. <!-- [REQ-03-027] -->
- Cosmetic layer, out of scope for Hard Constraints Checklist gates. <!-- [REQ-03-028] -->

## 3.5.1 Vibe-mode proof requirements

To make Principle 11 testable instead of aspirational, every phase that introduces a new intervention surface must define the Vibe-mode success condition explicitly. <!-- [REQ-03-029] -->

- Phase 1 authorization slice: the operator in Vibe Mode can read an authorization card, <!-- [REQ-03-030] -->
  act on it, and return to the conversation without losing context. (v4.3, ADR-003:
  comprehension testing, delegated review, and assist attribution removed.)
- Phase 2 review slice: the scope-shape screen, security checklist, and review batching remain legible and actionable in Vibe Mode without requiring the Pro layout. <!-- [REQ-03-031] -->
- Phase 3 planning slice: plan drift, fork-from-step, and provenance interstitials render in Vibe Mode as simplified cards over the same underlying data model. <!-- [REQ-03-032] -->
- Phase 5 mission-control slice: return-to-context and "needs you" inbox flows work in Vibe Mode without forcing a lens switch. <!-- [REQ-03-033] -->

## 3.6 Compare mode - demoted, design frozen

- Reverts to Phase 6, opt-in, low-priority. <!-- [REQ-03-034] -->
- Design unchanged: shared context baseline; diff-of-diffs; cost/latency leaderboard; three-way merge (hunk-level merge only, not recursive conflict markers); isolation boundary display. <!-- [REQ-03-035] -->
- Phase 2 diff-virtualization benchmark still built with future reuse in mind, but no Compare UI ships before Phase 6. <!-- [REQ-03-036] -->
- Speculative execution similarly demoted: trust-dial-adjacent control, audit-log wiring, budget pre-check ship in Phase 1; actual spawn mechanism ships in Phase 6. <!-- [REQ-03-037] -->

Phase 6 exit criterion (when built): Compare mode's diff-of-diffs and merge viewer pass the same virtualization gates; N>2 parallel worktrees render correctly. <!-- [REQ-03-038] -->
