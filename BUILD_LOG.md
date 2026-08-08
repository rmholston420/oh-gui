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

## 2026-08-08 04:15 EDT - Embedder matrix run: smaller models are SLOWER on CPU

- **Stage:** Phase 0 (baseline metrics)
- **Ran:** `bench/embed_matrix.sh` (24 threads, 124 GB RAM, num_ctx 512).

  | Model | Place | dims | single | batch64 | chunks/s | VRAM |
  |---|---|---:|---:|---:|---:|---:|
  | qwen3-embedding:0.6b | GPU | 1024 | 93.2 ms | 0.30 s | 215.8 | 1630 MiB |
  | qwen3-embedding:0.6b | CPU | 1024 | **113.5 ms** | **1.50 s** | **42.5** | ~0 |
  | nomic-embed-text | GPU | 768 | 21.0 ms | 0.29 s | 219.5 | 851 MiB |
  | nomic-embed-text | CPU | 768 | 258.1 ms | 14.92 s | 4.3 | 98 MiB |
  | embeddinggemma:300m | GPU | 768 | 103.1 ms | 0.51 s | 126.7 | 1208 MiB |
  | embeddinggemma:300m | CPU | 768 | 240.7 ms | 10.49 s | 6.1 | 11 MiB |

- **Counterintuitive result:** on CPU, `nomic-embed-text` (137M) is **10x slower** than
  `qwen3-embedding:0.6b` (600M) despite being 4.4x smaller. Parameter count does not
  predict CPU throughput here. Amortised per-chunk in batch: qwen3 23 ms vs nomic 233 ms -
  nomic gains essentially NOTHING from batching on CPU (single 258 ms vs batched 233 ms),
  while qwen3 goes 113 ms -> 23 ms. Consistent with the two models running on different
  Ollama inference engines with different CPU threading/batching quality; nomic is
  BERT-class on the llama.cpp path, qwen3-embedding is served by the new Go engine.
  The GPU ordering is reversed (nomic 21 ms vs qwen3 93 ms single), which reinforces that
  this is an engine/kernel effect, not an architecture-size effect.
- **`nomic-embed-text` REJECTED on both axes** - lower retrieval quality AND 10x worse CPU
  latency in the placement we actually ship. `embeddinggemma:300m` likewise rejected.
