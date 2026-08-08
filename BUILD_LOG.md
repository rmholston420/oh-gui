# OH-GUI Build Log

Append-only. Newest entries at the bottom. Never overwrite a prior entry.

Entry format:

```
## YYYY-MM-DD HH:MM EDT - <short title>
- Stage/phase:
- Component/port:
- What changed:
- Files touched:
- Ports/adapters affected:
- ADR / ledger updated:
- Stop-condition status:
```

---

## 2026-08-08 02:24 EDT - Repository bootstrap

- Stage/phase: Pre-Phase-0 (repository creation)
- Component/port: none - no code written
- What changed: Created public repo `rmholston420/oh-gui`. Imported the OH-GUI
  Master Build Spec v4.0/v4.1 split-file set (20 files) to `docs/specs/`.
  Isolated the superseded v3.0 monolith to `docs/specs/archive/` with a README
  enumerating the rejected ideas it still contains, per
  `docs/specs/99-appendix-superseded.md`.
- Files touched: `docs/specs/*.md` (20 spec files),
  `docs/specs/archive/OH-GUI-Master-Build-Spec-v3.md`,
  `docs/specs/archive/README.md`, `BUILD_LOG.md`, `DEBUG_LOG.md`,
  `PORTING_LEDGER.md`
- Ports/adapters affected: none
- ADR / ledger updated: `PORTING_LEDGER.md` created (empty, headers only).
  No ADR filed yet - the repo-role decision below is a candidate ADR-0001.
- Decision recorded (pending formal ADR): `rmholston420/oh-gui` is an **overlay
  repo**, not a fork. `OpenHands/OpenHands` at tag `v1.12.0` is cloned separately
  and extended in place per `docs/specs/00-ground-truth.md`; this repo holds
  specs, ADRs, operational logs, and OH-GUI-owned source, tracking the delta
  against upstream. This preserves the EXTEND-not-fork constraint and keeps
  upstream rebasable.
- Stop-condition status: Repo created and specs pushed. **Stopped here.**
  Phase 0 not started. No baseline metrics, no architecture decision record, no
  first-run wizard, no household-mode timing decision. Phase 0 exit criterion
  (`docs/specs/02-repo-setup.md`) is not met and was not attempted.

## 2026-08-08 02:42 EDT - ADR-001 ratified: integration boundary reversed to standalone app

- Stage/phase: Pre-Phase-0 (architecture decision)
- Component/port: integration boundary; no code written
- What changed: User clarified the actual requirement - never modify OpenHands source,
  keep upgrading it freely, build a custom GUI plus middleware that changes regularly.
  This is incompatible with the spec's "EXTEND, not fork / extend in place" premise.
  Investigated the live upstream surface and found a supported consumption boundary the
  spec never mentioned: the Agent Server (Docker, HTTP + WebSocket, SESSION_API_KEY),
  `@openhands/typescript-client` (browser-compatible, remote conversations only), and the
  `openhands-sdk` pip family. Ratified ADR-001: OH-GUI is a standalone app, OpenHands is a
  pinned runtime dependency, middleware is Python and owns the entire policy plane, and
  Agent Canvas is reclassified from base to donor.
- Files touched: `adrs/ADR-001-integration-boundary.md` (new), `adrs/README.md` (new),
  `docs/specs/README.md`, `docs/specs/00-ground-truth.md`, `docs/specs/02-repo-setup.md`,
  `docs/specs/12-portable-components.md`, `docs/specs/13-hard-constraints.md`,
  `docs/specs/99-appendix-superseded.md`, `PORTING_LEDGER.md`
- Ports/adapters affected: Agent Canvas added as primary donor. Runtime dependencies
  recorded as pinned artifacts, explicitly not ports. A middleware anti-corruption layer
  is now a required component (ADR-001 item 7).
- ADR / ledger updated: ADR-001 filed and ratified; ADR index created; PORTING_LEDGER
  gained a donor section, a runtime-dependency section, and the full Python policy-plane
  primitive list.
