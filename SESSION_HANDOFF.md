# Kosmos Session Handoff — 2026-08-09 07:44 EDT

## Current build-sequencing position
- **Stage / phase:** Phase 1 complete. GUI slices on `main`.
- **Plugin / kernel component:** GUI shell navigation (done), plugins panel Tiers 1-2 (done).
- **Port(s) in progress:** none.

## Completed this session
- Plugins reachable from navigation, filed **under Settings** (REQ-03-007 does not name plugins;
  promoting it to a peer of conversations would have needed an ADR).
- `RunView` is hidden, not unmounted, when switching surfaces — a live conversation must survive
  the operator glancing at a plugin list. Asserted live (`toBeHidden` + `toBeAttached`).
- Navigation follows the 1700px breakpoint: rail above, command bar below. The rail is
  `display: none` below 1700px, which removes it from the accessibility tree, so rail-only
  navigation had left Plugins unreachable in any unmaximised window.
- `useRailVisible.test.ts` reads `Shell.css` and pins the TS constant to the real `@media` value.
- `e2e/testids.spec.ts`: browserless guard rejecting any `getByTestId` string absent from `src/`,
  template ids expanded. Mutation-tested.
- Commits: `5b128f6`, `5cd9987`, `9dea0ae`, `60873c4` (+ this entry).

## Three defects I shipped this session, and what each cost
1. **Pushed red.** The guard was `grep`'s exit status, and `grep` succeeds when it matches the word
   FAILED. Rule now: **gates gate on their own exit code**; printing a verdict is not honouring it.
2. **Reachability read from markup, not CSS.** `display: none` is a reachability decision, not a
   styling one. Read the stylesheet of any container before mounting something into it.
3. **Fabricated a test id from memory** with the correct one four lines above in the same file.
   Cost two operator-run live cycles. Guarded now, but the habit is the fix: read the component.

## Remaining before the next Definition of Done
- Tier 3 (enable/disable) is **dead** for project plugins — `PATCH` only serves registry installs.
- Tier 4 (install/marketplace) **blocked pending an ADR** on authorization and blast radius.
- ADR-033 (Serena MCP) **Proposed**. Two open items: clause 4 gating, and the container-boundary
  problem — stdio servers spawn inside `ohg-verify`, so host-run Serena returns unopenable paths.
- SearXNG injection posture (REQ-12-014 / REQ-16-053) undecided.
- Carried debt unchanged: `trust-dial.ts` hand-mirror; `spec_coverage.py:295` 90-char truncation;
  ADR-030 object-set; wizard §3.4 reference (may itself be stale — verify before acting).

## Open questions awaiting your answer
- ADR-033 clause 4: amend to apply to semantic search only?
- Plugins in Vibe: currently Pro-only, since the nav rides the Pro command bar and rail.

## Exact next action
- Pick the next easy win, or take one of the two open questions above.