- **Verified quality ladder** (MTEB-multilingual Retrieval subscore, Qwen3-Embedding HF
  card, https://huggingface.co/Qwen/Qwen3-Embedding-0.6B):
  0.6B **64.64** | 4B **69.60** | 8B **70.88**. Mean(Task): 64.33 / 69.45 / 70.58.
  0.6B->4B is +4.96 retrieval; 4B->8B only +1.28. Sharp diminishing returns above 4B.
- **Correction logged:** an earlier ADR-004 draft claimed a "~7 MTEB point" qwen3-vs-nomic
  gap by comparing MTEB-eng-v2 against MTEB English v1 - different tracks, not
  apples-to-apples. Direction held, magnitude was unsupported. ADR-004 corrected.
- **Open:** 4b/8b CPU latency unmeasured. `embed_matrix.sh` extended with 4b/8b (CPU only -
  neither can share the GPU with the planner) plus an MRL dimension-truncation probe.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 04:20 EDT - qwen3.6:35b added to VRAM sweep (planner candidate)

- **Stage:** Phase 0 (baseline metrics)
- **Verified upstream** (https://ollama.com/library/qwen3.6/tags): `qwen3.6:35b`,
  `qwen3.6:35b-a3b` and `qwen3.6:latest` all share digest `07d35212591f`, 24 GB, 256K
  context, vision+tools+thinking. The `a3b` suffix means **MoE with ~3B active params** -
  it is NOT a dense 35B. `qwen3.6:27b` is digest `a50eda8ed977`, 17 GB.
- **Changed:** `bench/vram_sweep.sh` MODELS now includes `qwen3.6:35b`.
- **Predicted (to be falsified by measurement):** 24 GB weights + MoE KV cost measured at
  ~110 KB/token on the other A3B model (`qwen3-coder:30b`) implies ~27.6 GB at 32K and
  ~31 GB at 64K. Expect FITS at 32768, SPILL at 65536, and 131072 impossible.
- **Tradeoff this forces:** ADR-004 selected `qwen3.6:27b` at **131072** specifically to
  meet the Qwen3.6 card's >=128K guidance for preserving thinking capability. If 35b caps
  at 32K, adopting it is a 4x context regression bought with more parameters and ~3B
  active (faster generation). That is a genuine either/or, not a free upgrade, and needs
  an explicit decision once measured.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 04:25 EDT - Embedder -> 4b; 35b prediction FALSIFIED

- **Stage:** Phase 0 (baseline metrics)
- **Embedder matrix (CPU, num_ctx 512, 24 threads):** 0.6b 110.2 ms / 41.3 cps / 1024d;
  4b 161.0 ms / 13.7 cps / 2560d; 8b 211.7 ms / 7.9 cps / 4096d;
  nomic 245.3 ms / 4.4 cps. GPU rows for reference: 0.6b 90.2 ms, nomic 22.1 ms.
- **MRL probe PASSED:** Ollama honours `dimensions`; 4b and 8b both returned exactly 1024
  when requested (native 2560 / 4096).
- **DECISION:** embedder upgraded to **`qwen3-embedding:4b`**, CPU, **native 2560 dims**,
  `num_ctx 512`. Passes the pre-registered rule (161 ms for +4.96 retrieval points).
  8b rejected: +51 ms for only +1.28 over 4b. ADR-004 Amendment #2.
- **PREDICTION FALSIFIED - qwen3.6:35b.** BUILD_LOG 04:20 predicted FITS@32K, SPILL@64K,
  128K impossible. Actual: 100% GPU at **all four** contexts including **262144**
  (25114 / 25798 / 27063 / 29864 MiB). Derived KV/token: 27b 74.6 KB, coder:30b 110 KB,
  **35b 21.8 KB**. The prediction generalised from `qwen3-coder:30b` on the grounds that
  both are A3B MoE; that reasoning was unfounded - KV cost is set by attention config, not
  MoE topology. Recorded as ADR-004 Amendment #3.
- **Consequence:** 35b reaches full 256K with 2743 MiB free and costs only 885 MiB more
  than 27b at 131072, with ~3B active params (expected faster generation). The candidate
  freeze to 27b + qwen3-coder:30b was decided on the strength of the wrong prediction and
  is flagged for the operator to reconsider. No model change made unilaterally.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 04:30 EDT - Quant survey for qwen3.6:35b; only MTP is viable

- **Stage:** Phase 0 (baseline metrics)
- **Surveyed all 15 `35b` tags** (https://ollama.com/library/qwen3.6/tags):

  | Tag | Size | Quant | Verdict |
  |---|---:|---|---|
  | `35b` / `35b-a3b` / `35b-a3b-q4_K_M` | 24 GB | q4_K_M | current; digest `07d35212591f` |
  | `35b-a3b-mtp-q4_K_M` | 23 GB | q4_K_M | **CANDIDATE** - MTP, digest `c7bd058dd977`, newer |
  | `35b-a3b-nvfp4` | 22 GB | nvfp4 | digest `1b50c6fdc2d4` - IDENTICAL to `35b-mlx`; MLX = Apple Silicon, not CUDA |
  | `35b-mlx` | 22 GB | - | MLX, Apple only |
  | `35b-a3b-q8_0` / `mtp-q8_0` | 39 GB | q8_0 | EXCEEDS 32,607 MiB VRAM |
  | `35b-a3b-mxfp8` / `coding-mxfp8` | 38 GB | mxfp8 | EXCEEDS VRAM |
  | `35b-a3b-bf16` and variants | 70-72 GB | bf16 | EXCEEDS VRAM |

- **Finding: no quality upgrade is reachable.** The next step up from q4_K_M is q8_0 at
  39 GB, which exceeds the card by ~6 GB before any KV cache. q4_K_M is the quantization
  ceiling on a single 32 GB 5090 for this model. Same holds for `qwen3.6:27b-q8_0` (30 GB
  weights leaves no usable KV room).
- **`nvfp4` rejected pending evidence:** despite the NVIDIA-sounding name, the
  `35b-a3b-nvfp4` tag shares digest `1b50c6fdc2d4` with `35b-mlx` and is labelled MLX on
  the tags page. MLX targets Apple Silicon. Not pulled - 22 GB is too expensive to spend
  on an unverified hypothesis. If this is a page-labelling artifact it can be revisited.
- **`35b-a3b-mtp-q4_K_M` added to `bench/vram_sweep.sh`.** MTP = multi-token prediction
  (speculative decoding head). Same q4_K_M weights, so quality parity is EXPECTED and must
  be confirmed rather than assumed; the potential gain is generation speed, which matters
  for agent loops. Whether Ollama actually engages the MTP head is unverified - the sweep
  plus tok/s in the quality bench will show it.
- **Stop condition:** Phase 0 exit still NOT met.

