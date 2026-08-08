# OH-GUI Session Handoff

**This file reflects current state only. Overwrite it each session end.**
Last updated: 2026-08-08 02:53 EDT

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
- [x] Household-mode timing decision recorded (ADR-002 - **Phase 1**).
- [ ] Baseline metrics report against a dense Qwen3 27B-35B model: 5-10 tasks logging
      time-to-first-review, turns-to-acceptance, lines-accepted-without-inspection,
      "lost track" incidents, GPU temp/power, mental-model-formation baseline.
- [ ] Upstream artifact pins recorded in BUILD_LOG: agent-server image **digest**, pip
      versions for the openhands-sdk family, npm version for the typescript-client.
- [ ] Stock Agent Canvas pinned as the read-only regression baseline checkout.
- [ ] First-run wizard shipped, stating the default trust-dial stop (`ConfirmRisky()`)
      explicitly in its own UI copy, and including the household fork.

## Decisions closed 2026-08-08

- **Household mode -> Phase 1** (ADR-002). Phase 1 is now the largest slice in the plan
  and carries the project's only comprehension-testing gate (§4.2 authorization-card copy
  verified with a non-technical reviewer). Do not compress that check.
- **MIT licensed.** `LICENSE` + `NOTICE` added; NOTICE carries Agent Canvas attribution.
- **Layout fixed:** `apps/gui/` and `services/middleware/`, each with a README stating its
  boundary contract. No code inside either - deliberately.

## Open questions awaiting the user

None blocking. Next decision point is the Phase 0 baseline-metrics run, which needs a
model choice in the dense Qwen3 27B-35B band and a set of 5-10 representative tasks.

## Known risks carried forward

- `@openhands/typescript-client` is **alpha**; its API "may change significantly between
  versions without notice." Mitigation: middleware anti-corruption layer.
- `agent-server` image tags are commit SHAs, not semver. Pin by digest.
- No formal OpenAPI document, versioning policy, or deprecation guarantee was found for
  the Agent Server API. Revisit if upstream publishes one.

## Exact next action

Pull to `~/dev/oh-gui` on Colossus and read both ADRs. Then begin Phase 0 proper by
recording upstream artifact pins - resolve the `agent-server` image to a digest and pin
the openhands-sdk pip family - logging each to `BUILD_LOG.md`. The baseline metrics run
follows; it needs a chosen dense Qwen3 27B-35B model and 5-10 representative tasks.
