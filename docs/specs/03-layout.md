# 03. Layout - Vibe/Pro Semantic-Zoom Workbench (Phase 0/4)

Two modes only. Progressive-disclosure UX research caps effective complexity jumps at two levels.

## 3.0 The two lenses

Vibe Mode (default landing state):
- Single-column, centered, generous-whitespace layout.
- Plans, diffs, and authorization cards expand inline as interactive cards with spring-physics entrance.
- No terminal pane, plan tree, or telemetry strip visible by default - one "expand" affordance per card.
- Touch/swipe support on tablet viewports for hunk-level review. Authorization cards above LOW risk exempt from swipe-approve.
- (v4.0) Permanent home surface, not a ramp - must pass same exit criteria as Pro Mode.

Pro Mode (opt-in, persists per project):
- Global command bar: project/repo selector, branch/worktree indicator, active agent+model, execution mode, run state, context-use %, telemetry summary, trust dial, command palette, global pause/stop, lens toggle.
- Left rail (280-360px, collapsible): projects, conversations, worktrees, automations, "needs you" inbox, settings, plan tree.
- Center stage (fluid, >=60% width): Build / Review / Debug / Compare.
- Right conversation column (380-440px, always present): structured intent capture, streamed reasoning, authorization cards.
- Full keyboard model, Vim-modal tier, telemetry strip, plan tree, terminal - persistently visible per breakpoint table.

The lens switch: a single binary toggle in the global command bar - CSS/layout transition, no route change, no data refetch.

## 3.0.1 What happens to "Standard"

The unmodified Agent Canvas is not a third mode. Retained only as: a pinned reference checkout for diffing; the regression baseline for Phase 0 metrics. Never exposed as a runtime toggle or settings option.

> **Located 2026-08-08 (ADR-001 Amendment #2).** Pristine read-only checkout at
> `~/dev/oh-gui-ref/agent-canvas/v1.12.0/` — outside the repo, because git does not track write
> permissions and an in-repo copy could not be held read-only. Baseline metrics run against a
> disposable copy at `~/.oh-gui/reference/agent-canvas-run/`. Both provisioned by
> `scripts/provision-reference-checkout.sh`. Donor is `OpenHands/OpenHands` @ `v1.12.0`, **not** the
> archived `OpenHands/agent-canvas` stub, which has no LICENSE.

## 3.2 Responsiveness

- One-keystroke maximize for any surface, with restore.
- Breakpoints: >=1600px (up to 4 regions), 1200-1599px (2 panes + collapsible sides), 900-1199px (1 pane + drawer), <900px (monitoring/approvals/conversation only).
- Mobile/tablet approval policy: below 900px, authorization cards are read-only - Approve/Reject/Relax require >=900px viewport.
- Save per-mode layouts. (v4.3, ADR-003: the delegated-review exception and the
  novice-default-lens rule are removed. Below 900px the surface stays read-only; approve,
  reject, and relax require a >=900px viewport, with no exception path.)

## 3.3 Implementation notes

- Terminal pane and command palette: port Qovery/react-xtermjs and cmdk/react-cmdk as commodity UI.
- Frontend motion/visual stack (v4.0 correction): use motion (import from motion/react) - framer-motion was renamed in 2025 and is no longer actively developed. Aceternity UI and Magic UI are copy-paste libraries, not npm packages - vendor their source into components/ui/, subject to the same CI contrast gates as project code.
- Screen-reader model: suppresses per-token announcements in favor of debounced status; authorization cards get distinct ARIA live-region priority; accessibility-help overlay for terminal/diff navigation. Extended to plan tree (flat list, parent refs) and diff/review workbench (semantic change descriptions).

## 3.4 First-run experience

1. Connect a model/agent - detected local backends pre-populate from the model-profile scan.
2. ~~(v4.0) Household fork at step 1.~~ **REMOVED v4.3 by ADR-003** - the wizard has a
   single path.
3. Walk trust-dial stops with one live, harmless example action shown at each stop.
4. State and justify default stop explicitly: ConfirmRisky(). NeverConfirm() is opt-in-only and the wizard must say why.
5. Seed "lines accepted without inspection" counter at zero with a one-line explanation.
6. Show a sample plan tree (clearly labeled "example").
7. ~~(v4.1) Delegated-approval walkthrough.~~ **REMOVED v4.3 by ADR-003.**

Phase 0 exit criterion addition: first-run wizard ships with Phase 0 baseline-metrics report and states the default trust-dial stop explicitly in its own UI copy.

## 3.5 Kinetic feedback layer

- Thinking/generating state: organic, low-amplitude pulsing gradient, honoring prefers-reduced-motion.
- Diff materialization: brief spring-physics entrance in Vibe Mode; disabled under reduced-motion; never affects Pro Mode's virtualized diff rendering gates.
- Authorization card emphasis: z-axis emphasis with background dimming when WAITING_FOR_CONFIRMATION - elevation/shadow/backdrop, not a true modal, must not block emergency stop or trust-dial controls.
- Cosmetic layer, out of scope for Hard Constraints Checklist gates.

## 3.5.1 Vibe-mode proof requirements

To make Principle 11 testable instead of aspirational, every phase that introduces a new intervention surface must define the Vibe-mode success condition explicitly.

- Phase 1 authorization slice: the operator in Vibe Mode can read an authorization card,
  act on it, and return to the conversation without losing context. (v4.3, ADR-003:
  comprehension testing, delegated review, and assist attribution removed.)
- Phase 2 review slice: the scope-shape screen, security checklist, and review batching remain legible and actionable in Vibe Mode without requiring the Pro layout.
- Phase 3 planning slice: plan drift, fork-from-step, and provenance interstitials render in Vibe Mode as simplified cards over the same underlying data model.
- Phase 5 mission-control slice: return-to-context and "needs you" inbox flows work in Vibe Mode without forcing a lens switch.

## 3.6 Compare mode - demoted, design frozen

- Reverts to Phase 6, opt-in, low-priority.
- Design unchanged: shared context baseline; diff-of-diffs; cost/latency leaderboard; three-way merge (hunk-level merge only, not recursive conflict markers); isolation boundary display.
- Phase 2 diff-virtualization benchmark still built with future reuse in mind, but no Compare UI ships before Phase 6.
- Speculative execution similarly demoted: trust-dial-adjacent control, audit-log wiring, budget pre-check ship in Phase 1; actual spawn mechanism ships in Phase 6.

Phase 6 exit criterion (when built): Compare mode's diff-of-diffs and merge viewer pass the same virtualization gates; N>2 parallel worktrees render correctly.