# OH-GUI Session Handoff

**This file reflects current state only. Overwrite it each session end.**
Last updated: 2026-08-08 02:45 EDT

## Current stage

Pre-Phase-0. Repository bootstrapped, ADR-001 ratified, spec reconciled to v4.2.
**No code has been written and Phase 0 has not started.**

## Architecture as of now (ADR-001, ratified)

OH-GUI is a **standalone application**, not an extension of Agent Canvas.

```
Browser frontend  ->  OH-GUI Python middleware  ->  OpenHands Agent Server
   (vendored               (policy plane:              (pinned Docker
    Agent Canvas            trust dial, analyzers,      image, HTTP + WS)
    components)             StuckDetector, quarantine,
                            audit log, ACL layer)
```

- OpenHands source is **never** modified, forked, or patched.
- OpenHands is consumed as pinned artifacts only: `agent-server` Docker image (by digest)
  and the `openhands-sdk` pip family.
- Middleware is **Python**, because the policy primitives are Python SDK objects.
- The frontend never calls the Agent Server directly for anything policy-bearing.
- Agent Canvas is a **donor** (MIT, archived 2026-07-27 = frozen and stable). Vendor its
  components with attribution and log every port in `PORTING_LEDGER.md`.
- A read-only stock Agent Canvas checkout is kept only for the Phase 0 regression baseline.

## Completed this session

- Read all 21 attached spec files in full.
- Created public repo `rmholston420/oh-gui` (default branch `main`).
- Pushed the 20 v4 spec files to `docs/specs/`; isolated the superseded v3.0 monolith to
  `docs/specs/archive/` with a rejected-ideas notice.
- Seeded `BUILD_LOG.md`, `DEBUG_LOG.md`, `PORTING_LEDGER.md`.
- Investigated the live upstream integration surface and found the Agent Server /
  typescript-client / pip-SDK consumption path the spec never mentioned.
- Filed and ratified `adrs/ADR-001-integration-boundary.md`; created `adrs/README.md`.
- Reconciled the spec to **v4.2**: amended `README.md`, `00-ground-truth.md`,
  `02-repo-setup.md`, `12-portable-components.md`, `13-hard-constraints.md`,
  `99-appendix-superseded.md`. Retired the "extend in place" gate, added six v4.2 gates.

## Remaining before the Phase 0 Definition of Done

- [x] Architecture decision record filed (ADR-001).
- [ ] Household-mode timing decision (Phase 1 vs Phase 3) - `02-repo-setup.md` item 9.
- [ ] Baseline metrics report against a dense Qwen3 27B-35B model: 5-10 tasks logging
      time-to-first-review, turns-to-acceptance, lines-accepted-without-inspection,
      "lost track" incidents, GPU temp/power, mental-model-formation baseline.
- [ ] Stock Agent Canvas pinned as the read-only regression baseline checkout.
- [ ] First-run wizard shipped, stating the default trust-dial stop (`ConfirmRisky()`)
      explicitly in its own UI copy.

## Open questions awaiting the user

1. **Household-mode timing** - Phase 1 or Phase 3? Blocks Phase 0 exit. Ship in Phase 1 if
   a non-technical user will use the system within the first month of deployment.
2. **LICENSE** - declined at bootstrap. A public repo with no license is
   all-rights-reserved by default, which sits awkwardly with vendoring MIT donor code
   into it. Recommend MIT. Needs a yes/no.
3. **Repo layout for code** - proposed but not created:
   `apps/gui/` (frontend) and `services/middleware/` (Python). Not scaffolded, since that
   is Phase 0/1 work. Confirm the shape before anything is created.
4. **Upstream pin re-verification** - `00-ground-truth.md` pins `v1.12.0` /
   `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364`. Under ADR-001 what matters instead is the
   `agent-server` image digest and the pip/npm versions. None are pinned yet.

## Known risks carried forward

- `@openhands/typescript-client` is **alpha**; its API "may change significantly between
  versions without notice." Mitigation: middleware anti-corruption layer.
- `agent-server` image tags are commit SHAs, not semver. Pin by digest.
- No formal OpenAPI document, versioning policy, or deprecation guarantee was found for
  the Agent Server API. Revisit if upstream publishes one.

## Exact next action

Clone to `~/dev/oh-gui` on Colossus, read `adrs/ADR-001-integration-boundary.md`, then
answer open questions 1-3. Do not start Phase 0 until the household-mode timing decision
is recorded.