- Spec version: v4.0/v4.1 -> **v4.2**. Six new gates in 13-hard-constraints.md; the
  "extend in place, never duplicate" gate retired. Options A/B/C and the TypeScript-
  middleware alternative recorded as rejected in 99-appendix-superseded.md.
- Decisions recorded: (1) standalone app over Agent Server API; (2) middleware in Python,
  chosen because confirmation policies, analyzers, StuckDetector and block_action are
  Python SDK objects and the Agent Server API surface could not be verified complete;
  (3) Agent Canvas vendored as MIT donor with attribution rather than extended.
- Risks logged: `@openhands/typescript-client` is alpha with no stability guarantee;
  agent-server tags are commit SHAs not semver; no formal OpenAPI document, versioning
  policy, or deprecation guarantee was found for the Agent Server API.
- Stop-condition status: Spec is now internally consistent under v4.2 and ADR-001 is
  ratified. **Stopped here.** No scaffolding created, no code written, Phase 0 not
  started. Phase 0 exit criterion remains unmet: baseline metrics report, first-run
  wizard, and the household-mode timing decision are all outstanding.

## 2026-08-08 02:52 EDT - ADR-002 ratified, MIT licensed, repo layout fixed

- Stage/phase: Pre-Phase-0 (three kickoff decisions closed)
- Component/port: none; no code written
- What changed:
  1. **Household mode -> Phase 1.** ADR-002 filed and ratified. Spec's §15.1 conditional
     resolved. Phase 1 now absorbs the HouseholdUser schema, created_by attribution across
     conversation/audit/budget records, per-user inbox and notification scoping, assist
     mode with dual-identity attribution, optional delegated approval including the
     sub-900px affordance, the household fork in the first-run wizard, novice AlwaysConfirm
     step-down window, and per-user budget ceilings with shared-GPU contention notice.
     Rationale: created_by is an identity dimension threaded through three schemas;
     retrofitting in Phase 3 would require migrating every record written during Phases 1-2
     and re-auditing the authorization log. Identity is cheapest at first write.
  2. **MIT LICENSE added**, plus NOTICE recording OpenHands Agent Canvas MIT attribution
     for vendored donor code and clarifying that upstream runtime artifacts are consumed
     unmodified, not redistributed.
  3. **Repo layout confirmed and created:** `apps/gui/` (frontend) and
     `services/middleware/` (Python policy plane). README contracts written into both.
     Directories intentionally contain no code - scaffolding is Phase 0/1 work.
- Files touched: `LICENSE` (new), `NOTICE` (new),
  `adrs/ADR-002-household-mode-phase-1.md` (new), `adrs/README.md`,
  `apps/gui/README.md` (new), `services/middleware/README.md` (new),
  `docs/specs/README.md`, `docs/specs/02-repo-setup.md`, `docs/specs/05-plan-model.md`,
  `docs/specs/06-change-review.md`, `docs/specs/11-dev-plan.md`,
  `docs/specs/15-household-profiles.md`
- Ports/adapters affected: none newly ported. Middleware anti-corruption layer and the
  telemetry adapter are now documented as owned components in the middleware README.
- ADR / ledger updated: ADR-002 filed; ADR index gained a Closed section recording the
  household-timing, LICENSE, and layout resolutions. PORTING_LEDGER unchanged this entry.
- Spec cleanup: swept every remaining reference that assumed editing upstream files in
  place. `05-plan-model.md` §5.2, `06-change-review.md` §6.1, and `11-dev-plan.md` Phase 3
  now read donor-side per ADR-001. Verified by grep - no unamended "extend in place" or
  in-place tab-editing instruction remains in docs/specs.
- Stop-condition status: All three Phase 0 blocking questions are now closed. **Stopped
  here.** No application code written. Phase 0 exit still requires: baseline metrics
  report vs. a dense Qwen3 27B-35B model, upstream artifact pins recorded, read-only stock
  Agent Canvas reference checkout, and the first-run wizard.
