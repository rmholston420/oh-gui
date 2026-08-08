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

## 2026-08-08 03:20 EDT - ADR-003: single-operator; household removed, safety plane retained

- Stage/phase: Pre-Phase-0
- Component/port: none; no code written
- What changed: User stated "remove the household and auth stuff, i will be the only one
  using the app." Household is unambiguous and was removed in full. **"Auth" was flagged
  before touching it**: 04-authorization.md authorizes the *agent's actions* (trust dial,
  authorization cards, capability manifest, emergency stop, execute_tool bypass closure,
  prompt-injection quarantine, audit log) and is not user authentication. Single-operator
  deployment does not reduce that need - it means the operator is the only control between
  an autonomous agent and the Colossus filesystem. User confirmed: keep the safety plane,
  cut only multi-user.
- ADR-003 filed and ratified; **ADR-002 superseded the same day**, before any code was
  written against it. ADR-002 text retained unaltered under a STATUS AMENDMENT block.
- Removed across the spec: household profiles, proficiency tiers, per-user default
  trust-dial stops, created_by attribution, assist mode, delegated approval (4.2.2 in
  full), per-user inbox and notification scoping, per-user budget ceilings and pooling,
  the household wizard fork (3.4 step 2) and delegated-approval walkthrough (step 7), the
  non-technical comprehension gate, and nine gates in 13-hard-constraints.md.
- Retained deliberately: the entire authorization safety plane (4.1-4.11) and
  04a-prompt-injection.md. Vibe/Pro dual-lens retained on new grounds - Principle 11
  rewritten as two lenses for one operator at different times, not for different people.
  The both-lenses exit requirement survives.
- Files touched: adrs/ADR-003-single-operator-remove-household.md (new),
  adrs/ADR-002-household-mode-phase-1.md (amended), adrs/README.md,
  docs/specs/{00,01,02,03,04,05,08,09,10,11,12,13,99,README}.md
- Files moved: docs/specs/15-household-profiles.md -> docs/specs/archive/ with a
  do-not-resurrect banner. 99-appendix-superseded.md reversed its v4.0 entry: the
  single-operator assumption is now the current and correct position.
- Verified: grep for household/created_by/delegat/novice/proficiency/per-user/assist over
  docs/specs returns only removal notices and negative constraints. 13-hard-constraints.md
  went from 65 to 61 gates net (9 removed, 5 added under a v4.3 heading).
  04-authorization.md section list confirmed intact: 4.1, 4.1.1, 4.2, 4.2.1, 4.3-4.11.
- Spec version: v4.2 -> **v4.3**.
- Phase 0 baseline model set decided (provisional, ADR to follow the bench run):
  `qwen3.6:27b` dense 27.8B Q4_K_M 17GB as planner/thinker, and `qwen3-coder:30b` MoE
  30.5B-A3B Q4_K_M 19GB as coder. `qwen3:32b` dropped - 20GB, ~1 year old, superseded by
  the smaller and newer qwen3.6:27b in the same dense class. VRAM: 32.6GB total, less
  ~1.0-1.5GB desktop, ~0.8GB qwen3-embedding:0.6b resident, ~0.6GB CUDA/runner overhead
  => ~29.7GB for the main model, so 12GB KV headroom at 17GB weights and 10GB at 19GB.
  The two main models cannot be co-resident (36GB); Ollama hot-swap cost per role switch
  is unmeasured and must be benchmarked. Open risk: the LLM-based security analyzer needs
  concurrent VRAM and should be a small dedicated model, not the main agent model.
- Stop-condition status: **Stopped here.** No application code written. Phase 0 exit still
  requires baseline metrics report, upstream artifact pins, read-only stock Agent Canvas
  reference checkout, and the first-run wizard.

## 2026-08-08 03:45 EDT - VRAM/context envelope measured; ADR-004 filed

