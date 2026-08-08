# OH-GUI Session Handoff

**This file reflects current state only. Overwrite it each session end.**
Last updated: 2026-08-08 03:20 EDT

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

- **Single operator** (ADR-003, supersedes ADR-002). Household mode removed entirely;
  §15 archived. The authorization safety plane in `04-authorization.md` and
  `04a-prompt-injection.md` is **retained in full** - it authorizes the agent's actions,
  not users, and is unaffected by user count. Phase 1 shrank accordingly.
- **Baseline models fixed:** `qwen3.6:27b` (planner, dense 27.8B, 17GB) and
  `qwen3-coder:30b` (coder, MoE 30.5B-A3B, 19GB). `qwen3:32b` dropped as superseded.
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

## VRAM plan (Colossus, 32.6 GB)

```
32.6  total
 -1.5  KDE desktop + browser compositing
 -0.8  qwen3-embedding:0.6b resident (639 MB weights)
 -0.6  CUDA context / Ollama runner
=====
~29.7  for the main LLM (weights + KV cache)
```

- `qwen3.6:27b` @ 17 GB -> ~12 GB KV headroom
- `qwen3-coder:30b` @ 19 GB -> ~10 GB KV headroom
- The two cannot be co-resident (36 GB). Ollama hot-swaps; swap cost is unmeasured.
- Dense models cost roughly 2.5x more KV per token than the A3B MoE at equal context.
- **Unresolved:** the LLM-based security analyzer (§4.1 EnsembleSecurityAnalyzer) needs
  concurrent VRAM. It should be a small dedicated model. Not yet sized.

## Exact next action

Pull to `~/dev/oh-gui` and read ADR-001 and ADR-003. Then measure real VRAM before
committing to the model plan:

```bash
ollama pull qwen3.6:27b && ollama pull qwen3-coder:30b && ollama pull qwen3-embedding:0.6b
for m in qwen3.6:27b qwen3-coder:30b; do
  ollama run $m "hi" >/dev/null; echo "--- $m"; ollama ps; ollama stop $m
done
```

`ollama ps` must report `100% GPU`; anything else means it spilled to CPU. Then build the
bench harness per the `local-llm-bench` skill: prompts on disk, one JSON per cell,
Perplexity gold answers generated first, `<think>` stripped before scoring.
