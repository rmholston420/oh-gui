# OH-GUI Session Handoff

**This file reflects current state only. Overwrite it each session end.**
Last updated: 2026-08-08 02:26 EDT

## Current stage

Pre-Phase-0. Repository bootstrap complete. **No build work has started.**

## Completed this session

- Read all 21 attached spec files in full (20 v4.0/v4.1 split files + the v3.0 monolith).
- Created public repo `rmholston420/oh-gui`, default branch `main`.
- Pushed the 20 authoritative v4 files to `docs/specs/`.
- Isolated the superseded v3.0 monolith to `docs/specs/archive/` with a README
  enumerating the rejected ideas it still contains unmarked.
- Seeded `BUILD_LOG.md` (with the bootstrap entry), `DEBUG_LOG.md`, `PORTING_LEDGER.md`.

## Decisions made (user-confirmed this session)

1. **Repo role: overlay repo, not a fork.** `OpenHands/OpenHands` at tag `v1.12.0`
   is cloned separately and extended in place per `docs/specs/00-ground-truth.md`.
   `oh-gui` holds specs, ADRs, operational logs, and OH-GUI-owned source, tracking
   the delta against upstream. **This is a load-bearing architectural decision and
   still needs a formal ADR (candidate ADR-0001) - it has not been filed.**
2. v3.0 monolith archived rather than deleted or shelved flat.
3. Initial commit scope: specs + three operational logs only. No LICENSE, no root
   README (user explicitly declined both).
4. Local clone path on Colossus: `~/dev/oh-gui`.

## Remaining before the Phase 0 Definition of Done

Per `docs/specs/02-repo-setup.md` and `docs/specs/11-dev-plan.md`, Phase 0 exit
requires all four of:

- [ ] Architecture decision record filed.
- [ ] Baseline metrics report against a dense Qwen3 27B-35B model (5-10 tasks:
      time-to-first-review, turns-to-acceptance, lines-accepted-without-inspection,
      "lost track" incidents, GPU temp/power, mental-model-formation baseline).
- [ ] First-run wizard shipped, stating the default trust-dial stop (`ConfirmRisky()`)
      explicitly in its own UI copy.
- [ ] Household-mode timing decision recorded (Phase 1 vs Phase 3, per
      `docs/specs/15-household-profiles.md` section 15.1).

Also required at Phase 0: capture the stock-Agent-Canvas regression baseline as a
permanent pinned reference checkout.

## Open questions awaiting the user

1. **ADR-0001 not yet filed.** The overlay-repo decision was confirmed
   conversationally but has no ADR. Should an `adrs/` directory be established in
   this repo, and does it follow the Kosmos ADR template or a new OH-GUI one?
2. **No LICENSE file.** Upstream OpenHands is MIT. A public repo with no license
   defaults to all-rights-reserved. Confirm whether MIT should be added.
3. **Upstream tag re-verification.** `00-ground-truth.md` pins `v1.12.0` /
   `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364` and requires re-verifying before each
   phase gate. Not yet re-verified against the live upstream repo.
4. **Household-mode timing** (Phase 1 vs Phase 3) is a Phase 0 kickoff decision the
   user has not yet made.

## Exact next action

Clone the repo to `~/dev/oh-gui` on Colossus, then answer open questions 1, 2, and
4 above. Do not begin Phase 0 work until the household-mode timing decision is
recorded and ADR-0001 is filed.