- **Stage:** Phase 0 (baseline metrics)
- **Built/changed:**
  - `bench/vram_sweep.sh` v2 - aborts if any model is resident before the idle baseline
    (v1's q8 run was contaminated by a resident embedding model, idle read 6747 MiB);
    unloads all models between cells; sweeps embedding `num_ctx`.
  - `bench/ollama_env.sh` - sets Ollama server env via systemd drop-in
    (`/etc/systemd/system/ollama.service.d/oh-gui.conf`) and echoes the effective
    environment. `systemctl set-environment` did not reach the service in v1.
  - `bench/validate_config.sh` - co-residency + role-switch-cost harness (NOT YET RUN).
  - `adrs/ADR-004-vram-context-envelope.md` - Ratified.
- **Measurements (2 clean runs, idle 653 / 614 MiB, gpu_total 32607 MiB):**
  - `qwen3.6:27b` fits 100% GPU up to **131072** (26113 MiB); 262144 spills to 86% CPU.
  - `qwen3-coder:30b` fits 100% GPU up to **65536** (25167 MiB); 131072 spills to 97% CPU.
  - KV/token: 27b ~74.6 KB, coder ~110 KB. The MoE costs MORE than the dense model -
    the pre-measurement assumption was inverted and is corrected in ADR-004.
  - `qwen3-embedding:0.6b` costs **6041 MiB** at the default 32768 ctx, **1502 MiB** at
    512. Pinned to 512.
- **Negative result:** `OLLAMA_KV_CACHE_TYPE=q8_0` is confirmed present in the service
  environment yet produces byte-identical VRAM to f16 across all 8 cells. Ollama's new Go
  engine ignores it (ollama#8921). KV quantization abandoned on Ollama; env left at f16.
- **Ports/adapters affected:** middleware model router gains a hard requirement - explicit
  `ollama stop` on every role switch (host runs `OLLAMA_KEEP_ALIVE=-1`, models never
  auto-unload). Planner and coder can never be co-resident (~41 GB combined).
- **ADR/ledger:** ADR-004 added; `adrs/README.md` index updated. No PORTING_LEDGER change.
- **Stop condition:** Phase 0 exit still NOT met. Remaining: run `validate_config.sh`,
  quality bench vs Perplexity gold, upstream artifact pins (agent-server digest, pip/npm
  versions), read-only stock Agent Canvas reference checkout, first-run wizard.

## 2026-08-08 03:50 EDT - CPU embedder placement under evaluation

- **Stage:** Phase 0 (baseline metrics)
- **Built/changed:** `bench/embed_cpu_vs_gpu.sh` - measures single-chunk latency and
  64-chunk batch throughput for `qwen3-embedding:0.6b` at `num_ctx 512`, GPU vs
  `num_gpu: 0`, with VRAM cost and Ollama processor split per placement. NOT YET RUN.
- **Motivation:** operator proposed running the embedder on CPU. Colossus has 128 GB RAM;
  the model is 0.6B. If viable this reclaims 1502 MiB and reopens the CPU-resident option
  for the security analyzer (ADR-004 §5).
- **ADR/ledger:** ADR-004 amended with a STATUS AMENDMENT block; decision pending data.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 03:55 EDT - Co-residency validated; embedder eviction found; switch cost measured

- **Stage:** Phase 0 (baseline metrics)
- **Ran:** `bench/validate_config.sh` (idle 679 MiB, gpu_total 32607 MiB).
- **Results:**
  - `qwen3.6:27b` @131072 + `qwen3-embedding:0.6b` @512 - BOTH resident, 100% GPU,
    **27738 MiB used, 4869 MiB free**, 4.0s load. Genuinely co-resident.
  - `qwen3-coder:30b` @65536 + embedder - **embedder was EVICTED by the Ollama
    scheduler**; only the coder is in `ollama ps` (25280 MiB used, 7327 free). The two
    should fit (~25.6 GB + 1 GiB reserve), so this is conservative estimator behaviour,
    not a hard limit. Non-deterministic and therefore unacceptable for the retrieval path.
  - Role-switch cost: ->coder 2.8s / 3.6s, ->planner 6.9s / 5.5s. Cheap; hot-swap routing
    is viable.
- **Bug found in own tooling:** `validate_config.sh` reported `verdict=FITS` for the coder
  row despite the eviction, because it only checked for CPU spill. Fixed to require all
  expected models resident AND 100% GPU before passing.
- **Consequence:** the CPU-embedder proposal is now the leading option on correctness
  grounds, not just VRAM - CPU placement removes the eviction race entirely.
- **Stop condition:** Phase 0 exit still NOT met. Next: `bench/embed_cpu_vs_gpu.sh`.

## 2026-08-08 04:00 EDT - Embedder candidate matrix added (nomic + embeddinggemma)

- **Stage:** Phase 0 (baseline metrics)
- **Built/changed:** `bench/embed_matrix.sh` supersedes `bench/embed_cpu_vs_gpu.sh`.
  Matrix of {qwen3-embedding:0.6b, nomic-embed-text, embeddinggemma:300m} x {gpu, cpu},
  measuring median single-chunk latency, 64-chunk batch throughput, real output
  dimensionality, VRAM cost, and Ollama processor split. Skips models not pulled.
- **Motivation:** operator proposed nomic-embed-text as a smaller alternative.
- **Verified quality data:** Qwen3-Embedding-0.6B ~70.7 MTEB-eng-v2
  (https://d-central.tech/local-embedding-models/); nomic-embed-text ~62-64
  (https://www.premai.io/blog/best-embedding-models-for-rag-2026-ranked-by-mteb-score-cost-and-self-hosting/).
  Dims differ: 1024 vs 768 - a vector-store schema change, not a drop-in swap.
- **Position:** on CPU the weight-size advantage of nomic is nearly irrelevant (128 GB
  RAM). Only measured CPU latency justifies trading ~7 MTEB points. Decision deferred to
  the matrix results.
- **Lock-in note:** the embedder must be chosen BEFORE the first index build; changing it
  later requires re-embedding the entire corpus.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 04:05 EDT - Embedder placement RATIFIED: CPU

- **Stage:** Phase 0 (baseline metrics)
- **Ran:** `bench/embed_cpu_vs_gpu.sh` twice (24 threads, 124 GB RAM, num_ctx 512).

  | Placement | single | batch64 | chunks/s | VRAM cost |
  |---|---|---|---|---|
  | GPU | 91.1 / 93.2 ms | 0.30 / 0.30 s | 216.0 / 210.9 | 1511 / 1540 MiB |
  | CPU | 109.3 / 117.7 ms | 1.53 / 1.65 s | 42.0 / 38.8 | 16 / 28 MiB |

- **Decision:** embedder -> CPU (`num_gpu: 0`), `qwen3-embedding:0.6b` retained at
  `num_ctx 512`. ADR-004 amended to Ratified. +25 ms on the query path; ~4 min to index a
  10k-chunk corpus. Reclaims ~1.5 GB and removes the scheduler-eviction race.
- **nomic-embed-text REJECTED** - Qwen CPU latency is acceptable, so the ~7 MTEB-point
  quality gap is not worth trading. `bench/embed_matrix.sh` retained for future
  re-evaluation but not required for the Phase 0 decision.
- **Bug found in own tooling:** both embed scripts printed `processor=[minutes from]` -
  positional slicing of the `ollama ps` table broke on the multi-word UNTIL column. CPU
  placement was therefore confirmed by VRAM cost (16-28 MiB vs 1511), not by the processor
  field. `embed_matrix.sh` now parses `/api/ps` JSON and uses `size_vram==0`.
- **Resulting envelope (embedder on CPU):** planner @131072 ~6.4 GB free;
  coder @65536 ~7.4 GB free; no co-residency conflict, no eviction risk.
- **Stop condition:** Phase 0 exit still NOT met. Remaining: quality bench vs Perplexity
  gold, upstream artifact pins, stock Agent Canvas reference checkout, first-run wizard.

