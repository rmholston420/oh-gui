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

## 2026-08-08 04:40 EDT - Second coder candidate: Devstral

- **Stage:** Phase 0 (baseline metrics)
- **Surveyed local coding models against the 32,607 MiB envelope:**

  | Model | Size (q4_K_M) | Params | Verdict |
  |---|---:|---|---|
  | `qwen3-coder:30b` | 19 GB | 30B A3B MoE | incumbent |
  | **`devstral:24b`** | **14 GB** | **24B dense, 128K** | **CANDIDATE** |
  | `qwen3-coder-next` | **52 GB** | 80B A3B, 256K | REJECTED - exceeds VRAM by 20 GB |
  | `qwen2.5-coder:32b` | 20 GB | 32B dense | REJECTED earlier (32K native, ~256 KB/tok KV) |

- **Rationale for Devstral:** built jointly by Mistral AI and All Hands AI explicitly for
  coding agents (https://www.openhands.dev/blog/devstral-a-new-state-of-the-art-open-model-for-coding-agents).
  Apache 2.0. Since OH-GUI wraps OpenHands (ADR-001), this is the most decision-relevant
  comparison available: it is the only candidate tuned for the exact scaffold we ship.
- **Version caveat - UNRESOLVED, operator input needed.** The official Ollama library
  carries only `devstral:24b` = Devstral Small **1.0** (2505), scoring 46.8% SWE-Bench
  Verified with OpenHands. Devstral Small **1.1** (2507) scores **53.6%**
  (https://huggingface.co/mistralai/Devstral-Small-2507), +6.8 points, but is NOT in the
  official Ollama namespace - only community re-uploads
  (`seamon67/Devstral1.1-2507:24b-q4_K_M`, `SimonPu/Devstral-Small:2507-Q4_K_XL`, 15 GB).
  Verified-provenance 1.0 vs better-but-unverified 1.1 is a genuine tradeoff; not decided
  unilaterally. `devstral:24b` (official) added to the sweep as the safe default.
- **VRAM expectation deliberately NOT predicted.** The last KV prediction (35b) was wrong;
  24B dense with GQA will be measured, not estimated.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 04:48 EDT - OpenHands LM rejected; All Hands now recommends qwen3.6:35b-a3b

- **Stage:** Phase 0 (baseline metrics)
- **OpenHands LM 32B v0.1 evaluated and REJECTED:**
  - Released 2025-03-31, fine-tuned from Qwen2.5-Coder-32B-Instruct via SWE-Gym RL
    (https://www.openhands.dev/blog/introducing-openhands-lm-32b----a-strong-open-coding-agent-model).
  - **37.2%** SWE-Bench Verified vs Devstral Small 1.1's **53.6%** - a 16-point deficit.
  - Built on the exact base this project already rejected (Qwen2.5-Coder-32B, 32K native).
  - No v0.2 in 17 months; HF page reports **159 downloads last month**. Effectively
    abandoned (https://huggingface.co/all-hands/openhands-lm-32b-v0.1).
- **KEY FINDING - All Hands' own current recommendation is `qwen3.6:35b-a3b`.** Their local
  LLM docs, updated **2026/05/21**, state: "We now recommend Qwen3.6-35B-A3B as the first
  local model to try with OpenHands"
  (https://docs.openhands.dev/openhands/usage/llms/local-llms). They document the exact
  Ollama tag `qwen3.6:35b-a3b`, addressed in OpenHands as `openai/qwen3.6:35b-a3b`, and
  cite 24 GB VRAM as sufficient for quantized variants.
- **Consequence:** the model whose context envelope was mis-predicted at 04:20 and
  corrected at 04:25 is independently the vendor-recommended local model for the exact
  scaffold OH-GUI wraps (ADR-001). This is convergent evidence, not proof of quality - no
  SWE-Bench score is published for it on that page, and the quality bench still decides.
- **Their Ollama guidance:** `OLLAMA_CONTEXT_LENGTH` >= 22000, 32768 recommended, default
  4096 called "way too small - not even the system prompt will fit." Host is already at
  65536; compliant.
- **Bench scope consequence:** `qwen3.6:35b` must be benched on the CODER tasks as well as
  the planner tasks, since All Hands positions it as the single local model for the whole
  agent loop. Coder field is now: `qwen3-coder:30b` (incumbent), `devstral:24b`,
  `qwen3.6:35b`.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 04:55 EDT - Devstral 1.1 sourced from unsloth (verified); MTP retained

- **Stage:** Phase 0 (baseline metrics)
- **Operator decision:** use Devstral **1.1** (2507), and keep the MTP 35b variant.
- **Provenance resolved WITHOUT a community re-upload.** Rather than
  `seamon67/Devstral1.1-2507` or `SimonPu/Devstral-Small`, the GGUF is pulled directly from
  **`unsloth/Devstral-Small-2507-GGUF`** (https://huggingface.co/unsloth/Devstral-Small-2507-GGUF),
  **SPDX: Apache-2.0**, derived from `mistralai/Devstral-Small-2507` (also Apache-2.0,
  safetensors only - no official GGUF). Ollama pulls HF GGUF repos natively, so no
  unverified namespace is involved.
- **Quant selected: `UD-Q4_K_XL` (13.55 GB).** Unsloth Dynamic 4-bit. Chosen to match the
  incumbent's tier (`qwen3-coder:30b` is q4_K_M) so the comparison isolates the MODEL, not
  the quantization. Verified sizes in that repo:

  | Quant | Size |
  |---|---:|
  | Q4_K_M | 13.35 GB |
  | **UD-Q4_K_XL** | **13.55 GB** |
  | Q5_K_M | 15.61 GB |
  | Q6_K | 18.02 GB |
  | Q8_0 | 23.33 GB |

- **Deferred, not rejected:** Devstral is 24B dense at only ~13.5 GB, so Q6_K (18 GB) and
  even Q8_0 (23 GB) may fit. Testing every model at its best fitting quant would confound
  the model comparison, so the matched-tier run happens first; if Devstral wins or lands
  within the 3-point tie band, it is re-tested at Q6_K before anything is ratified.
- **`bench/vram_sweep.sh` MODELS is now:** `qwen3.6:27b`, `qwen3.6:35b`,
  `qwen3.6:35b-a3b-mtp-q4_K_M`, `qwen3-coder:30b`,
  `hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL`. `devstral:24b` (1.0) removed - 1.1
  supersedes it at +6.8 SWE-Bench points.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 05:05 EDT - MTP variant measured; 35b falsification REPLICATED

- **Stage:** Phase 0 (baseline metrics)
- **Run:** `/home/rmholston/.oh-gui/vram_sweep/20260808_0410_f16.csv`, idle 838 MiB.
- **REPLICATION - the 04:25 falsification holds.** Second independent run of `qwen3.6:35b`
  reproduced 100% GPU at all four contexts: 25034 / 25727 / 27087 / **29740** MiB vs the
  first run's 25114 / 25798 / 27063 / 29864. Max drift 124 MiB. The 256K result is real,
  not a one-off measurement artifact.
- **`qwen3.6:35b-a3b-mtp-q4_K_M` WINS on footprint at every context:**

  | ctx | 35b base | 35b MTP | delta |
  |---:|---:|---:|---:|
  | 32,768 | 25,034 | **24,239** | -795 |
  | 65,536 | 25,727 | **24,843** | -884 |
  | 131,072 | 27,087 | **26,390** | -697 |
  | 262,144 | 29,740 | **29,453** | -287 |

  Free at 256K rises from 2,867 to **3,154 MiB** - material, given the desktop will grow
  2-3 GB once a browser and the OH-GUI frontend are running.
- **Why it is smaller despite carrying an extra head:** the MTP manifest is a 21 GB weight
  blob plus a 902 MB MTP head (21.9 GB total) against the base tag's single 23 GB blob.
  Both are labelled q4_K_M; the packing differs. Derived KV cost is unchanged at
  ~23.3 KB/token (5,214 MiB across 229,376 tokens), consistent with base 35b's 21.8 KB.
- **Speed is still UNMEASURED and is the entire point of MTP.** Multi-token prediction is a
  throughput feature; a VRAM sweep cannot see it. No speed claim is made until the quality
  bench records tok/s. Footprint alone already justifies keeping it.
- **Coder field pending one row:** Devstral 1.1 has not been pulled yet - the sweep above
  ran at commit `131d4aa`, before the Devstral entry landed.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 05:20 EDT - Devstral 1.1 measured; VRAM envelope CLOSED

- **Stage:** Phase 0 (baseline metrics) - envelope sub-goal COMPLETE
- **Run:** `/home/rmholston/.oh-gui/vram_sweep/20260808_0420_f16.csv`, idle 652 MiB.
- **Devstral-Small-2507 UD-Q4_K_XL** (`hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL`,
  blobs: 14 GB weights + 878 MB mmproj vision projector):

  | ctx | used | free | verdict |
  |---:|---:|---:|---|
  | 32,768 | 21,284 | 11,323 | OK |
  | 65,536 | 26,160 | 6,447 | OK |
  | 131,072 | 31,636 | 971 | **SPILLED 84% CPU** |

- **Derived KV: ~152 KB/token** - the most expensive of all five candidates, from the
  physically smallest weights. 24B dense with wide GQA. Ceiling is **65,536**.
- **The coder comparison is context-matched at 65,536** - `qwen3-coder:30b` (25,194 MiB)
  vs Devstral (26,160 MiB). Neither is handicapped.
- **Envelope closed. Final KV/token spread: 21.8 -> 152 KB, a 7x range** that tracks
  neither parameter count, nor MoE topology, nor file size. Recorded as ADR-004
  Amendment #4 together with the full table.
- **Note:** the 878 MB mmproj blob is Devstral's vision projector. OH-GUI has no vision
  path in Phase 0; if Devstral is selected, a text-only Modelfile can reclaim it. Not
  actioned now - it does not affect the measured rows.
- **Stop condition:** Phase 0 exit still NOT met. Remaining: quality bench vs Perplexity
  gold, upstream artifact pins, stock Agent Canvas reference checkout, first-run wizard.

## 2026-08-08 05:35 EDT - Server/GPU tuning pass; flash attention found UNVERIFIED

- **Stage:** Phase 0 (baseline metrics)
- **Source:** Ollama FAQ (https://github.com/ollama/ollama/blob/main/docs/faq.md) and
  `envconfig/config.go` (https://raw.githubusercontent.com/ollama/ollama/main/envconfig/config.go).

- **DEFECT IN OUR OWN VERIFICATION.** Every sweep so far printed
  `== server startup lines mentioning flash attention / kv cache ==  (none found)`.
  That output was treated as cosmetic. It is not: **flash attention has never actually been
  confirmed active on this host.** FA materially changes KV memory scaling, so every
  measured context ceiling rests on an unverified assumption. `bench/ollama_env.sh` v3 adds
  a `debug` mode (`OLLAMA_DEBUG=1` + a probe request) that captures the real runner flags.
  Numbers already recorded are internally consistent across three runs and are NOT being
  withdrawn, but the FA question must be settled before any tok/s figure is trusted.

- **`OLLAMA_MAX_LOADED_MODELS` was the root cause of the eviction race.** Documented default
  is **3 x GPU count**, i.e. 3 here - which is precisely why the scheduler held the embedder
  next to a role model and then evicted it. Set to **2**: one GPU role model plus the
  CPU-resident embedder. Not 1 - the CPU embedder occupies a model slot, so 1 would evict
  and reload it on every planner<->coder switch. This enforces ADR-004's "planner and coder
  never co-resident" invariant at the server rather than trusting the router to call
  `ollama stop`. **Unverified assumption:** that a CPU-placed model counts toward the limit.
  If it does not, 2 permits two GPU models and the value must drop to 1. Testable directly.

- **`OLLAMA_NUM_PARALLEL` pinned to 1.** Parallel slots divide the context window among
  them; at the documented default of 1 nothing is currently lost, but pinning removes any
  dependence on that default holding. Had it been higher, every measured context ceiling
  would have been wrong by that factor.

- **`bench/gpu_pin.sh` added.** Persistence mode (targets the fixed portion of the measured
  2.8-6.9 s role-switch cost), plus clock/power/throttle reporting, plus optional clock
  locking for run-to-run comparability during the quality bench.

- **`bench/ollama_env.sh` bumped to v3, replacing v2 in place** - single path, no competing
  copy, per the supersede rule.

- **Considered and NOT adopted:** `OLLAMA_LLM_LIBRARY` to force the llama.cpp backend and
  recover q8_0 KV quantization. If it worked it would roughly double every context ceiling,
  which is the single highest-value untested lever here - but it swaps the inference engine
  underneath an already-measured envelope and would invalidate all three sweeps. Logged as a
  candidate experiment for AFTER the quality bench, not before.

- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 05:50 EDT - MAX_LOADED_MODELS=2 CONFIRMED; flash attention still unproven

- **Stage:** Phase 0 (baseline metrics)
- **`OLLAMA_MAX_LOADED_MODELS=2` verified correct.** `/api/ps` after loading both:
  `qwen3-embedding:4b` with `size_vram: 0` (CPU) and `qwen3.6:35b-a3b-mtp-q4_K_M` with
  `size_vram: 22,236,427,713` (20.7 GiB, GPU). Two entries under a limit of 2 confirms the
  open assumption from 05:35: **a CPU-placed model does occupy a model slot.** So 1 would
  have thrashed the embedder and 2 is the correct value. Assumption closed by measurement.
- **Operator decision:** the `OLLAMA_LLM_LIBRARY` / llama.cpp + q8_0 KV experiment runs
  **after** the quality bench, not before. Sequencing confirmed; envelope stays intact.
- **Flash attention: SECOND verification attempt FAILED.** `OLLAMA_DEBUG=1` plus a probe
  request captured no runner flags; the startup grep is still `(none found)`. Two failed
  log-based attempts is enough - **the method is wrong, not the setting.** Ollama's Go
  engine appears not to log runner flags at this level.
- **`bench/fa_probe.sh` added - falsification by measurement instead of by log.** Same
  method that settled q8_0: run `qwen3.6:27b` @131072 (74.6 KB/token, the largest KV signal
  among the candidates) with a ~24k-token prompt, once at `FA=1` and once at `FA=0`, and
  compare resident VRAM and prefill throughput. Identical results on both axes means flash
  attention is a no-op on this runtime, exactly like q8_0 KV. Includes the same
  abort-if-resident precondition that the original q8 script lacked.
- **GPU finding: the card is power-capped below its own limit.** `power.limit=435 W` against
  `power.max_limit=600 W`, and the SW Power Capping counter already read **854,692 us at
  idle** with the GPU at 6% utilisation and 34 C. Under sustained decode this will cost
  clocks. `bench/gpu_pin.sh power` added to raise the limit to 600 W; NOT applied
  automatically - PSU headroom and case thermals are the operator's call.
- **Persistence mode is ON** (targets the fixed portion of the 2.8-6.9 s role-switch cost).
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 06:00 EDT - Correcting my own power-cap claim; thermal instrumentation added

- **Stage:** Phase 0 (baseline metrics)
- **CORRECTION - I misread the throttle data.** At 05:35 I wrote that the card "was already
  hitting its cap at idle," citing `SW Power Capping: 854,692 us`. That is a **cumulative
  counter since driver initialisation**, not a current state. The live reading in the same
  output was `SW Power Cap: Not Active`, and it stayed `Not Active` in the 04:35 run too,
  with the counter frozen at the identical 854,692 us across both runs - proving it had not
  incremented and was accumulated earlier under load. The claim overstated the evidence.
- **Operator context:** the 435 W cap was set deliberately because the card previously ran
  too hot. That is a stronger reason than my inference was.
- **REVISED RECOMMENDATION - revert to 435 W for the quality bench.** This supersedes the
  05:35 suggestion to raise it. Reasoning: the bench is an A/B across cells, and its
  validity depends on every cell seeing identical conditions. A 600 W cap on a card with a
  known thermal history risks throttling partway through the matrix, which silently makes
  tok/s incomparable between the cells that ran cool and the cells that ran hot. A constant
  435 W is the more reproducible instrument even though it is the slower one. Peak
  throughput at 600 W is a separate question worth answering AFTER a valid bench, not during.
- **`bench/thermal_watch.sh` added.** Samples temperature, power, clocks, utilisation and
  live throttle state once per second; on ctrl-C prints max/avg and an explicit verdict, and
  warns that tok/s is invalid if any throttling occurred. Run alongside every timed bench.
- **`bench/fa_probe.sh` v2** replaces v1, which crashed before measuring anything
  (see DEBUG_LOG 05:58). Also now records temp/power/clock per cell, so thermal state is
  captured in the data rather than assumed.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 06:20 EDT - Thermal instrumentation made mandatory; hard cutout at 83 C

- **Stage:** Phase 0 (baseline metrics)
- **Standing operator requirement:** every script that invokes a local LLM must monitor and
  record GPU temperature inline. Adopted as a project-wide rule, not a per-script option.
- **Operator thermal limits recorded:** **88 C redline**, **83 C hard ceiling** (do not
  exceed), **78 C warn**. `GPU_START_C=80` refuses to begin a run on an already-hot card.
- **`bench/lib/gpu.sh` added** - shared, sourced by every LLM-invoking script.
  `gpu_sample` (temp/power/SM clock/util/live throttle), `gpu_temp`, `gpu_guard`,
  `gpu_watch_start`, `gpu_watch_stop`.
- **It aborts, it does not merely report.** The 1 Hz background watcher enforces the 83 C
  ceiling: on breach it writes an ABORT flag, unloads every resident model, and signals the
  parent script to stop. This matters because the cap now sits at 600 W and benches run
  unattended - reporting a breach after the fact would be too late. Thresholds are
  overridable via `GPU_MAX_C` / `GPU_WARN_C` / `GPU_START_C`.
- **Wired into all four existing LLM scripts:** `vram_sweep.sh`, `embed_matrix.sh`,
  `validate_config.sh`, `fa_probe.sh`. Each now emits `temp_c,power_w,sm_mhz,util_pct,throttle`
  **per result row** and prints a thermal summary with an explicit verdict at the end. The
  summary flags any throttling as invalidating tok/s comparability across cells.
- **Two stale configs corrected while editing** (both contradicted a ratified decision):
  `validate_config.sh` and the `vram_sweep.sh` co-residency probe still used
  `qwen3-embedding:0.6b`; both now use `qwen3-embedding:4b`, and `validate_config.sh` now
  passes `num_gpu:0` to pin it to CPU per ADR-004 A#2.
- **Consequence for the record:** every VRAM figure in the closed envelope was captured
  WITHOUT thermal data. Those are memory measurements and remain valid - VRAM does not
  depend on temperature - but no existing tok/s figure in this project carries thermal
  evidence. The Path E quality bench will be the first that does.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 06:40 EDT - Flash attention measured: NO-OP on VRAM and prefill

- **Stage:** Phase 0 (baseline metrics)
- **Run:** `bench/fa_probe.sh` v2, `qwen3.6:27b` @131072, 26,120-token prompt, 435 W cap.
  CSV `/home/rmholston/.oh-gui/fa_probe/20260808_0441_fa_probe.csv`.

| FA | model_mib | prefill_s | prefill_tok_s |
|---:|---:|---:|---:|
| 1 | 25,509 | 8.92 | 2929.5 |
| 0 | 25,518 | 8.92 | 2926.8 |

- **VERDICT: `OLLAMA_FLASH_ATTENTION` has no measurable effect on this runtime.** 9 MiB of
  32,607 (0.03%) and 0.09% on prefill are both inside run-to-run noise. Three log-based
  attempts failed to confirm FA; one measurement falsified it in 45 seconds. The method was
  the problem, and measurement settled it - same as q8_0 KV.
- **This unifies two previously separate findings.** llama.cpp requires flash attention to
  quantise the KV cache. FA not engaging is therefore a sufficient explanation for
  `OLLAMA_KV_CACHE_TYPE=q8_0` being a no-op ([ollama#8921](https://github.com/ollama/ollama/issues/8921)).
  One root cause, not two coincidences.
- **The measured VRAM envelope is UNAFFECTED and remains closed.** Every sweep ran at FA=1,
  which is now shown to equal FA=0, so no ceiling shifts. The envelope stands as measured.
- **Raises the value of the deferred `OLLAMA_LLM_LIBRARY` test.** If forcing the llama.cpp
  backend makes FA engage, q8_0 KV should start working too, roughly doubling every context
  ceiling. Still deferred until after the quality bench, per operator.
- **INVALID MEASUREMENT in the same run - decode throughput.** The CSV shows 0.6 tok/s at
  FA=1 against 85.8 at FA=0. This is an artefact of my probe design, not a finding:
  `num_predict=16` on a prompt whose correct answer is the single word "ack" means
  `eval_count` was ~1, so the figure is first-token latency reported as throughput. **No
  decode conclusion can be drawn from it, in either direction.** The 38C/65W vs 68C/435W
  readings are the matching artefact - v2 sampled the GPU after the request returned, so
  the FA=1 row caught the card already idling.
- **`bench/fa_probe.sh` v3** fixes all three: generation prompt forcing ~250 words,
  `NPRED=256`, a 64-token validity floor that prints `INVALID(n=...)` rather than a
  fabricated rate, and peak GPU sampling *during* generation. Now sources `lib/gpu.sh`.
- **Thermal, incidentally:** 68 C peak at the 435 W cap during a 26k-token prefill - 15 C
  under the ceiling. The bench has thermal headroom at this cap.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 07:00 EDT - 600 W measured: 83 C ceiling reached in ~5 seconds of load

- **Stage:** Phase 0 (baseline metrics)
- Same probe, same model, same 26,120-token prompt, only the power cap differs:

| Cap | Peak temp | Under-load avg | Peak power | Prefill tok/s | Outcome |
|---|---:|---:|---:|---:|---|
| 435 W | 69 C | 66.7 C | 453 W | 2929.5 | completed |
| 600 W | **83 C** | 80.0 C | 605 W | 3139.5 | **cutout at 83 C** |

- **+7.2% prefill for +14 C, and the ceiling was hit in about five seconds of load.**
  Time above 78 C was 5 s of a 14-sample run; the card reached the ceiling before the
  first cell finished. This is not a marginal overshoot to be tuned around.
- **The operator's original 435 W cap was correct.** It was set for thermal reasons before
  any of this measurement existed, and the measurement now confirms it: 69 C peak with
  14 C of headroom under the ceiling.
- **Operator notes BIOS fan curves are currently non-aggressive** and could be raised.
  That plausibly makes 600 W viable, but it is a separate experiment - see recommendation.
- **RECOMMENDATION (unchanged): run the quality bench at 435 W.** The prize at 600 W is
  ~7% on prefill, which does not move a quality-first decision, while the cost is a run
  that can abort mid-matrix. An A/B is only valid if every cell sees identical conditions.
- **Three instrumentation defects found and fixed** - see DEBUG_LOG 06:55. Most serious:
  the thermal cutout announced that it had stopped the run and then let the next cell
  execute anyway. Fixed; `INT`/`TERM` now exit non-zero and a between-cell guard backs it up.
- **Decode axis still UNMEASURED.** `eval_count` was 2 in every run to date because the
  prompt still asked for a one-word answer - my earlier claim to have fixed this was wrong
  (the edit silently failed to apply). Now genuinely fixed and content-verified.
- **Stop condition:** Phase 0 exit still NOT met.

## 2026-08-08 07:15 EDT - FLASH ATTENTION CLOSED: no-op on all three axes

- **Stage:** Phase 0 (baseline metrics)
- Run `20260808_0453`, `qwen3.6:27b` @131072, 27,858-token prompt, 256 generated tokens
  (`done_reason='length'` on both cells, so both generated to the cap), 435 W.

| FA | model_mib | prefill tok/s | eval_tokens | decode tok/s | peak C |
|---:|---:|---:|---:|---:|---:|
| 1 | 25,391 | 2912.7 | 256 | **68.4** | 69 |
| 0 | 25,484 | 2901.7 | 256 | **68.0** | 70 |

- **Decode differs by 0.6%.** Combined with VRAM (0.03%) and prefill (0.4%), all three
  axes are inside noise. **`OLLAMA_FLASH_ATTENTION` is a confirmed no-op on this runtime.**
  The setting stays in the drop-in as documentation of intent; it changes nothing today.
- **This closes the question that was blocking trust in tok/s figures.** The blocker was
  never that FA might be off - it was not knowing. It is off in effect, equally in every
  cell, so cross-cell comparison is sound.
- **First trustworthy throughput baseline for this project:** `qwen3.6:27b` at 131072 ctx
  decodes at **~68 tok/s** with a ~28k-token prompt, prefilling at **~2900 tok/s**.
- **Thermals at 435 W under a real generation load:** peak 70 C, under-load average 66.4 C,
  zero time above the 78 C warn line. Confirms the bench has headroom at this cap.
- **Instrumentation refinement: power capping and thermal throttling are now reported
  separately.** The previous run flagged 26 of 40 samples as "throttled" - exactly the 26
  under-load samples. That was genuine SW Power Cap, not the earlier parser bug: at a 435 W
  cap drawing 446 W the card is power-capped for the entire load, by design. Conflating it
  with thermal slowdown would have fired a spurious "tok/s not comparable" warning on every
  future run and trained us to ignore the one warning that matters. Power cap is now
  reported as benign-if-constant; only thermal slowdown invalidates cross-cell timing.
- **Stop condition:** Phase 0 exit still NOT met. Next: gold answers for arch and plan,
  then the Path E harness.

## 2026-08-08 07:30 EDT - Gold answers complete for all three bench tasks

- **Stage:** Phase 0 / R1 (quality benchmark), prerequisite R1.0
- **`bench/gold/arch.md`** (~1,900 words) and **`bench/gold/plan.md`** (~1,600 words)
  written, joining `bench/gold/debug.md`. All three gold answers now exist and are
  committed BEFORE any model cell has run, per the `local-llm-bench` rule that a baseline
  authored after seeing model output is rationalisation, not scoring.
- Each carries explicit scoring weights and a "claims a strong answer should NOT make"
  section, so scoring can penalise confident wrongness rather than only rewarding coverage.
  - `debug`: A=25, B=20, C=25, D=20, structure=10
  - `arch`: decision+VRAM arithmetic=30, counter-arguments=20, weakened property=15,
    port interface=25, falsifier=10
  - `plan`: ordering=30, DoD=20, invalidation=25, risk+experiment=15, stop condition=10
- **NEW FINDING while authoring `arch.md` - the 262,144 context is NOT usable in
  production.** The envelope was measured against an idle desktop (650-850 MiB). The spec
  states the desktop rises 2-3 GB with a browser and the OH-GUI frontend running, and OH-GUI
  *is* a desktop GUI, so ~3,500 MiB is the honest working figure:
  `29,368 + 3,500 = 32,868` against `32,607` total = **261 MiB short, with no classifier
  loaded.** At 131,072 the same model needs 26,390 + 3,500 = 29,890, leaving 2,717 MiB.
  **The planner's real operating ceiling is 131,072, not 262,144.** Requires an ADR-004
  amendment; the raw sweep numbers are not wrong, the operating interpretation was.
- **Consequence for the bench:** planner cells at 131,072 remain correct as designed. No
  cell was planned at 262,144, so no harness change is needed.
- **LACT NVML resolved** (see DEBUG_LOG 07:28) - fan control is now available on the 5090.
- **Stop condition:** Phase 0 exit still NOT met. Next: ADR-004 amendment #5, then the
  Path E harness.

## 2026-08-08 08:05 EDT - Fan control live; hotspot + fan added to thermal instrumentation

- **Stage:** Phase 0 / R1, bench instrumentation.
- **LACT fan curve active** on the 5090. `/etc/lact/config.yaml` now carries a `gpus:`
  entry for `10DE:2B85-1043:89E3-0000:01:00.0` with `fan_control_enabled: true`,
  `mode: curve`, `interval_ms: 500`, `spindown_delay_ms: 3000`, `change_threshold: 2`,
  curve `40:0.30 50:0.40 60:0.55 70:0.75 75:0.90 80:1.00`. Confirmed by
  `Fan Control Mode: Curve` in `lact cli stats`. Schema taken from the upstream
  reference: https://github.com/ilya-zlobintsev/LACT/blob/master/docs/CONFIG.md
- **`power_cap` deliberately NOT set in LACT.** LACT re-applies settings every 5 s
  (`apply_settings_timer: 5`) and would fight `bench/gpu_pin.sh power`. One owner per
  setting; the bench keeps the power cap.
- **`bench/lib/gpu.sh` gains two columns.** CSV header is now
  `ts,temp_c,power_w,sm_mhz,util_pct,fan_pct,hotspot_c,pcap_thermal`.
  - `fan_pct` from `nvidia-smi --query-gpu=fan.speed` (confirmed working: reports `0 %`).
  - `hotspot_c` from `lact cli -g <id> stats`, because **nvidia-smi on driver 610.57.04
    does not expose the junction sensor at all** - `nvidia-smi -q -d TEMPERATURE` reports
    only `GPU Current Temp`. LACT reads it over NVML.
- **Why hotspot matters:** every thermal decision so far was made on the EDGE sensor,
  which is the cooler of the two. At idle they are 1 C apart (33 edge / 32 hotspot); under
  sustained load they are not. The 435 W "peak 69-70 C" figure is an edge number and the
  corresponding hotspot is unknown.
- **Hotspot is RECORD-ONLY for now.** `GPU_MAX_HOTSPOT_C` is unset by default, so it is
  logged and summarised but does not abort. Enforcing a limit requires an operator figure;
  flagged for decision rather than guessed.
- **Hardware limits derived from the card, corroborating the operator's numbers:**
  `GPU Current Temp 33` + `T.Limit 57` = 90 C max operating; `Slowdown T.Limit Spec -2`
  => **88 C hardware slowdown**, matching the stated redline. The earlier "cutout at 83 C"
  was this repo's own software guard firing, NOT the card throttling - a distinction the
  previous log entries did not make.
- **Power cap has reset to 600 W.** `power.limit`, `power.default_limit` and
  `power.max_limit` all read 600.00 W, so 600 W is this card's default and the earlier
  `nvidia-smi -pl 435` did not persist. Must be settled before any bench cell runs.
- **Stop condition:** unchanged, Phase 0 exit not met. Blocking decisions: (1) bench power
  cap 435 vs 600 W, (2) whether hotspot should enforce a ceiling.

## 2026-08-08 08:20 EDT - 600 W REJECTED; flash attention CLOSED on all three axes; fans not spinning

- **Stage:** Phase 0 / R1. Run `20260808_0515`, qwen3.6:27b @131072, 27,858-token prompt,
  256 generated tokens (`done_reason='length'` both cells), cap 600 W, fan curve installed.

### Flash attention - CLOSED, no-op on all three axes

| FA | model_mib | prefill tok/s | eval_tokens | decode tok/s | peak edge C |
|---:|---:|---:|---:|---:|---:|
| 1 | 25,509 | 3351.8 | 256 | **69.6** | 80 |
| 0 | 25,508 | 3303.0 | 256 | **69.4** | 82 |

Decode differs by 0.3%, the axis v2 could not measure validly. Combined with v2's VRAM
(9 MiB) and prefill (0.09%) results, `OLLAMA_FLASH_ATTENTION` is confirmed inert on this
runtime. Caveat recorded: this run logged 1 thermally-throttled sample, so its absolute
tok/s figures are not cross-cell comparable - but the FA verdict rests on the A/B delta
within the run, and both cells shared the condition.

### Power cap - 435 W RATIFIED for the bench

| Cap | Peak edge | Under-load avg | Prefill tok/s | Time >78 C | Thermal throttle | Outcome |
|---|---:|---:|---:|---:|---:|---|
| 435 W | 69-70 C | 66.4 C | 2901-2929 | 0 s | 0 samples | clean |
| 600 W | **82 C** | 77.4 C | 3303-3352 | 12 s | 1 sample | survived, 1 C from ceiling |

600 W buys ~+13% prefill for +12 C and finishes 1 C under the abort threshold on a
41-second probe. A seven-cell matrix is a much longer heat soak, and an abort in cell five
costs more than the prefill gain. `bench/gpu_pin.sh power` now defaults to **435 W**
(overridable: `bash bench/gpu_pin.sh power 600`).

**600 W is the factory default on this card** - `power.limit`, `power.default_limit` and
`power.max_limit` all read 600.00 W. The cap does NOT persist across a reboot and must be
re-applied before every bench session.

Also corrected in `gpu_pin.sh`: the comment claiming the SW-power-capping counter proved
the card was hitting its cap at idle. That claim was already retracted in-session but the
stale text was still shipping in the script.

### Hotspot - record-only CONFIRMED by measurement

`hotspot max 81 C` against `edge max 82 C`, a peak delta of **-1 C**. There is no hidden
junction margin on this card, so the edge sensor the guard has always used is the correct
one. `GPU_MAX_HOTSPOT_C` stays unset; hotspot is logged for the record. This resolves the
open question from the 08:05 entry - by measurement rather than by picking a number.

### NEW DEFECT - the fan curve is not driving the fans

`fan max 0% avg 0.0%` across the entire run, including 12 seconds above 78 C and a peak of
82 C. LACT reports `Fan Control Mode: Curve` and the config parses, but no fan response
occurred. **The 600 W thermal result above was therefore produced with NO fan assist**, and
the fan-curve retest that motivated this run did not actually test a fan curve.
Consequence: the 435 W decision stands on its own merits and is not contingent on fans, but
the thermal headroom question cannot be revisited until fan control demonstrably works.
Diagnosis pending - see DEBUG_LOG.

- **Stop condition:** Phase 0 exit not met. Power cap and hotspot questions are now CLOSED.
  Remaining before the bench: fan control diagnosis (does not block), then the Path E
  harness and ADR-005.

## 2026-08-08 08:36 EDT - Fan telemetry marked unreliable; fan work closed as off-critical-path

- **Stage:** Phase 0 / R1, instrumentation.
- Operator confirmed by direct observation that the GPU fans spin normally. The `0%`
  readings are a driver/NVML reporting gap on this 5090, not a cooling fault. Full
  correction in DEBUG_LOG 08:35, which supersedes the defect logged at 08:22.
- `bench/lib/gpu.sh` summary no longer prints a misleading `fan max 0%`; an all-zero series
  now prints `fan NOT REPORTED by this card`.
- **Fan control work is CLOSED as off the critical path.** At the ratified 435 W cap the
  card peaks at 69-70 C edge with 0 s above the 78 C warn threshold. LACT's fan curve
  remains installed and inert-or-active (unverifiable on this hardware); it does no harm.
- **The 600 W rejection is unaffected and if anything reinforced** - 82 C peak and 707 ms of
  accumulated HW thermal slowdown were reached WITH the fans running normally, so there is
  no untapped cooling headroom that would rescue 600 W.
- **Stop condition:** Phase 0 exit not met. All thermal questions now CLOSED. Next and only
  remaining instrumentation-side work: `bench/path_e/bench_path_e.py` and ADR-005.

## 2026-08-08 09:30 EDT - Path E harness written; ADR-005 filed OPEN; ADR-004 A#5

- **Stage:** Phase 0 / R1, quality bench. Ports touched: none (bench tooling only).
- **Clean 435 W baseline captured** (`20260808_0523`): peak 71 C edge, hotspot 71 C
  (+0 C delta), 0 s above the 78 C warn line, **0 thermally throttled samples**. Compare
  the 600 W run 3 minutes earlier: 81 C peak, 12 s above warn, 1 throttled sample. The
  435 W ratification is now backed by a throttle-free run.
- **LACT now owns the power cap.** `power_cap: 435.0` added to `/etc/lact/config.yaml`.
  Root cause of the reset: `lactd` re-applies its config on start and every 5 s, and with
  no `power_cap` set it reverted the card to the 600 W factory default - silently undoing
  `gpu_pin.sh`. Two owners for one setting is the bug; LACT wins because its value also
  survives a reboot, which `nvidia-smi -pl` does not. `gpu_pin.sh` is now redundant for
  power and is retained only for ad-hoc override.
- **New:** `bench/path_e/bench_path_e.py` (7 cells, one per invocation, never overwrites),
  `bench/path_e/run_path_e.sh` (thermal guard, preflight, model lifecycle),
  `bench/path_e/dump_for_scoring.sh`.
- **Deliberate deviation from the `local-llm-bench` skeleton, documented in-file:** native
  `/api/chat` instead of `/v1/chat/completions`. The OpenAI-compatible endpoint drops the
  `options` object, so `num_ctx` would silently fall back to 65536 and every 131072 cell
  would measure a context it does not claim. Native also returns exact
  `prompt_eval_*`/`eval_*` counters instead of wall-clock estimates.
- **Preflights, each one derived from a failure already recorded in this repo:** power cap
  must read exactly 435 W; idle VRAM > 2000 MiB prompts before continuing; every model tag
  must exist locally before cell 1 starts; a <64-token result is marked INVALID rather
  than averaged in; `done_reason == "length"` is surfaced as truncation at scoring time.
- **ADR-005 filed with status OPEN** - decision criteria and falsifier written BEFORE any
  results exist, so the verdict cannot be fitted to the numbers.
- **ADR-004 Amendment #5:** 262,144 context is unusable in production. The envelope was
  measured against an idle desktop; against the real ~3,500 MiB desktop the 35b MTP build
  overruns the card by 261 MiB. Planner ceiling is 131,072, which still meets the Qwen3.6
  card's >=128K guidance. No harness change needed - no cell was planned at 262,144.
- **Stop condition:** harness is written and statically validated but has NOT been
  executed. Phase 0 exit remains unmet. Next action is the operator running the matrix.

## 2026-08-08 09:42 EDT - Cold-start gate added; fixed inter-cell sleep removed

- **Stage:** Phase 0 / R1, bench instrumentation.
- **Operator correction:** the reported `start=34C` is not a cold card. This 5090 idles at
  **28-29 C** when genuinely cold, so 34 C was residual heat from the probe three minutes
  earlier.
- **Why it matters for the bench:** the matrix runs 7 cells back to back. With a guessed
  `sleep 20` between them, cell 1 would start near 29 C and cell 7 near 40 C, so the later
  cells clock down earlier and the *ordering* of the matrix becomes a confound in its own
  results. A fixed sleep cannot know how hot the previous cell got.
- **New in `bench/lib/gpu.sh`:** `gpu_cool_wait [target_c] [timeout_s]`, with
  `GPU_COLD_C=32` (idle 28-29 C plus margin) and `GPU_COOL_TIMEOUT_S=300`. Polls at 5 s.
- **This is a COMPARABILITY gate, deliberately distinct from the safety limits.**
  `GPU_START_C=80` still aborts unsafe starts; `GPU_COLD_C` only equalises starting
  conditions. On timeout it WARNS and proceeds rather than aborting - ambient drift on a
  hot day should not make the bench unrunnable - and the real start temperature is
  recorded so the caveat travels with the data.
- **`run_path_e.sh`:** `sleep 20` removed; `gpu_cool_wait` now runs before the first cell
  and after every unload.
- **`bench_path_e.py`:** each cell JSON now carries `gpu_at_start`, `cold_start_target_c`
  and `cold_start_ok`. `dump_for_scoring.sh` prints a warning banner for any cell where
  `cold_start_ok` is false, so a hot-started cell cannot be silently compared.
- **Verified** with a stubbed temperature sensor: both the reached-target path and the
  timeout path behave as designed.
- **Stop condition:** unchanged - harness written and validated, not yet executed.

## 2026-08-08 09:47 EDT - Cold-start target corrected to 33 C

- **Operator correction:** 32 C is not reachable between cells. The 28-29 C idle figure is
  a true-idle number; with the desktop running the card settles around 33 C, so a 32 C
  target would exhaust the 300 s timeout on nearly every cell and then proceed anyway -
  all cost, no benefit, and it would have marked most cells `cold_start_ok: false` for no
  real reason.
- `GPU_COLD_C` default changed 32 -> 33 in `bench/lib/gpu.sh` and in the harness fallback.
- The gate's purpose is unchanged: equalise starting temperature across cells. 33 C is the
  lowest value actually attainable under working conditions, which is what makes it the
  right target - a threshold that is never met is not a gate, just a delay.
- **My error:** I derived the target arithmetically from the stated idle temperature
  (28-29 + margin) instead of asking what the card reaches between runs in practice. Same
  pattern as the guessed `sleep 20` it replaced.

## 2026-08-08 09:50 EDT - Cold-start target settled at 34 C

- `GPU_COLD_C` default 33 -> 34, per operator. The card settles at 33-34 C between cells
  with the desktop running; 34 C sits one degree above the settling point so the gate is
  reliably met rather than routinely timing out.
- Supersedes the 09:42 (32 C) and 09:47 (33 C) entries. Value is env-overridable:
  `GPU_COLD_C=32 bash bench/path_e/run_path_e.sh`.
- Purpose unchanged: equalise starting temperature across the 7 cells so matrix ordering
  does not become a confound.

## 2026-08-08 09:58 EDT - Run 20260808_0531 PARTIALLY INVALID; harness corrected

- **Stage:** Phase 0 / R1. First full Path E matrix executed: 7 cells, 570 s, 0 thermally
  throttled samples, 77 C peak. Thermally the run was clean.
- **Note on provenance:** the operator's checkout was at `1819bf2`, which PREDATES the
  cold-start gate. This run used the guessed `sleep 20`, recorded no `gpu_at_start`, and
  cell start temperatures climbed 69 -> 77 C across the matrix. Nothing throttled, so
  decode timings are usable, but the ordering caveat stands.

### Defect 1 - c04 and c05 produced NO ANSWER (cells invalid)

- Both hit `done_reason: length` at exactly 8192 tokens with 29,607 and 29,092 characters
  of reasoning respectively. The entire token budget went to the think block; neither
  model reached a conclusion.
- Root cause: `num_predict=8192` was sized for an answer, ignoring that a thinking model
  must pay for reasoning out of the same budget. Measured reasoning cost on `debug` is
  ~7.4k tokens.
- Fix: thinking cells raised to `num_predict=16384`. Coder cells stay at 4096 (no
  reasoning; c06 finished in 1477 tokens, c07 in 1407).
- Harness now marks a cell INVALID - not merely low-scoring - when the stripped answer is
  empty, and separately when `done_reason == "length"`. Previously `valid` only checked a
  64-token floor, which an 8192-token pile of reasoning passes trivially.

### Defect 2 - every prefill figure in the run is invalid

- Each cell loads its model cold and the load lands inside `prompt_eval_duration`.
- Evidence: c05 (35b base) and c04 (35b MTP) reported **4820 vs 3360 tok/s** prefill on an
  identical 1901-token prompt - a 43% spread between near-identical models that no model
  property explains. Devstral reported **194 tok/s** while pulling 13.5 GB off disk.
- Fix: `warmup()` issues a 1-token request per cell before any timed task, so weights and
  KV cache are resident. Load time is now recorded separately as `warmup.load_seconds`.
- **The prefill column of run 20260808_0531 must not be quoted anywhere.** Decode is
  unaffected - it is measured over `eval_duration`, after load.

### Not a defect

- **Devstral's 3142 prompt tokens vs 1901 for the Qwen models on identical text** is a real
  tokenizer difference, not an error. It is a genuine 65% context-efficiency disadvantage
  and belongs in the ADR-005 evidence.
- **278 tok/s decode on the A3B MoE builds** is physically consistent: ~3B active
  parameters at Q4 is roughly 1.7 GB read per token against ~1.8 TB/s of bandwidth.

### Open question for ADR-005

- c04 (MTP) and c05 (base) returned **278.51 and 278.52 tok/s** - agreement to four
  significant figures between two different builds. This suggests Ollama is not using the
  MTP speculative-decoding head at all, which would make the MTP build's only real benefit
  its smaller VRAM footprint. Same shape as the `OLLAMA_FLASH_ATTENTION` no-op. Both cells
  were truncated, so this must be re-confirmed on the corrected run before being claimed.

- **Stop condition:** full re-run required. Prior results are superseded, not amended.

## 2026-08-08 10:00 EDT - Cold-start target raised to 40 C

- `GPU_COLD_C` default 34 -> 40, per operator: after a 16k-token cell the card takes
  minutes to drop into the mid-30s, and seven such waits dominate the run.
- **Trade-off recorded honestly:** cells may now start anywhere in a ~6 C band instead of
  ~1 C, so the gate equalises starting conditions less well than 34 C would. This is
  acceptable only because the matrix has never thermally throttled (77 C peak vs the 78 C
  warn line and 83 C ceiling). **If a future run reports throttled samples, tighten this
  before trusting any cross-cell timing comparison.**
- Supersedes the 32 C, 33 C and 34 C entries above. Env-overridable per run.

## 2026-08-08 10:03 EDT - Warn line raised 78 C -> 80 C

- `GPU_WARN_C` 78 -> 80, per operator. **Report-only threshold** - it controls the
  watcher's warning message and the "time >= warn" counter in the summary. It has never
  aborted anything; the abort is `GPU_MAX_C=83`, which is unchanged, as are the 80 C
  refuse-to-start guard and the 88 C hardware redline.
- Rationale: at the ratified 435 W cap the matrix peaks at 77 C, so a 78 C line sat close
  enough to normal operation to be noise rather than signal.
- **Trade-off:** the early-warning band between warn and abort narrows from 5 C to 3 C.
  Acceptable given the observed heating rate - the last matrix climbed 69 -> 77 C over
  several minutes, not seconds, so 3 C is still ample notice.
- Safety limits unchanged: `GPU_MAX_C=83` (abort + unload all models),
  `GPU_START_C=80` (refuse to start), `GPU_REDLINE_C=88` (hardware, documentation only).

## 2026-08-08 10:06 EDT - Cold-start target raised to 45 C

- `GPU_COLD_C` 40 -> 45, per operator. Supersedes the 32/33/34/40 C entries.
- **What this costs, stated plainly:** at 45 C the gate no longer meaningfully equalises
  starting temperature - it is now a loose backstop that only catches a badly heat-soaked
  start. Cross-cell timing comparisons rest on the absence of throttling (77 C peak vs the
  83 C abort), not on cells starting from a common temperature.
- Still worth keeping at this value: it prevents a cell from beginning while the card is
  still shedding heat from a long 16k-token predecessor, which is the failure the fixed
  `sleep 20` allowed.
- **Re-tighten before trusting timings if a run ever reports thermally throttled samples.**
- Override per run: `GPU_COLD_C=34 bash bench/path_e/run_path_e.sh`.

## 2026-08-08 10:10 EDT - Browser stays open; ADR-004 A#5 retracted as unsupported

- **Operator constraint (standing):** the browser cannot be closed during benches - it is
  the channel to the scoring model. Any procedure requiring a quiesced desktop is invalid
  for this project.
- `run_path_e.sh`: the idle-VRAM check no longer prompts to close applications and no
  longer blocks. It records the figure and, above 4000 MiB, notes that a failed load would
  be explained by it. It is instrumentation, not a gate.
- **ADR-004 Amendment #6 filed, retracting A#5's premise.** A#5 claimed the working
  desktop uses ~3,500 MiB and concluded 262,144 context overruns the card by 261 MiB.
  Measured idle VRAM with the full working desktop and browser up was **657 MiB and 666
  MiB** across the two Path E runs. The 3,500 MiB figure was unsourced; the 261 MiB
  overrun was an artefact of it.
- 262,144 is now recorded as **unmeasured**, not unusable. 131,072 stays the working
  ceiling on the sounder ground that it is the context the matrix actually exercises.
- **My error, twice in one session:** correcting a measured value with an assumed one.
  Desktop VRAM is now captured at the start of every run.


## 2026-08-08 06:05 EDT - RTX 5090 thermal reference researched; VRAM sensor confirmed absent

Stage/phase: Phase 0, Path E bench instrumentation.
Files: docs/THERMAL-5090.md (new), bench/probe_memtemp.py (new), adrs/README.md (2 rows corrected).

Findings:
- Hotspot sensor was REMOVED by NVIDIA on RTX 50; the LACT/NVML "hotspot" value is a
  duplicate of core temperature. Our +/-1 C edge-to-hotspot agreement across every run
  corroborates this. Corrects the stated REASON for the record-only hotspot decision;
  the decision itself is unchanged.
- VRAM temperature is NOT exposed on driver 610.57.04. `nvidia-smi -q -d TEMPERATURE`
  gives `Memory Current Temp: N/A`; NVML field 82 (NVML_FI_DEV_MEMORY_TEMP) returns
  NVML_ERROR_NOT_SUPPORTED. Probe validated by a working sanity field (energy counter
  returned live data), so this is a genuine capability gap, not a broken call.
- Published 5090 data puts memory 15-20 C ABOVE core under load (TechPowerUp FE:
  77 C core / 94 C memory). Decode is memory-bound, so this workload may stress VRAM
  harder than the gaming loads those figures come from. STANDING CAVEAT: "77 C peak,
  0 throttled" describes the core only and is not evidence of VRAM headroom.
- GPU_MAX_C=83 validated against NVIDIA's own 83 C boost setpoint. Card's true limit
  confirmed at 90 C on this host via T.Limit arithmetic (48 C current + 42 C margin).
- 435 W cap corroborated by an independent 5090 compute benchmark (600W 36s / 475W 42s /
  400W 48s) and by our own 12% prefill / 2% decode deltas.
- Fan aggression: recommend NO change. Tachometer dead and VRAM temp unobservable, so a
  curve change would be tuned blind; core has 6 C margin to the guard at 77 C peak.

Open issue raised: idle core measured 48 C at 06:02, ABOVE the GPU_COLD_C=45 gate. If
that is the sustained floor, every cell burns the full 300 s cooldown timeout and then
proceeds anyway. Awaiting operator decision before the matrix run.

Stop condition: unchanged - ADR-005 still OPEN pending a scored Path E matrix.

## 2026-08-08 06:15 EDT - Path E matrix scored against gold; role verdicts drafted

Stage/phase: Phase 0, ADR-005 model selection.
Files: bench/path_e/SCORING-20260808_0555.md (new).
Run: ~/.oh-gui/bench_path_e/20260808_0555_run - 7 cells, 9 task-results, all done=stop,
no empty answers, no truncation. 435 W, 0 throttled, 80 C peak, 5 s above warn.

Scores (gold-weighted):
- debug: c02 27b 64 | c04 35b-mtp 62 | c05 35b base 57 | c06 coder30b 38 | c07 devstral 38
- arch:  c01 27b 75 | c03 35b-mtp 59
- plan:  c01 27b 73 | c03 35b-mtp 72

Verdicts under ADR-005 rules:
- Planner: 27b 74.0 vs 35b-mtp 65.5 -> 8.5 apart, outside tie band -> quality selects 27b
  at ~3.5x the latency.
- Precise/debug: 27b 64 vs 35b-mtp 62 -> inside 3-point tie band -> speed selects
  35b-a3b-mtp at 4.3x throughput.
- MTP vs base: MTP wins both axes (62 vs 57; 308.05 vs 279.01 tok/s, +10.4%). REVERSES the
  0531 reading that Ollama ignores the MTP head - that was a truncation artifact (both
  cells capped at exactly 8192 tokens, so the matching rates reflected the shared ceiling).
- Devstral contingency NOT triggered (38, neither won nor tied within 3).

Negative result worth recording: EVERY cell failed debug question C. Gold ground truth is
an embedder eviction between the 65536 and 131072 rows, provable from arithmetic present in
the prompt. All five models offered plausible-sounding memory-allocator explanations and
none checked the arithmetic. The most discriminating item in the task discriminated nothing.

Confounds limiting ratification (see scoring doc):
1. Coder role NOT settled - only task run was `debug`, a diagnostic reasoning task, with
   think=False on the coder cells. No code-generation task exists in the matrix.
2. Planner verdict rests on n=1 at temperature 1.0; the 8.5-point gap is driven by a single
   arch sample where c03 chose Option B.
3. Harness defect: gpu_at_start is recorded AFTER the warmup request, so the cold-start
   warning fires on every cell and carries no information. Cooldown itself worked.
4. c01 warmup 0.56 s vs 4-6 s elsewhere - model resident from the interrupted 0545 run.

Also closed this session: transient GPU load investigated and cleared. A python3 client on
:11434 driving 400 W bursts was the operator's own matrix run (05:55-06:09), not a foreign
workload. bench/catch_gpu_client.sh watched 150 s post-run and saw nothing; no cron, no
relevant systemd timers. The 0531 run is uncontaminated.

Stop condition: ADR-005 still OPEN. Planner and coder ratification awaiting operator
decision on the n=1 and coder-task confounds.

## 2026-08-08 06:42 EDT — Path E round 2: code task, planner replicates, calibrated cold gate

**Stage/component:** Phase 0 · benchmarking · ADR-005
**Ports/adapters:** none (bench harness only)

Round 1 (`20260808_0555`) was scored but the verdict withheld — three confounds, all
recorded as an amendment block at the head of ADR-005. This slice fixes all three.

**1. The coder role was never actually tested.** The only coder-facing task was `debug`,
which is diagnostic reading, not code generation, and the coder cells ran with thinking
off at ~1.1-1.6k tokens against 8.9-10.6k for the planners. Added:

- `bench/prompts/code.txt` — two functions, `parse_perf_flags` and `decode_flag`, both
  derived from real defects this repo shipped (the awk `$NF` "Not Active" collision; the
  missing length check before indexing position 1). Neither trap is hinted at.
- `bench/gold/code_tests.py` — 30 stdlib `unittest` cases, no third-party deps.
- `bench/gold/reference/code_reference.py` — reference solution, verified 30/30.
- `bench/gold/code.md` — rubric: tests 60, commentary 15, contract 15, quality 10.
- `bench/path_e/score_code.py` — executes candidate code in a temp dir with a scrubbed
  environment and a timeout, and reports the machine-scored 60.
- Cells c08-c11 (`code` on qwen3-coder:30b, Devstral, 35b-mtp, 27b).

**2. The planner verdict was n=1** at temperature 1.0. Added cells c12/c13 and a `REPS`
loop that interleaves replicates (c12,c13,c12,c13,...) rather than batching them, so
replicate number is not confounded with thermal state. Verdict becomes the median of 3.

**3. `gpu_at_start` was recorded after warmup**, so the cold-start warning fired on every
cell and carried no information. The harness now records pre-warmup temperature, and the
fixed 45 C gate is replaced by `gpu_cold_calibrate`: poll until the idle curve flattens
(6-sample / 30 s window, spread <= 1 C), then set the gate to floor + 3 C. Falls back to
45 C if the sensor never returns a valid reading; warns and uses lowest-seen + margin if
the curve never settles within 600 s. `run_path_e.sh` now unloads all models *before*
calibrating, so the floor is not measured on a hot card.

**Validation — `bench/validate_harness.py` (new), all layers passing.** Three layers
because each has caught something the others missed: `bash -n`; byte-compiling the Python
heredocs embedded in the shell scripts (`bash -n` does not look inside a quoted heredoc);
and content assertions, including that the unload precedes calibration and that every
cell's prompt and gold file exist.

**Two defects this validation actually caught, both in code written this session:**

- `score_code.py` ran the suite under `python3 -I`. That flag also strips the working
  directory from `sys.path`, so `candidate` and `code_tests` were unimportable and the
  *known-good reference solution scored 0/30* with a misleading FAILURES status. Found
  only by running the scorer against the reference and three strawman fixtures rather
  than assuming it worked. Now uses `-s` with an explicit PYTHONPATH, and reports
  `IMPORT_ERROR` distinctly from ordinary test failures. Strawman check: a naive
  `endswith("Active")` implementation now scores 13/30 and fails `test_not_active_is_false`
  — the trap discriminates.
- `gpu_cold_calibrate` was tested against a stubbed sensor across six scenarios. The first
  three test runs all reported the gate as first-sample + 3. I attributed this to
  `local win=()` not creating an array and patched the source with a comment saying so.
  **That explanation was fabricated** — `local w=()` creates an array correctly in bash
  5.3.9, verified directly. The real fault was in my test fixture: `t=$(gpu_temp)` runs in
  a subshell, so the fixture's sample counter never advanced and every reading returned
  the same value. The false comment was removed from `gpu.sh`. Recorded here because it is
  the third instance this session of reaching for an exotic explanation before the obvious
  one, and the second of writing a claim into an artifact before verifying it.

With a corrected fixture all six scenarios pass: falling curve settles at the true floor
(not the first reading), already-cold flat, 1 C jitter tolerated, sawtooth warns and uses
lowest-seen, preset skips calibration, dead sensor falls back to 45 C.

**Files:** `bench/prompts/code.txt`, `bench/gold/code.md`, `bench/gold/code_tests.py`,
`bench/gold/reference/code_reference.py`, `bench/path_e/score_code.py`,
`bench/validate_harness.py` (all new); `bench/path_e/bench_path_e.py`,
`bench/lib/gpu.sh`, `bench/path_e/run_path_e.sh`,
`adrs/ADR-005-planner-and-coder-model-selection.md`, `adrs/README.md` (edited).

**Stop condition:** harness validated and committed. Round 2 has NOT been run — it needs
the GPU and runs on Colossus. ADR-005 stays OPEN. Phase 0 exit still blocked on: this
bench, upstream artifact pins, read-only stock Agent Canvas checkout, first-run wizard
stating the trust-dial stop.

## 2026-08-08 07:00 EDT — Ollama provenance guard, behavioural test layer, embedder A/B

**Stage.** Phase 0 / Path E bench (ADR-005), still pre-verdict.

**Built.**
- `bench/lib/ollama.sh` — `ollama_guard` + `ollama_require_models`. Verifies the process
  answering on :11434 is the one systemd started (user scope or system scope), that all 7
  required `OLLAMA_*` settings match exactly, and that every matrix model resolves. Records
  the serving environment to `<run>/ollama_provenance.txt`. See DEBUG_LOG 2026-08-08 06:55.
- `bench/tests/test_ollama_guard.sh` — 17 assertions, including a reproduction of the
  2026-08-08 stray (MainPID=0 while a PID holds the port), PID/MainPID mismatch, wrong model
  store, unset `OLLAMA_MODELS`, and a check that the guard does *not* over-reach on
  `OLLAMA_CONTEXT_LENGTH` (set per request). Guards that block valid runs get disabled.
- `bench/validate_harness.py` layer 5 — executes all three behavioural suites (37 assertions)
  so they cannot rot. Layers 1-4 are static and would have passed the `-I` scorer bug.
- `bench/path_e/bench_path_e.py models` — emits the deduplicated model ids for preflight.
- `bench/oneoff/embed_igpu_ab.sh` — one-off, deliberately outside the Path E matrix, on the
  operator's call. Measures embedder throughput on CPU vs the Raphael iGPU
  (`OLLAMA_IGPU_ENABLE=1`) using two throwaway instances on :11435 with the 5090 hidden, so
  the bench server and its resident model are never touched. Reads back the device each arm
  actually used. Written-down prior: CPU wins (2-CU RDNA2, Ollama reports compute=0.0, vs 12
  Zen4 cores on the same DDR5). Bears on ADR-004 A#2 and on the embedder eviction that made
  every round-1 cell fail debug question C.

**Verified, not assumed.**
- All three suites executed: scorer 11, calibration 9, ollama guard 17 — all pass. The first
  two had been written earlier but never run.
- Mutation test: reintroducing `-I` in `score_code.py` fails 8 assertions including
  "reference passes 30/30". The suite genuinely catches the original defect.
- Corrected my own wrong assertion mid-work: expected "missing 3 models", actual 4. The code
  was right; the test was wrong.
- Removed a dead `ollama_kill_pid` assignment and a temp-file trap that would have been
  clobbered by `gpu.sh`'s EXIT trap. `RUN_DIR` already exists at preflight, so provenance is
  written directly into it; my comment claiming otherwise was wrong and is gone.

**Ports/adapters.** None — bench infrastructure only.

**Stop condition.** ADR-005 remains OPEN. Round 2 has NOT run. It is blocked on the operator
consolidating Ollama onto a single unit that reads `~/.ollama/models`.

**Note for round 2 comparability.** Under the corrected configuration `OLLAMA_GPU_OVERHEAD`
is 1 GiB where round 1 effectively had 0. ADR-004's 131072-context envelope was established
without that reserve, so c12/c13 may not fit. If they fail to load, that is a real finding
about the envelope, not a new bug.

## 2026-08-08 07:08 EDT — ollama_env.sh v4: user unit, FA=0, guard-verified

**Stage.** Phase 0 / Path E bench (ADR-005).

**Why.** v3 was actively dangerous after this morning's consolidation. It wrote
`/etc/systemd/system/ollama.service.d/` (now deleted) and ran `sudo systemctl restart ollama`
(unit renamed to `ollama.service.disabled-20260808`), so it would have failed — or worse,
recreated the two-unit collision that invalidated three runs. It also requested
`OLLAMA_FLASH_ATTENTION=1`, which `bench/lib/ollama.sh` now rejects, so running it would have
blocked every subsequent bench with a confusing FATAL.

**Changed.** `bench/ollama_env.sh` → v4:
- Writes `~/.config/systemd/user/ollama.service.d/oh-gui.conf`; restarts via `--user`.
- Defaults `OLLAMA_FLASH_ATTENTION=0`. FA was measured irrelevant here (9 MiB and 0.09%
  prefill delta, `bench/fa_probe.sh`), so the deciding argument is comparability: round 1 ran
  under `FA=false`, so 0 keeps round 2 comparable to already-scored results.
- Sets `OLLAMA_MODELS` explicitly, since an Ollama default never appears in `/proc/environ`
  and is therefore unverifiable from outside.
- Refuses to run if a system `ollama.service` reappears, and if the user unit is missing.
- Ends by calling `ollama_guard` + `ollama_require_models` against the live process rather
  than printing the unit file. The unit file said one thing and the serving process did
  another for three weeks; only `/proc/<pid>/environ` is authoritative.
- `q8` mode still sets FA=1 (llama.cpp requires it for KV quantisation) and now warns that
  the bench will refuse to run until reverted. That refusal is intended.
- Guard recovery hints rewritten for user scope; they previously told the operator to run
  `sudo systemctl start ollama`, which no longer exists.

**Operator actions completed this session.** System unit stopped, renamed to
`/etc/systemd/system/ollama.service.disabled-20260808`, drop-in directory removed,
`daemon-reload` run — `systemctl is-enabled ollama` now returns `not-found`. User unit
rewritten with the full bench environment, enabled, lingering enabled. Verified:
`PID 1053182 == service MainPID, all 7 required settings verified`, `all 5 matrix models
present`, listener `127.0.0.1:11434 pid=1053182`.

**Files touched.** `bench/ollama_env.sh`, `bench/lib/ollama.sh`.

**Stop condition.** ADR-005 still OPEN. Round 2 not yet run; the c08-c11 code cells are the
next action and the environment is now verified for them.

## 2026-08-08 07:33 EDT — embedder CPU vs iGPU: CPU wins 3.31x; ADR-004 A#2 unchanged

**Stage.** Phase 0, one-off outside the Path E matrix (operator's instruction: "keep it as a
one-off script outside the path e matrix").

**Result.** `qwen3-embedding:4b`, 64 chunks of ~140 tokens, 5090 excluded from both arms:
CPU median **58.58s** (1.09 chunks/s, 178 tok/s) vs iGPU **193.97s** (0.33 chunks/s,
53.7 tok/s). iGPU is **3.31x slower** — far outside the 1.10x band that would have justified a
second serving instance. Reps 1/2 were 193.97/193.98s; rep 3 interrupted, not needed.

**Verdict.** ADR-004 Amendment #2 stands: embedder on CPU, `qwen3-embedding:4b`, native 2560
dims. Recorded as Amendment #7. The prediction written into the script header before the run
(CPU wins) held.

**First attempt invalid, caught by its own assertion.** `CUDA_VISIBLE_DEVICES=""` does not hide
an NVIDIA GPU from the Vulkan loader; the iGPU arm offloaded 37/37 layers to the 5090 and
reported a 39x "win". Fixed by restricting the loader with `VK_DRIVER_FILES` to the RADV ICD.
Corroboration for the valid run: thermal log shows **0 samples under load**, 5090 peaked at
36C/32W — the card genuinely idled.

**Round 2 code cells also completed** (run `20260808_0705`, all 4 cells, provenance verified,
peak 72C, 0 throttled samples): c08 qwen3-coder:30b 466 tok @276.3 t/s · c09 devstral 507 tok
@90.4 · c10 35b-a3b-mtp 9876 tok @119.9 · c11 27b 7719 tok @48.7. c10 loaded at 131072 **with**
the 1 GiB GPU_OVERHEAD reserve, so the envelope concern raised before the run did not
materialise. Machine scoring not yet run.

**Files touched.** `bench/oneoff/embed_igpu_ab.sh`, `adrs/ADR-004-vram-context-envelope.md`,
`DEBUG_LOG.md`.

**Stop condition.** ADR-005 still OPEN — awaiting `score_code.py` on run 20260808_0705 and the
c12/c13 planner replicates. The embedder question is now CLOSED.

## 2026-08-08 07:52 EDT — cold gate raised to a preset 45C

**Stage.** Phase 0 / Path E bench harness (`bench/lib/gpu.sh`).

**Operator instruction.** "your cold gate of 36 still seems too low and takes too long, raise
it to 45."

**Changed.** `GPU_COLD_C` now defaults to `45` instead of empty. Written as `${GPU_COLD_C-45}`
(single dash) so an explicitly empty value survives and still means "calibrate" — with `:-` the
documented escape hatch would silently collapse back to 45. Verified in a subshell.
Calibration machinery retained and still tested; `GPU_COLD_C=""` restores it.

**Effect.** Removes the 30 s calibration window per run and the long tail of cooling waits —
the 07:05 run spent 166 s cooling to 38 C after a single cell.

**This is not a straight revert to the old fixed 45 C.** That gate was rejected because the
idle floor was 45-46 C, so it sat AT the floor and could not distinguish a cold card from a
heat-soaked one. Today's calibration measured a 35 C floor, so 45 C sits ~10 C above it and
still discriminates. The gate is meaningful only while `floor + ~5C < gate`, and that condition
depends on ambient and desktop load, so it is now **enforced rather than assumed**: the preset
branch samples the idle card and warns if the gate is within 2 C of the reading — precisely the
state that made the original gate decorative. Two regression tests cover it (warns at the
floor, silent above it). Cold-gate suite 9 -> 13 assertions; `validate_harness.py` layer 4
guard updated, since it asserted the old empty default and would otherwise have failed on this
change.

**Comparability caveat, recorded for ADR-005.** Round 1 (`20260808_0555`) and the round 2 code
cells (`20260808_0705`) both ran with a 38 C gate. The c12/c13 planner replicates will start at
up to 45 C. Peak under load was 72 C with 0 throttled samples and 0 s above the 80 C warn line,
so throttling cannot explain any difference, but a 7 C warmer start can shift boost clocks
slightly. ADR-005 criterion 10 uses speed only as a tiebreak inside a 3-point quality band, so
the risk to the verdict is low — but if c12 and c13 land inside that band, the tiebreak must
note that the two rounds ran under different start temperatures.

**Files touched.** `bench/lib/gpu.sh`, `bench/tests/test_gpu_cold_calibrate.sh`,
`bench/validate_harness.py`.

**Stop condition.** Unchanged: ADR-005 OPEN pending c12/c13.

## 2026-08-08 08:05 EDT — CORRECTION: the 45C gate did not apply to c12/c13

**Retracts** the "Comparability caveat, recorded for ADR-005" paragraph in the 07:52 entry, as
it applies to c12/c13.

The 07:52 entry warned that the planner replicates would start up to 45 C while round 1 started
at 38 C. That did not happen. Run `20260808_0738` began at **07:37:57**, before the 45 C commit
was pushed at 07:52 and before the operator pulled it. Its own log is the evidence:
`calibrating cold gate (waiting for idle floor) ...... settled at 33C after 30s` /
`cold gate: 36C (measured floor 33C + 3C margin)`.

So c12/c13 ran under a **calibrated 36 C** gate against round 1's calibrated 38 C — a 2 C
difference between two calibrated gates, not the 7 C gap I flagged. **The planner replicates are
comparable to round 1 and need no start-temperature qualifier.** The caveat still stands for
every run *after* this one.

I wrote a caveat about a change that was not yet in effect on the run in question. The check I
skipped was trivial: compare the run's start timestamp against the commit time.

**Justification for the gate change is stronger than argued, from this run's own numbers.**
Cooling waits totalled 917 s (176+272+217+80+61+111) out of 1,544 s wall — **59% of the run was
spent waiting for the card to reach 36 C**, for 6 cells that peaked at 72 C with 0 throttled
samples.

**Anomaly recorded, not explained.** `power max 450W` against a 435 W LACT cap, with 102
power-capped samples. The 07:05 run showed 437 W. 450 W is 3.4% over cap. Most likely
explanation is telemetry sampling above the enforcement window rather than a cap breach, but
that is a hypothesis and no causal claim enters an artifact until executed. Not blocking:
`THERMALLY throttled samples: 0`.

## 2026-08-08 08:20 EDT — ADR-005 RATIFIED: both role slots decided; Phase 0 blocker cleared

**Stage/phase:** Phase 0 exit. **ADRs:** ADR-005 OPEN → **Ratified**; ADR-004 **Amendment #8**
added (closes A#3). **Ledger:** no entry owed — Devstral lost, so the unsloth GGUF is not
vendored.

**Decision.** The two roles do **not** collapse:

| Role | Model | ctx | Preset | Think |
|---|---|---:|---|---|
| Planner | `qwen3.6:27b` | 131,072 | `planner` (1.0 / 0.95 / 20) | on |
| Coder | `qwen3.6:35b-a3b-mtp-q4_K_M` | 131,072 | `precise` (0.6 / 0.95 / 20) | on |

**Coder — decided on machine points, not judgement.** c10 99, c11 92, c09 81, c08 78; 60 of
each 100 came from executing 30 unittest cases. Both *code-marketed* models placed last, both
failing `test_unparseable_value_raises` the same way — value match constrained to the literal
set, so malformed input is skipped silently and c08's `raise ValueError` is unreachable. A
silent-skip failure mode in the component that parses agent output cannot be the default,
which is why c08's 37× speed advantage (2.24 s / 466 tok vs 83.6 s / 9,876 tok) does not save
it. Criteria 7 and 8 both checked and neither fires.

**Planner — decided on median of three, and on one thing that isn't my judgement.** Medians
c12 `27b` **72** vs c13 `35b-mtp` **66** (`bench/path_e/SCORING-20260808_0738.md`). 6 points
is outside criterion 1's 3-point band, so c13's ~2× decode (96.3 vs 49.1 tok/s) never enters
the verdict. Every one of those 100 points is my judgement and a 6-point single-judge margin
is not robust, so the verdict rests instead on a binary re-checkable fact: **c12 reached the
gold decision 3/3, c13 1/3.** c13 chose Option B twice from the identical prompt, both times
asserting it costs "0 additional VRAM" — a claim the gold file prohibits, since
`OLLAMA_NUM_PARALLEL=1` serialises it behind the agent's own generation. Neither B answer
mentioned `NUM_PARALLEL`.

**Round 2's confound resolved against the hypothesis it was built to test.** The c12/c13 cell
comment recorded that round 1's planner gap came from "c03 choosing Option B in that one draw"
and that "at that sampling temperature one draw is not evidence." Three draws later Option B
is reproducible — 2 of 3. The replication was designed to exonerate the 35b and confirmed the
behaviour instead. Meanwhile the n=1 gap did shrink as predicted, 16 points → 6.

c13 produced the single best answer of all six (rep 3, **79**) and the only one in either
round to surface the gold file's own key arithmetic finding. The case against it is variance,
not capability.

**Alternative recorded as rejected:** collapsing both roles onto `35b-mtp` (zero swap cost,
cheapest KV at 23.3 KB/token, coder slot already won at 99) costs 6 median arch points.
Criterion 1 forbids it, but the real reason is that a planner that flips its architectural
conclusion on 2 of 3 identical prompts is the wrong component to make deterministic decisions.
Re-examine if the pre-registered follow-up removes the instability.

**Pre-registered follow-up, filed in the ADR so it cannot be fitted afterwards:** `REPS=3` of
c13 `arch` at the `precise` preset. Temp 1.0 is the Qwen3.6 card's "Thinking, general" row —
on-card, not a harness defect — but the same model at 0.6 scored 99 on `code` with no wobble.
If c13 reaches Option C 3/3 with a median above 75, the planner slot reopens.

**Second correction of the day, and it cuts against my own gold file.** `bench/gold/arch.md`
built its entire VRAM table on the ~3,500 MiB working-desktop figure that **ADR-004 A#6
retracted** (measured 657 / 666 / 675 MiB with the browser up). Recomputed honestly at
131,072: **Option A was never arithmetically dead — it has ~3.8 GB of headroom.** Option C is
still correct, but on the grounds that survive: Ollama evicts LRU and an idle classifier is
exactly what gets evicted, then reloads at 2.8–6.9 s with an action blocked on its verdict;
`NUM_PARALLEL=1`; and only a deterministic gate is unit-testable and auditable. Scoring is
unaffected — all six cells got the identical prompt and `bench/prompts/arch.txt` states the
2–3 GB rise itself, so the error is common-mode. The prompt is deliberately **not** edited, to
preserve comparability with rounds 1–2.

**Files touched:** `adrs/ADR-005-...md` (Decision/Rationale/Consequences written, status
Ratified), `adrs/ADR-004-...md` (A#8), `adrs/README.md` (status + Baseline metrics report
moved Open→Closed; Phase 0 baseline model set marked superseded — the coder is no longer
`qwen3-coder:30b`), `bench/path_e/SCORING-20260808_0738.md` (new),
`bench/gold/arch.md` (correction block), `KNOWN_ISSUES.md` (new, 3 entries).

**Pending, deliberately NOT applied:** `OLLAMA_MAX_LOADED_MODELS` 2 → **1**. The two role
models are 26,140 + 26,390 = 52,530 MiB against a 32,607 MiB card, so co-residency is
impossible and the value should stop Ollama attempting it. Not changed in this commit because
`ollama_guard` asserts all 7 live settings — the unit and the guard's expected value must
change together or every subsequent preflight fails.

**Stop condition:** ADR-005 was the last bench blocker on Phase 0 exit. Three non-bench items
remain (upstream artifact pins, read-only stock Agent Canvas checkout, first-run wizard
trust-dial stop). No further Path E runs are required for Phase 0.

## 2026-08-08 08:31 EDT — ADR-005 Amendment #1: out-of-sample replication of planner verdict

- Stage: Phase 0 baseline / Path E model selection.
- Trigger: operator pasted an unplanned second `REPS=3` run of c12/c13 (`20260808_0804`) after
  ADR-005 was already ratified and pushed (`d38e356`).
- Scored all 6 replicates against `bench/gold/arch.md`. Medians c12 72 / c13 58 (gap 14, vs 6 in
  run `0738`). Gold-decision agreement c12 3/3, c13 **0/3**.
- Combined across both runs: **c12 6/6 Option C, c13 1/6.** Planner selection now rests on six
  independent draws per cell.
- New finding: c13 stopped analysing Option C entirely on rep 3 and dismissed it unargued on
  rep 2 - a comparison-omission defect, not just a wrong choice.
- Counter-evidence logged: c12 produced this run's two worst arithmetic errors (10x KV
  miscalculation; fabricated host-RAM fallback) and one self-contradicting fail-open branch.
- Thermal: peak 71 C, 0 throttled samples, cold gate calibrated to 40 C (45 C preset still not
  in effect - operator clone is at `49a70c0`). Power max 379 W, which *weakens* rather than
  confirms the telemetry-artifact hypothesis for run `0738`'s 450 W reading; stays open in
  KNOWN_ISSUES.md.
- Harness start-temp guard fired correctly on c13 rep 1 (45 C > 40 C target), flagging its
  timing as non-comparable. Guard working as designed.
- Files: `bench/path_e/SCORING-20260808_0804.md` (new), `adrs/ADR-005-...md` (Amendment #1),
  BUILD_LOG.md, SESSION_HANDOFF.md.
- Stop condition: ADR-005 remains Ratified; no decision changed. Pre-registered c13 `precise`
  test still open and still binding.
- Unrelated: operator's `embed_query_latency.sh` failure is a stale clone, not a bug. `git pull`.

## 2026-08-08 08:40 EDT — harness fix: SAMPLING override; ADR-005 Amendment #2; embedder query latency

- Stage: Phase 0 baseline / Path E.
- **Defect found and fixed.** `SAMPLING=precise` was silently ignored by
  `bench/path_e/run_path_e.sh`; sampling came from the cell's hardcoded role. Run
  `20260808_0824` therefore ran at the planner preset (temp 1.0) and was nearly filed as the
  pre-registered `precise` test. Root cause and fix in DEBUG_LOG 2026-08-08 08:40 EDT.
  - `bench_path_e.py`: `--sampling` (choices from `SAMPLING`), threaded to `run_task`; result
    JSON now records `sampling_preset` + `sampling_override`; banner prints `preset=`; new
    `presets` subcommand.
  - `run_path_e.sh`: validates `SAMPLING` against the harness's own preset table, exits 1 on a
    miss instead of ignoring it.
  - `bench/tests/test_sampling_override.sh` (new) — 8 assertions, no GPU, PASS.
- **ADR-005 Amendment #2.** Run `0824` filed as a THIRD planner replicate set, not the
  pre-registered test. Combined c13 **2/9** vs c12 **6/6** on the gold decision; c13 medians
  66/58/66, c12 72/72. Verdict unchanged. Pre-registered `precise` test still OPEN, now with a
  command that works.
- **New substantive finding.** Across nine c13 draws, score and decision co-vary perfectly: both
  79s chose Option C, every 54-66 chose Option B. c13 rep 3 wrote the best interface in the
  15-replicate matrix. Its ceiling beats c12's; its one-in-five hit rate is the disqualifier.
- **Embedder query latency measured** (`bench/oneoff/embed_query_latency.sh`, CPU,
  qwen3-embedding:4b): query band 16-64 tok median **150.6 ms**, NOT user-visible. ADR-004 A#2
  and A#7 stand. Wall time is FLAT 149.8-160.7 ms across 8-256 tokens (1.0x), so **input length
  is ruled out** as the explanation for the ~12x A#2/A#7 discrepancy - that issue stays OPEN in
  KNOWN_ISSUES.md with one fewer candidate cause. 512-token row invalid (truncated at num_ctx
  512; the operator's `NUM_CTX=2048` was a separate shell statement and never reached the
  script).
- **Retraction.** My claim earlier this session that the cold gate checks temperature "on the
  wrong side of warmup" was wrong. `bench_path_e.py:298-303` judges the gate on the pre-warmup
  reading by deliberate design and records the post-warmup `start=` separately; judging it
  post-warmup was a bug already fixed. Run `0824` pre-warmup readings 40/42/42 C all correctly
  passed the 45 C gate. No guard defect.
- **45 C gate validated:** 3 cells in 280 s, peak 54 C, 0 throttled samples, 197 W max, vs
  1,544 s / 917 s cooling / 72 C peak for 6 cells at the 36 C calibrated gate. Throughput
  unchanged, so the cooling bought nothing.
- Files: `bench/path_e/bench_path_e.py`, `bench/path_e/run_path_e.sh`,
  `bench/tests/test_sampling_override.sh` (new), `bench/path_e/SCORING-20260808_0824.md` (new),
  `adrs/ADR-005-...md`, DEBUG_LOG.md, KNOWN_ISSUES.md, SESSION_HANDOFF.md.
- Stop condition: ADR-005 Ratified, unchanged. `OLLAMA_MAX_LOADED_MODELS` 2 -> 1 still unapplied.

## 2026-08-08 08:48 EDT — ADR-005 Amendment #3: pre-registered precise test FAILED; planner axis closed

- Stage: Phase 0 baseline / Path E. **Path E model selection now fully closed.**
- Ran `REPS=3 SAMPLING=precise bash bench/path_e/run_path_e.sh c13_planner_arch_35bmtp` under the
  override fixed in `e9ad2d5`. Verified live three ways: header `temperature: 0.6`, banner
  `SAMPLING OVERRIDE: preset=precise`, `sampling_override` in each JSON.
- **Gate FAILED.** Required Option C 3/3 AND median > 75. Got **Option C 1/3, median 64**
  (74 / 64 / 64). `qwen3.6:27b` keeps the planner slot.
- Temperature was not the cause of c13's instability: 1/3 at 0.6 vs 1/3, 0/3, 1/3 at 1.0. Median
  moved down. Combined **c13 3/12 vs c12 6/6** on the gold decision. `precise` was faster
  (99.9-111.7 vs 86.7-98.9 tok/s), which a quality-gated decision ignores.
- **Decisive qualitative finding.** Rep 3 independently derived GPU inference serialization - the
  substance of `OLLAMA_NUM_PARALLEL=1` and the exact reason Option B's "zero cost" framing is
  prohibited - wrote it clearly, filed it under arguments-against, and chose Option B anyway while
  asserting "0 MiB additional VRAM cost" two paragraphs earlier. The defect is weighting, not
  knowledge, which is worse in a planner: the objection that should overturn the recommendation is
  present in the document and marked survivable.
- Recorded against the winner: rep 1 chose correctly and produced the run's worst arithmetic,
  concluding "-5,057 MiB negative headroom" (i.e. the system cannot run) by double-counting KV
  against a total that already includes it, using the 27b's 74.6 KB/token for coder:30b (110.0),
  and applying a 131,072 context to a model measured at 65,536.
- Salvage noted in the ADR: `0824` rep 3 and `0836` rep 1 are the two best drafts of the
  SecurityAnalyzer port for the future security ADR.
- Thermal: coldest run of the day - peak 52 C, avg under load 42.2 C, 193 W, 0 throttled, 247 s
  for 3 cells. 45 C gate continues to perform.
- Files: `bench/path_e/SCORING-20260808_0836.md` (new), `adrs/ADR-005-...md` (Amendment #3),
  BUILD_LOG.md, SESSION_HANDOFF.md.
- Stop condition: ADR-005 Ratified and now CLOSED on both roles. Remaining ADR-005 consequence:
  `OLLAMA_MAX_LOADED_MODELS` 2 -> 1, still unapplied.

## 2026-08-08 08:52 EDT — MAX_LOADED_MODELS 2 -> 1 RETRACTED before application; LRU probe written

- Stage: Phase 0 baseline. ADR-005 Amendment #4.
- **Change NOT applied, and it was wrong.** ADR-005's `=1` consequence rested on "the embedder no
  longer competes for a slot, it is on CPU." BUILD_LOG 2026-08-08 05:50 EDT had already MEASURED
  the opposite via `/api/ps`: a CPU-placed model (`size_vram: 0`) occupies a model slot. Being on
  CPU removes a model from the VRAM budget, not the slot budget - I conflated the two.
  `bench/ollama_env.sh:60-66` names `1` as wrong for exactly this reason.
- Applying `=1` would have evicted and reloaded the embedder on every planner<->coder switch, and
  because the plan updated `ollama_guard`'s expected value in the same commit, **the preflight
  guard would have certified the regression as correct.** Inspecting before editing is what caught
  it; the handoff I wrote also named a file that does not exist (`bench/lib/ollama_env.sh` - the
  real paths are `bench/lib/ollama.sh` for the guard and `bench/ollama_env.sh` for the unit
  writer), and there are FIVE sites referencing the value, not three.
- **Live value stays 2.** No env change, no unit edit, no restart.
- **New open question, the inverse risk.** Whether `=2` actually prevents role co-residency is
  unmeasured. With {embedder, planner} at the limit, loading the coder must evict something; if it
  evicts the embedder, both role models go resident (52,530 MiB at 131,072 vs a 32,607 MiB card).
  Filed in KNOWN_ISSUES.md.
- **`bench/oneoff/max_loaded_lru_probe.sh` added.** Clears all models, loads embedder -> planner ->
  coder, snapshots `/api/ps` at each step, prints a verdict. Uses `num_ctx=4096` deliberately: at
  131,072 the role models cannot both fit under any slot policy, so a VRAM failure would mask the
  scheduling answer. Changes no configuration and restarts nothing. Thermal instrumentation via
  `gpu_guard` + `gpu_watch_start` (initial draft called a non-existent `gpu_guard_or_die` behind
  `|| true`, which would have silently swallowed the check - corrected against the real function
  list in `bench/lib/gpu.sh`).
- Files: `bench/oneoff/max_loaded_lru_probe.sh` (new), `adrs/ADR-005-...md` (Amendment #4),
  KNOWN_ISSUES.md, BUILD_LOG.md, SESSION_HANDOFF.md.
- Stop condition: ADR-005 Ratified. Its last pending consequence is now retracted rather than
  applied, so **ADR-005 has no open actions.**

## 2026-08-08 08:56 EDT — LRU probe v1 INVALID; co-residency question settled by arithmetic instead

- Stage: Phase 0 baseline. Run `20260808_0850`, artifacts
  `~/.oh-gui/oneoff/max_loaded_lru/20260808_0850`.
- **Probe v1 was invalid — my defect, two independent errors.**
  1. It omitted `"num_gpu": 0` on the `/api/embed` call, so the embedder loaded onto the **GPU**
     at `size_vram=2754 MiB` instead of CPU-resident at 0 (ADR-004 A#2). Evicting a GPU-resident
     embedder frees real VRAM, so its eviction cannot be attributed to the slot limit. That
     confound is the entire reason the probe exists.
  2. Its stated rationale was false. I wrote that `num_ctx=4096` "lets both physically fit, which
     isolates the question to LRU policy alone." Measured: planner **20,364** + coder **25,578** =
     **45,942 MiB** vs a **32,607 MiB** card. Weights dominate at every context. I asserted the
     arithmetic instead of computing it — the same error class I had flagged twice in the previous
     two hours, once against my own scoring and once against a model's `-5,057 MiB` conclusion.
- **What the run nonetheless SETTLED.** The two role models can never co-reside on this card at
  any `num_ctx`. So `OLLAMA_MAX_LOADED_MODELS` was **never** what prevents co-residency — the VRAM
  ceiling is, and ADR-005's framing of the setting as the enforcement mechanism was wrong in both
  directions (the retracted `=1` and the retained `=2`). Step 3 also showed the scheduler evicts
  beyond the slot minimum: loading the coder evicted **both** resident models.
- **What remains open, reframed.** The setting governs **embedder reload churn**, not OOM
  protection. Whether `=2` reserves a slot for the CPU embedder is still unmeasured.
- **Probe v2.** Forces `num_gpu:0`, and **hard-fails with an explicit diagnosis** if step 1 does
  not report `size_vram: 0`, rather than proceeding to an uninterpretable verdict — per the
  standing rule that a knob a caller can reach for must work or refuse loudly. Verdict logic
  rewritten around the real discriminator: a CPU-resident embedder holds 0 MiB, so if it is
  evicted anyway, only the slot limit can explain it.
- Thermal: peak 39 C, 112 W max, 0 throttled, 20 s. Non-issue.
- Files: `bench/oneoff/max_loaded_lru_probe.sh` (v2), KNOWN_ISSUES.md, BUILD_LOG.md,
  SESSION_HANDOFF.md.
- Stop condition: ADR-005 still has no open actions; this is a KNOWN_ISSUES item, not an ADR
  blocker.

## 2026-08-08 08:58 EDT — MAX_LOADED_MODELS=2 CONFIRMED by measurement; ollama stop is load-bearing

- Stage: Phase 0 baseline. ADR-005 Amendment #5. Run `20260808_0855`, artifacts
  `~/.oh-gui/oneoff/max_loaded_lru/20260808_0855`. **No configuration change.**
- **The slot limit counts CPU-resident models and reserves nothing.** `{embedder(CPU, 0 MiB),
  planner}` resident, coder loaded -> embedder evicted. Freeing it released **zero VRAM**, so no
  VRAM-pressure explanation exists; only the slot limit accounts for it.
- **`=2` is nonetheless correct, and the churn was my test's sequence, not the value.** Step 4 ran
  the sequence ADR-005 requires: `{embedder}` -> load planner (2, at the limit) -> `ollama stop`
  planner (1) -> load coder (2, at the limit). **The embedder survived.** Residency never exceeds
  the limit on the correct path, so nothing is evicted.
- **Three claims about this setting are now retired.** `=1` needed because a CPU model holds no slot
  - false (Amdt #4). `=2` prevents role co-residency - vacuous, the VRAM ceiling does that
  (20,364 + 25,578 = 45,942 vs 32,607). `=2` reserves a slot for the embedder - false. What the
  setting governs is reload churn, and on a correct router there is none.
- **Promoted requirement:** `OLLAMA_KEEP_ALIVE=-1` means nothing auto-unloads, so the router MUST
  `ollama stop` the outgoing role model. This is now MEASURED as the sole enforcement mechanism, not
  a tidiness convention. Omitting it costs an embedder reload, **not** an OOM - the VRAM ceiling
  still refuses co-residency. Graceful degradation, so no defensive raise to 3.
- **Implementation consequence:** the role-switch path needs a test asserting the embedder is still
  resident after a switch. That is the observable distinguishing a correct router from one that has
  silently stopped calling `ollama stop`.
- Thermal: peak 40 C, 120 W, 0 throttled, 36 s for 7 model loads.
- Files: `adrs/ADR-005-...md` (Amendment #5), KNOWN_ISSUES.md (entry CLOSED), BUILD_LOG.md,
  SESSION_HANDOFF.md.
- Stop condition: ADR-005 Ratified with Amendments #1-#5, **no open actions**. Phase 0 exit still
  NOT met - three non-bench items remain.

## 2026-08-08 09:02 EDT — Phase 0 exit item 1 SATISFIED: upstream artifact pins recorded

- Stage: Phase 0 exit criterion, `docs/specs/02-repo-setup.md` item 1 (as replaced by ADR-001).
- **`docs/UPSTREAM_PINS.md` created** - authoritative pin manifest with digests, wheel hashes,
  npm integrity, provenance, and a paste-ready re-verification procedure for each phase gate.
- **Pins.** `agent-server` index digest
  `sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520` (amd64 child
  `sha256:7bfd4fb6...`), tag `ca46719-python`; verified as `refs/tags/v1.41.0` from the image config
  blob's `OPENHANDS_BUILD_GIT_REF`/`_SHA`, not inferred from the tag name. `openhands-sdk`,
  `-tools`, `-workspace`, `-agent-server` all **1.41.0**, `requires_python >=3.12`, wheel sha256s
  recorded. `@openhands/typescript-client` **1.37.0**, MIT, integrity recorded.
- **Ambiguity FLAGGED, not silently resolved.** Item 1 says pin in "the middleware's Python
  lockfile" and "the frontend lockfile". **Neither project is scaffolded** - no `pyproject.toml`,
  no `package.json`, no lockfile in the repo. Phase 0 requires pins *recorded*; lockfile generation
  is Phase 1. UPSTREAM_PINS.md is designated the source those lockfiles are generated from verbatim.
- **Registry gotcha recorded.** `ghcr.io` caps `tags/list` at 1000 entries and `ca46719-python` is
  absent from that page despite resolving. Never infer absence from the listing; resolve the tag.
  The image carries no OCI `version`/`revision`/`source` labels - only `authors` - so the digest plus
  the two `OPENHANDS_BUILD_GIT_*` env vars are the only identity signals.
- **Inspecting the artifacts falsified FOUR claims in ADR-001** (Amendment #1). All four came from
  trusting documentation prose over the shipped artifact:
  1. **"remote conversations only" - FALSE, and load-bearing.** The client exports a functional
     `LocalConversation` (local agent loop, bash tool, `toolExecutor`, its own security/ and
     stuck-detector). ADR-001's §4.8 argument - "a remote-only client cannot reach the hole" - does
     not hold. Nothing prevents the frontend from bypassing the middleware policy plane entirely.
     New binding requirement: a mechanical import gate plus a failing test. Until it exists, ADR-001
     item 4 is a convention, not a control. Filed in KNOWN_ISSUES.md.
  2. **"no formal OpenAPI document was found" - FALSE.** Upstream ships `openapi.py`, an export
     script, a quality gate, and `test_openapi_contract.py`. The anti-corruption layer can be
     generated and diffed instead of hand-written. The versioning/deprecation half of the risk
     stands.
  3. **"ports 8000/8001" - WRONG.** The image exposes 8000 and **8002**, and 8002 is `NOVNC_PORT`.
     A compose file or health check written from ADR-001 would have probed a closed port.
  4. **"no Node dependency" - wrong about the dependency graph.** `ws ^8.20.0` is a normal
     dependency; browser runtime does prefer `window.WebSocket`, but bundlers can choke on the bare
     `require('ws')`. Newly noted: **`@openrouter/sdk ^0.13.24` is a non-optional dependency** and
     `openrouter-llm.js` ships - a cloud LLM SDK inside a local-only project. Must be proven
     unreachable and tree-shaken.
- **Version skew recorded:** server/SDK 1.41.0 vs client 1.37.0, four minor versions, no compat
  matrix, no peerDeps. Filed in KNOWN_ISSUES.md.
- Files: `docs/UPSTREAM_PINS.md` (new), `adrs/ADR-001-integration-boundary.md` (Amendment #1),
  `docs/specs/02-repo-setup.md` (item 1 marked SATISFIED), `PORTING_LEDGER.md` (runtime deps table
  filled in), KNOWN_ISSUES.md (2 new entries), BUILD_LOG.md, SESSION_HANDOFF.md.
- **Stop condition: Phase 0 exit item 1 MET.** Two items remain: read-only stock Agent Canvas
  reference checkout (`03-layout.md` §3.0.1) and the first-run wizard stating the default trust-dial
  stop in-UI (§3.4). No GPU work outstanding.

## 2026-08-08 09:06 EDT — Phase 0 exit item 2: reference-checkout location decided, provisioner written and executed

- Stage: Phase 0 exit item 2, `docs/specs/03-layout.md` §3.0.1 / ADR-001 item 6.
- **Decision (ADR-001 Amendment #2):** the read-only stock Agent Canvas checkout lives **outside**
  the repo at `~/dev/oh-gui-ref/agent-canvas/v1.12.0/` (pristine, `chmod a-w`, never installed,
  never run), with a disposable writable copy at `~/.oh-gui/reference/agent-canvas-run/` for Phase 0
  baseline metrics. Only `scripts/provision-reference-checkout.sh` is committed here.
- **Deciding argument was not size.** A shallow single-tag clone measures **21 MB**, so the
  386 MB full-history figure was irrelevant. The real reason: **git records only the executable bit,
  not write permissions**, so an in-repo checkout is writable for every cloner and item 6's "never
  modified" would be unenforceable by construction. Outside the repo, `chmod -R a-w` is a real
  control — verified by attempting a write and a delete against the provisioned tree; both refused.
  Secondary reason: an in-repo copy ships its own `package.json` and would be captured by npm
  workspaces, tsconfig includes, eslint globs and test discovery — a build input, which item 6
  forbids. Submodule rejected as a coupling (item 5: "vendoring is a copy, not a coupling").
- **Two layers because §3.0.1 asks for two things.** Diff reference must be inert; regression
  baseline must be runnable (`npm ci` needs to write). One read-only tree cannot do both.
- **DONOR WAS MISIDENTIFIED IN PORTING_LEDGER.md — licensing defect, now corrected.** The ledger
  said Agent Canvas "is MIT-licensed and was archived 2026-07-27 … frozen, stable donor with no
  upgrade treadmill." That conflated two repos and was false about both:
  - `OpenHands/agent-canvas` — archived, but a **README-only stub with NO LICENSE file**. Not MIT.
    Acting on the ledger would have vendored **unlicensed code** into an MIT-attributed project.
  - `OpenHands/OpenHands` — the real donor. MIT, `LICENSE` at root, root `package.json` is
    `@openhands/agent-canvas`. **Not archived** (pushed 2026-08-08), so "no upgrade treadmill" was
    wrong — which is exactly why item 6 pins it.
  `docs/specs/00-ground-truth.md` had the correct pin all along and is now verified: tag `v1.12.0`
  → commit `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364`, and **all five donor paths the ledger names
  exist at that commit**.
- **Provisioner executed, not just written.** Fresh clone, idempotent re-run (verifies, no
  re-clone), tamper detection (re-locks a chmod'd file with a WARN), `--run-copy`, and
  write-refusal all exercised. Fails closed if root `package.json` is not
  `@openhands/agent-canvas` or `LICENSE` is not MIT, so pointing it at the archived stub errors
  instead of silently producing an unlicensed reference.
- **Bug found by executing rather than asserting:** the first version ran `chmod -R a-w` before
  `mv`, which fails — renaming a directory rewrites its `..` entry and so requires write permission
  on the directory itself. Order corrected to move-then-lock, with a comment recording why.
- Files: `scripts/provision-reference-checkout.sh` (new, executable),
  `adrs/ADR-001-integration-boundary.md` (Amendment #2), `PORTING_LEDGER.md` (donor section
  corrected: repo, pin, SPDX, do-not-vendor note), `docs/specs/03-layout.md` (§3.0.1 location note),
  BUILD_LOG.md, SESSION_HANDOFF.md.
- **Stop condition: item 2 NOT yet met.** The mechanism is delivered and proven in the sandbox, but
  the checkout does not exist on Colossus until the operator runs the script and the run is logged
  here. Remaining Phase 0 item after that: the first-run wizard (§3.4).

## 2026-08-08 09:14 EDT — Phase 0 exit item 2 CLOSED: reference checkout provisioned on Colossus

- Operator ran `scripts/provision-reference-checkout.sh` on Colossus at 08:59 EDT. Output:
  `ok commit 4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364` · `ok 7 donor paths present` ·
  `ok LICENSE is MIT` · `ok root package is @openhands/agent-canvas` · installed and locked at
  `/home/rmholston/dev/oh-gui-ref/agent-canvas/v1.12.0`, **21M**.
- Matches the sandbox rehearsal exactly, including size. Fresh-clone path taken (no prior checkout).
- **Not yet independently asserted:** the fresh-clone path applies `chmod -R a-w` but does not
  re-read the result; only the verify path prints `ok tree is read-only`. A second run confirms the
  lock held. Folded into the next command batch rather than spent as its own round trip.
- Re-verify at each phase gate by re-running the script and logging the output here.
- **Stop condition: Phase 0 exit item 2 MET.**

## 2026-08-08 09:14 EDT — two spec/ADR conflicts found while scoping Phase 0 item 3 — FLAGGED, not resolved

Scoping the remaining Phase 0 work surfaced conflicts that must be settled by the operator before
any build starts. Recorded here; no spec or ADR edited yet.

1. **Baseline model set is stale.** `docs/specs/11-dev-plan.md` (v4.3 status block) and
   `docs/specs/README.md` both fix the Phase 0 baseline set as `qwen3.6:27b` (planner) +
   **`qwen3-coder:30b`** (coder). **ADR-005 selected `qwen3.6:35b-a3b-mtp-q4_K_M` as coder**;
   `qwen3-coder:30b` was benched and not selected. Newer-wins says ADR-005 governs and the spec is
   stale, but the *baseline* arguably wants the originally-specified pair for comparability. This
   changes what the Phase 0 metrics report measures, so it is the operator's call.
2. **"dense" conflicts with the selected coder.** `11-dev-plan.md` requires the baseline report to
   run "against a **dense** Qwen3 27B-35B model". `qwen3.6:27b` is dense. **`35b-a3b-mtp` is MoE**
   (~3B active), so it does not satisfy the literal wording. Either the report runs on the dense
   planner only, or the word "dense" is retired from the spec.
3. **Sequencing tension on item 4 (first-run wizard).** §3.4 requires shipping wizard UI, but no
   frontend project exists (no `package.json` anywhere — see `docs/UPSTREAM_PINS.md`). Scaffolding
   is Phase 1 work, so Phase 0's exit criterion depends on Phase 1 setup. The wizard also *states*
   the trust-dial default `ConfirmRisky()`, whose implementation is Phase 1's authorization slice.
   Phase 0 can only deliver the wizard's copy and shell, not a functioning dial. Boundary needs
   stating explicitly before building.

## 2026-08-08 09:26 EDT — frontend scaffolded at `apps/gui`; item 4 gate implemented; two operator decisions applied

- Stage: Phase 0 exit items 3-4 prerequisite. Operator chose **ADR-005 selection** for the baseline
  and **scaffold frontend now**.
- **Stack, every version resolved from the npm registry rather than recalled.** Vite 8.2.1,
  React 19.2.8, Vitest 4.1.10, Playwright 1.62.1, Tailwind 4.3.3 (`@tailwindcss/vite`, CSS-first,
  no config file), motion 13.0.0, ESLint 10.8.1, typescript-eslint 8.66.0.
- **TypeScript pinned to 6.0.3, NOT the `latest` 7.0.2.** `typescript-eslint@8.66.0` declares
  `peerDependencies.typescript ">=4.8.4 <6.1.0"`. Installing `latest` would have silently broken
  linting - the exact gate this scaffold exists to provide. Caught by reading peer ranges before
  installing.
- **`@types/react` do not track React's version.** First install failed `ETARGET` on
  `@types/react-dom@19.2.8`; actual are 19.2.18 / 19.2.4.
- **jsdom 30 is broken on Node 20** - `webidl.util.markAsUncloneable is not a function` via undici.
  The `EBADENGINE` warning was fatal, not cosmetic. Default Vitest environment set to `node`; the
  import-boundary gate needs no DOM and must not depend on jsdom. Component tests opt in per-file
  with `// @vitest-environment jsdom` and require **Node >=22.14**. Sandbox Node is 20.20.1, so the
  jsdom path is **unverified** - do not assume it works until run on Colossus.
- Also fixed by running rather than assuming: `TS5097` (`./App.tsx` extension) and `TS2882`
  (CSS side-effect import needs `vite/client` in `types`). `vite build` succeeds even when `tsc`
  fails, so the `gate` script runs `tsc -b && vite build` - a green `vite build` alone proves
  nothing.
- **ADR-001 Amendment #3 - the item 4 gate now exists.** `@openhands/typescript-client` is a
  **types-only `devDependency`**, resolving the apparent conflict between spec item 1 ("pinned in
  the frontend lockfile") and ADR-001 item 4 ("frontend talks only to the middleware"). `import
  type` is erased at build, so no `ws`, no `@openrouter/sdk`, no `LocalConversation` reaches the
  bundle. Two independent gates:
  1. ESLint `@typescript-eslint/no-restricted-imports` with `allowTypeImports: true`.
  2. A Vitest source scan, because **a lint rule can be disabled by the code it gates** - the same
     objection Principle 8 raises against display-as-enforcement.
  **Both demonstrated failing**, not merely written: a deliberate `LocalConversation` import was
  rejected by ESLint; with the rule silenced by an inline disable, the Vitest scan still caught it;
  a type-only import passed both. The scan carries three self-tests so it cannot rot into a no-op.
  KNOWN_ISSUES entry CLOSED. Residual gap recorded: the gates cover this repo's source, not a
  transitive dependency importing the client.
- **ADR-005 Amendment #6** - Phase 0 baseline measures the ADR-005 pair (`qwen3.6:27b` +
  `qwen3.6:35b-a3b-mtp-q4_K_M`); the "dense" qualifier is retired because the selected coder is MoE
  and `qwen3-coder:30b` was benched and rejected. `11-dev-plan.md` and `docs/specs/README.md`
  amended.
- **`docs/specs/12-portable-components.md` carried the same donor defect as PORTING_LEDGER.md**
  ("OpenHands/agent-canvas … MIT, archived Jul 27 2026 (frozen = stable donor)") and is corrected
  the same way. That wrong attribution had propagated to three separate files.
- Gate verified green end to end: `npm run gate` (lint + 4 tests + `tsc -b` + `vite build`) exit 0.
- Files: `apps/gui/{package.json,package-lock.json,tsconfig.json,vite.config.ts,eslint.config.js,
  index.html,playwright.config.ts,.gitignore}`, `apps/gui/src/{main.tsx,App.tsx,index.css}`,
  `apps/gui/src/__tests__/{import-boundary.test.ts,setup.ts}`, `apps/gui/e2e/smoke.spec.ts`,
  ADR-001 (Amdt #3), ADR-005 (Amdt #6), KNOWN_ISSUES, PORTING_LEDGER, 11-dev-plan, 12-portable-
  components, specs/README, UPSTREAM_PINS, BUILD_LOG, SESSION_HANDOFF.
- **Stop condition: scaffold complete and gated. Phase 0 items 3 and 4 still OPEN** (baseline
  metrics report; first-run wizard). No wizard code written - that is the next slice.

## 2026-08-08 09:29 EDT — scaffold verified on Colossus; undeclared `@types/node` fixed by splitting the TS project

- Colossus run of `provision-reference-checkout.sh` returned **`ok tree is read-only`** on the
  existing-checkout path. That was the verification still owed from 09:14 — the fresh-clone path
  chmods without re-reading, so the lock had never actually been *observed*. It is now.
- Colossus Node is **v24.16.0**, so the jsdom >=22.14 constraint is moot there. Component tests can
  opt into jsdom whenever we need them; the suite still defaults to `node`.
- Lint and all 4 boundary tests passed on Colossus. **`tsc -b` failed** (TS2591, `node:fs`) — an
  undeclared `@types/node` that the sandbox had been resolving through a hoisted copy. Diagnosed
  and fixed in DEBUG_LOG 09:28. Fixed by declaring `@types/node@24.13.3` and splitting into
  `tsconfig.app.json` (browser, no Node types) and `tsconfig.node.json` (tooling/tests), so the fix
  does not let `fs` and `process` typecheck in browser code.
- Both directions proven by probe: `node:fs` in browser source now fails `tsc -b`; the same import
  in a test passes. Full gate green after `rm -rf node_modules && npm ci`.
- Stop condition unchanged: **Phase 0 items 3 and 4 still OPEN.**

## 2026-08-08 09:44 EDT — Phase 0 exit item 4: first-run wizard shipped

- Stage: Phase 0 exit item 4, `docs/specs/03-layout.md` §3.4. Ports touched: none — `apps/gui` only.
- Five steps (spec items 1, 3, 4, 5, 6; items 2 and 7 were removed by ADR-003).
- **§3.4 item 3 resolved without shipping a fake.** The spec wants "one live, harmless example
  action" at each stop; Phase 0 has no agent to produce one. Rather than a canned illustration —
  which is the display-as-enforcement pattern Principle 8 rejects — step 2 renders a decision
  matrix **computed by the real predicate** (`shouldConfirm()`), the same function the Phase 1
  review UI will call. Change the rule and the table changes. The remaining gap (walking a genuinely
  executing action) is stated in-UI as Phase 1, not implied to work.
- **Item 4 met in full:** the wizard states `ConfirmRisky(threshold=HIGH, confirm_unknown=True)` as
  the default, justifies it in both directions (why not stricter, why not looser), and says why
  `NeverConfirm()` is opt-in only. The expression is sourced from the spec table constant, so the
  copy cannot drift from the mapping. `threshold` and `confirm_unknown` are shown as live values
  per §4.1's v4.0 correction rather than left invisible.
- Item 1 shows an explicit deferral. Detection needs the middleware; querying Ollama from the
  browser would breach ADR-001 item 4, so it is not faked. Item 5 seeds the counter at zero with a
  one-line explanation; per-session persistence (13-hard-constraints.md:16) is logged as owed.
  Item 6 labels the plan tree "Example" and states nothing will run.
- **Found a real defect in `04-authorization.md` §4.1 while writing the predicate.** The
  "Ask on writes outside worktree" stop, as specified (elevate to "at least MEDIUM" + "standard
  ConfirmRisky()"), is **inert** — MEDIUM sits below the standard HIGH threshold, so the elevation
  changes nothing and the stop would ship pausing on nothing new. The MEDIUM/MEDIUM alternative
  contradicts the same row's "in-scope writes proceed". Elevating to HIGH is the only reading that
  works; implemented, spec annotated, **OPEN pending operator ratification** (KNOWN_ISSUES).
  Surfaced by a failing ordering test, not by reading — an authorization control that silently does
  nothing is worse than an absent one, because the operator relies on it.
- 25 tests pass (14 trust-dial, 7 wizard, 4 import boundary). Component tests use jsdom via
  per-file `// @vitest-environment jsdom`. **Node 24.16.0 was installed in the authoring sandbox
  specifically so these could actually be run** rather than written and shipped unverified.
- Rendered and inspected all five steps in a real browser at 2x. Fixed three presentation defects
  that the tests could not see: outcome cells wrapping "Pauses for you" onto two lines in every
  row, `text-slate-500` risk chips failing small-text contrast on the `#070d1f` background
  (moved to `slate-400`), and the policy expression breaking mid-call across lines.
- `tsconfig.node.json` now includes `src` whole (the tests import app source, TS6307). The app
  project still checks those files without Node types, so a `node:fs` import in browser code still
  fails `tsc -b` — re-proven by probe after the change, not assumed.
- New dep: `@testing-library/user-event`. Files: `apps/gui/src/features/first-run/{trust-dial.ts,
  FirstRunWizard.tsx}`, `apps/gui/src/App.tsx`, `apps/gui/src/__tests__/{trust-dial.test.ts,
  first-run-wizard.test.tsx}`, `apps/gui/tsconfig.node.json`, `docs/specs/04-authorization.md`,
  KNOWN_ISSUES, BUILD_LOG, SESSION_HANDOFF.
- **Stop condition: Phase 0 exit item 4 MET on its stated criterion** (wizard ships and states the
  default stop explicitly in its own UI copy). **Item 3 (baseline metrics report) is the only Phase
  0 exit item still open.** Two OPEN entries added to KNOWN_ISSUES.

## 2026-08-08 09:52 EDT — the frontend gate now renders in a real browser (ADR-007); ADR-006 ratified

- Stage: Phase 0, `apps/gui` test infrastructure. Ports touched: none.
- Operator direction: always use Playwright to check the frontend. Implemented as an enforced gate
  rather than a habit — `apps/gui/e2e/wizard.spec.ts`, 8 tests, ~6s.
- Justification is empirical, not stylistic: the wizard passed 25 Vitest tests while wrapping
  "Pauses for you" in every table row, failing contrast on the risk chips, and breaking the policy
  expression mid-call. jsdom has no layout engine and no colours, so that entire defect class is
  invisible to it by construction.
- Asserts per step: axe-core `wcag2aa`+`wcag21aa` (serious/critical fail the run), no clipped text,
  no horizontal scroll at 900px, rendered table agrees with the predicate, and a full-page
  screenshot attached to the report so screens stay reviewable.
- **Both assertions were proven against real defects before being trusted.** Reverting the risk chip
  to a dim slate produced a `color-contrast` failure naming all five rows. Clamping the table
  wrapper to `h-16 overflow-hidden` produced a clipping failure.
- **The first clipping check was wrong and the probe caught it.** It skipped every element whose
  computed overflow was not `visible` — precisely the clipping case — so it passed the forced
  defect. Rewritten to flag `hidden`/`clip` containers whose scroll size exceeds their client size,
  exempting `auto`/`scroll` (deliberate scrollers, e.g. the table wrapper). Re-probed: now fails.
- The rewrite then flagged `caption.sr-only` on the real page. That is a 1px screen-reader box,
  clipped by design — a false positive, not a defect. Exempted elements ≤1px in either dimension;
  a gate that cries wolf gets ignored. Re-probed both directions afterwards: real page clean, forced
  clip still fails.
- Screenshot-diffing rejected: it pins pixels, fails on every intentional design change, and trains
  people to re-baseline without looking. Property assertions survive redesign.
- Scripts: `npm run verify` = gate + e2e (pre-commit for frontend changes); `npm run e2e:setup`
  installs chromium. `gate` stays browser-free and fast. Local only — no GitHub Actions.
- **ADR-006 ratified** (out-of-worktree stop elevates to HIGH). §4.1's correction block moved from
  OPEN to ratified, KNOWN_ISSUES entry CLOSED, `adrs/README.md` open-items table updated. The
  entry is retained as the record of a control that would have shipped deciding nothing.
- **ADR-007 filed and ratified** for the visual gate.
- New devDeps: `@axe-core/playwright`, `axe-core`. Deleted the `e2e/smoke.spec.ts` placeholder.
- Files: `apps/gui/e2e/wizard.spec.ts` (new), `apps/gui/e2e/smoke.spec.ts` (deleted),
  `apps/gui/package.json`, `adrs/ADR-00{6,7}-*.md` (new), `adrs/README.md`,
  `docs/specs/04-authorization.md`, KNOWN_ISSUES, BUILD_LOG, SESSION_HANDOFF.
- Verified: 25 unit tests, 8 e2e, lint clean, `tsc -b` clean, build clean.
- **Stop condition: unchanged. Phase 0 exit item 3 (baseline metrics report) remains the only open
  Phase 0 item.** No open KNOWN_ISSUES blockers; one accepted Phase 0 limitation (trust-dial
  display mirror) remains.

## 2026-08-08 09:56 EDT — e2e harness fixed for dual-stack hosts

- Stage: Phase 0, `apps/gui` e2e (ADR-007). Ports touched: none.
- The gate landed green in an IPv4-only sandbox and timed out immediately on Colossus. Full
  diagnosis in DEBUG_LOG 2026-08-08 09:56 EDT. Three defects: Vite bound `localhost` (→ `::1`)
  while Playwright polled `127.0.0.1`; `webServer` output was discarded so the failure had no
  stated reason; and `reuseExistingServer` would adopt any process answering on the port.
- All three fixed and each probed by forcing the failure it is supposed to report.
- **A gate that only runs on the author's machine is not a gate.** ADR-007 was ratified on evidence
  from one host; this is the correction, one commit later.
- Files: `apps/gui/playwright.config.ts`, `apps/gui/e2e/wizard.spec.ts`, DEBUG_LOG, BUILD_LOG,
  ADR-007 (amendment).
- Stop condition unchanged: Phase 0 exit item 3 (baseline metrics report) remains the only open item.

## 2026-08-08 10:12 EDT — Phase 0 exit item 3: baseline metrics harness (ADR-008 Proposed)

- Stage: Phase 0 exit item 3, `docs/specs/02-repo-setup.md` items 5-7. Ports touched: none.
- **The spec's own metrics rule out automation.** Two of item 5's five are irreducibly human:
  "lost track" is a state of the operator's mind, "accepted without inspection" is a fact about
  whether a person read a diff. Built an instrumented observation harness instead — the operator
  drives the stock app, the harness measures. A scripted agent run would have produced turns and
  tokens, looked rigorous, and fabricated the one number `13-hard-constraints.md:16` exists to
  control.
- Accepted lines are counted from `git --numstat` at each accept, not from operator recall; the
  operator answers exactly one judgement per accept (did you read it). Objective count × one
  judgement = the metric the spec names.
- **Backend call made and recorded in ADR-008.** The reference checkout is Agent Canvas v1.12.0,
  depending on `@openhands/typescript-client@1.36.1`; this repo pins the Agent Server image at
  v1.41.0. Running one against the other measures a pairing nobody ships. The baseline therefore
  runs the stock app from source, using the backend it pins itself via `uvx`; the image pin governs
  Phase 1 only. Verified from the donor's own `package.json` and README at the pinned SHA.
- **Item 7 is evidenced by measurement.** Variant and quantization come from `ollama ps` sampled
  during the run, not from the settings screen. With no samples, `report.py` states item 7 is NOT
  satisfied rather than leaving a blank that reads as success.
- Fixture is a script-seeded `notes-api` (FastAPI + pytest), recreated byte-identically, so the same
  eight tasks re-run against OH-GUI at any later phase. Tasks ordered additive → behavioral →
  refactor → cross-cutting, t08 expected to fail.
- Thermal: standard `bench/lib/gpu.sh` — 83 °C ceiling, 80 °C warn, 45 °C cold gate, 1 Hz, unload
  and abort on breach. The app runs the model rather than the script; the card does not care.
- **Verified before handing over:** 10 tests pass, and the full chain was dry-run end to end
  (seed → three simulated sessions including one abandonment → aggregated report). The thermal
  parser was tested against synthetic CSVs covering the case that matters — a power-capped sample
  (`10`) must NOT be reported as throttling, or every run at the 435 W cap looks invalid, while a
  thermal-slowdown sample (`01`) must be.
- `report.py` excludes abandoned tasks from means and lists them separately; absent data prints
  as `—`, never as `0`.
- Files: `bench/baseline/{README.md,seed_fixture.sh,run_baseline.sh,mark.py,report.py}`,
  `bench/baseline/tasks/t0{1..8}-*.md`, `bench/baseline/tests/test_baseline_harness.py`,
  `adrs/ADR-008-phase-0-baseline-method.md`, `adrs/README.md`, BUILD_LOG.
- **Stop condition: harness complete and self-tested; the run itself is operator work on Colossus.
  Phase 0 exit item 3 is NOT met until `docs/BASELINE-METRICS-<stamp>.md` exists and ADR-008's
  verdict section is filled.** ADR-008 stays Proposed until then.

## 2026-08-08 10:14 EDT — Baseline run conditions: Colossus port deviation recorded

- Stage: Phase 0 exit item 3. Stock app refused to start: ingress 8000 and frontend 3001 both in use.
- **Identified before touching anything, and neither was disposable.** 8000 is the Kosmos uvicorn
  dev server (`/home/rmholston/dev/kosmos/.venv/bin/python3.12`, cwd `~/dev/kosmos`, up 8h13m);
  3001 is gitea (pid 2816, wildcard bind, system service). `ss` showed no process for 3001 because
  it isn't owned by the user — the reflex `pkill` would have failed, as it already did on pid 16688
  earlier in this session.
- Resolution: shift the app, don't kill the services. `PORT=8010 OH_CANVAS_SAFE_VITE_PORT=3011`.
  Variable names read from `scripts/dev-with-automation.mjs` at pinned SHA
  4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364, not guessed from the error text.
- Verified from the same source that the automation service's hardcoded `localhost:3001` CORS
  origin is harmless: the browser talks to ingress, and the ingress port is added to that list
  dynamically at line 919.
- Recorded in `bench/baseline/README.md` and ADR-008 "Run conditions" rather than left to memory,
  because gitea and Kosmos are permanent on Colossus and a baseline whose run conditions are
  undocumented cannot be re-run — which is the whole purpose of the fixture.
- Frontend unaffected and re-verified at 704a57d: lint + 25 unit tests + build + **8/8 Playwright
  e2e green** (axe contrast, clipping, narrow viewport).
- Files: `bench/baseline/README.md`, `adrs/ADR-008-phase-0-baseline-method.md`, BUILD_LOG.
- Stop condition unchanged: Phase 0 exit item 3 open until `docs/BASELINE-METRICS-<stamp>.md` exists
  and ADR-008's verdict is filled.

## 2026-08-08 10:17 EDT — Baseline harness records the stack version by measurement

- Stage: Phase 0 exit item 3. Stock app came up clean on the shifted ports; ingress 8010, vite 3011,
  agent-server 18000, automation 18001.
- **First run revealed the version question ADR-008 anticipated.** The stock app pulled OpenHands
  SDK **1.40.1 from PyPI** — not the v1.41.0 agent-server image pinned in `docs/UPSTREAM_PINS.md`,
  and not anything implied by the v1.12.0 frontend. ADR-008 already decided the baseline uses the
  app's own backend; this is that decision producing a concrete version that must reach the report.
- Rather than have the operator transcribe it, `run_baseline.sh` now curls `/server_info` per task
  into the run directory, and `report.py` prints it under "Stack actually under test" — stating
  explicitly when it is missing, and refusing to present tasks as comparable if two different stack
  versions appear across them.
- Also observed at startup, recorded for the report's context: VSCode server binary absent, desktop
  and VNC disabled, and `ERROR Error preloading chromium` followed by "Tool preload service failed
  to start". The last one may affect browser-tool tasks; none of t01-t08 need a browser, but if a
  task fails on a browser tool this is the first thing to check.
- Tests 10 → 12; both new ones assert the absent case is called out rather than silently skipped.
- Files: `bench/baseline/run_baseline.sh`, `bench/baseline/report.py`,
  `bench/baseline/tests/test_baseline_harness.py`, `adrs/ADR-008-phase-0-baseline-method.md`.
- Stop condition unchanged.

## 2026-08-08 10:20 EDT — Fixture working-directory requirement (caught pre-run)

- Stage: Phase 0 exit item 3. Caught between the harness starting and the first turn being sent.
- The agent's working directory is `<stateDir>/workspaces` unless `VITE_WORKING_DIR` is set at
  launch (`dev-safe.mjs:672`, `dev-with-automation.mjs:442`, pinned SHA). The fixture would never
  have been touched and every task would have reported zero accepted lines with no error anywhere.
  Full entry in DEBUG_LOG.
- Fixed in two places: the launch command now requires `VITE_WORKING_DIR`, and `mark.py` refuses to
  let a no-op accept pass quietly. Documentation alone would not have caught the next occurrence.
- t01 attempt #1 abandoned as a harness fault; excluded from the report.
- Tests 12 → 13. Files: `bench/baseline/mark.py`, `bench/baseline/README.md`,
  `bench/baseline/tests/test_baseline_harness.py`, DEBUG_LOG.
- Stop condition unchanged.

## 2026-08-08 10:23 EDT — Automating the baseline run: stage 1 UI probe

- Stage: Phase 0 exit item 3. Operator asked for the run to be automated rather than driven by hand.
- **Two of item 5's metrics do not survive automation, and saying so is the point.**
  "Lines accepted WITHOUT INSPECTION" and "lost track" incidents measure operator behavior. An
  autonomous accept is not 100% uninspected; it is unmeasured. The driver will record them as null
  and `report.py` will state that those item-5 fields are unsatisfied by an automated run, rather
  than emit a 100% that reads like a finding. Item 6 (corrective instructions) is likewise
  unmeasurable without a human, since there is no operator to form a mental model.
- Everything else automates cleanly: time-to-first-review, turns, lines accepted (git), GPU
  temp/power, resident model, stack version.
- Driving the real UI with Playwright rather than the agent-server REST API, because the spec says
  "through the unmodified app" and the API path would measure the agent while skipping the thing
  under test.
- **Selectors are not guessable and were not guessed.** Stage 1 is `bench/baseline/ui/probe.mjs`, an
  evidence-gathering pass that reports data-testids, roles, accessible names, editable fields,
  console errors, and whether the working directory is visible in the page — plus full-page
  screenshots. The driver gets written against that output.
- The probe also checks whether the fixture path appears in the page text, so the driver can confirm
  the agent's working directory from the app's own view rather than from a process env var.
- Files: `bench/baseline/ui/probe.mjs`. No behavior change to the manual harness, which stays valid.
- Stop condition unchanged: Phase 0 exit item 3 open until the report exists and ADR-008's verdict
  is filled. ADR-008 will need an amendment recording which metrics an automated run can carry.

## 2026-08-08 10:26 EDT — Probe fixed and proven by execution

- Stage: Phase 0 exit item 3, automated driver stage 1.
- Two defects, both mine, both in DEBUG_LOG: ESM resolving from the file's directory rather than
  the cwd, and a `const URL` shadowing the global it needed one line earlier.
- **The first reached the operator's terminal because `node --check` passed and I treated that as
  verification.** Syntax checking says nothing about module resolution or temporal dead zones. Rule
  already adopted this session and violated here: no causal claim enters an artifact until it has
  been executed. A script handed over is a claim.
- Re-verified by running the probe against a throwaway local page that exercises every branch,
  including the click path and the working-dir detection, before asking for it to be re-run.
- Files: `bench/baseline/ui/probe.mjs`, DEBUG_LOG.
- Stop condition unchanged.

## 2026-08-08 10:31 EDT — Stage 2 probe: onboarding drive + conversation-view inventory

- Stage: Phase 0 exit item 3, automated driver stage 2.
- Stage 1 finding: the app at `localhost:8010` is on the **first-run onboarding screen**, never
  configured. 134 test ids, all stable and prefixed. Flow is three slides:
  `onboarding-step-choose-agent` -> `onboarding-step-setup-llm` -> `onboarding-step-say-hello`.
  Agent options: openhands (native SDK), claude-code, codex, gemini-cli.
- Consequence: **model configuration becomes part of the recorded baseline conditions** rather than
  something set by hand off-camera. Better for reproducibility, and it means the driver must fill
  the LLM form itself.
- Stage 1 could not confirm the working directory — `working dir visible in page text: NOT VISIBLE`.
  So stage 2's hello prompt is `pwd`, which settles it from the agent's own view instead of from a
  process env var.
- **The open question stage 2 exists to answer:** whether Agent Canvas gates edits behind an
  explicit accept, or the agent writes files directly. OpenHands agents generally do the latter. If
  there is no accept gate then "turns to acceptance" and "lines accepted" do not mean what the
  manual harness assumed, and both `mark.py` and ADR-008 need amending. The probe reports the
  accept/approve vocabulary present in the settled conversation view rather than assuming either.
- Also reports what signals "first reviewable proposal" and "done", since without a reliable pair
  there is no time-to-first-review and no turn boundary to count.
- Verified by execution against a stand-in page reproducing the stage-1 test ids: all three
  onboarding steps drove, the path detector fired, the gate detector correctly reported a planted
  accept button, and the dump was written. Not syntax-checked-and-shipped.
- Files: `bench/baseline/ui/probe2.mjs`.
- Stop condition unchanged: Phase 0 exit item 3 stays open until the report exists and ADR-008's
  verdict is filled.
- **Open question for the operator, flagged not assumed:** which model the baseline runs. ADR-005's
  pair is planner `qwen3.6:27b` / coder `qwen3.6:35b-a3b-mtp-q4_K_M`, but the 35b falsification is
  recorded and the 27b-vs-35b planner comparison is awaiting an operator call. The stock app takes
  one model, so this is a single choice and it is spec-flagged. Probe defaults to the coder via
  `OH_GUI_BASELINE_MODEL` purely so the probe can run; the baseline model is not thereby decided.

## 2026-08-08 12:59 EDT — Stage 2 run 1: blocked by CORS, no valid findings

- Stage: Phase 0 exit item 3, driver stage 2.
- Run produced NO usable answer. `localhost` vs `127.0.0.1` origin mismatch killed every
  `/api/conversations` call; the probe never left onboarding. See DEBUG_LOG 12:58 EDT.
- **The output's `accept vocabulary: NONE` line is discarded, not recorded.** It was the answer to
  the question stage 2 exists to answer and it was produced by looking at the wrong screen.
  Nothing about the accept gate, the working directory, or the conversation view is known yet.
- Probe hardened: CORS/ERR_FAILED now checked before the wait loop and reported as fatal, with an
  explicit line saying nothing after it describes a conversation.
- Carries a warning for the manual harness too: a hand-driven run at `localhost:8010` would hit the
  same wall and produce a self-consistent baseline of zeros. Second silent-zeros trap in this
  harness after the unset `VITE_WORKING_DIR`.
- Operator decision recorded: baseline is a **2x8 matrix**, `qwen3.6:27b` and
  `qwen3.6:35b-a3b-mtp-q4_K_M`, 8 tasks each, run sequentially — 26,140 + 26,390 MiB cannot
  co-reside on a 32,607 MiB card, so the driver must `ollama stop` between models given
  `OLLAMA_KEEP_ALIVE=-1`. ADR-008 becomes a comparison; restructure deferred until the accept-gate
  question is actually answered.
- Files: `bench/baseline/ui/probe2.mjs`, DEBUG_LOG.
- Stop condition unchanged.

## 2026-08-08 13:14 EDT — Reference-app backend pin recorded; version-skew hypothesis refuted

- Stage: Phase 0 exit item 3.
- `config/defaults.json` in Agent Canvas v1.12.0 sets `versions.agentServer = "1.40.1"`, consumed
  by `dev-safe.mjs` and applied to all four SDK packages in lockstep. The running 1.40.1 backend is
  **upstream's intent, not uvx drift**.
- **This refutes the hypothesis I was leading with**, that the 500 came from a v1.12.0 frontend
  against a stale backend, and it vindicates ADR-008 decision 3 (use the app's own backend). The
  app is running the pair upstream shipped. No ADR amendment needed on that point.
- **A claim I made and am retracting:** I said `docs/UPSTREAM_PINS.md` was "wrong" for recording
  v1.41.0. It is not. That section pins the container image OH-GUI will run per ADR-001 item 2, a
  different artifact from the reference app's dev backend. I called it wrong before reading it.
  Added a new section recording the dev-mode pin instead of changing the image pin.
- Also verified before recommending it: the `OH_AGENT_SERVER_VERSION` override branch pins all four
  packages to the same version rather than only agent-server, so testing 1.41.0 produces a coherent
  environment. Read `buildAgentServerCommand` in full rather than assuming symmetry with the
  default branch.
- No upstream issue exists for `'Server' object has no attribute 'list_tools'` in either
  OpenHands/OpenHands or OpenHands/software-agent-sdk. If 1.41.0 fixes it we have a clean
  reproduction worth filing; if not, we need the traceback.
- Files: `docs/UPSTREAM_PINS.md`.
- Stop condition unchanged.

## 2026-08-08 13:30 EDT — Accept gate answered on valid evidence; workspaces found; conditions set

- Stage: Phase 0 exit item 3.
- **1.41.0 fixes the 500.** Root cause identified rather than guessed: the succeeding log line is
  `Processing request of type ListToolsRequest` -> `Created 21 MCP tools`, which is exactly the
  call that raised `'Server' object has no attribute 'list_tools'` on 1.40.1, whose sole release
  note was `fix(mcp): reconcile live agent tool snapshots`. `OH_AGENT_SERVER_VERSION=1.41.0` is now
  mandatory for baseline runs, a deliberate one-patch deviation from what v1.12.0 pins.
- **NO ACCEPT GATE — and this time the precondition holds.** probe3 asked for a real file write.
  The agent wrote `probe_calc.py` unprompted, it appears as `file-quick-row-item-probe_calc.py`,
  and no accept/approve/confirm/apply vocabulary appeared at any point. Consistent with
  `Confirmation policy set to: kind='NeverConfirm'`. The two earlier NONE readings are still
  discarded: one came from onboarding and one from a read-only task, neither of which could have
  produced a gate. Same answer, but only this one is evidence.
- Consequence for ADR-008 item 5: `turns_to_acceptance` and `lines_accepted_without_inspection`
  have no gate to hang on in the reference app. They must be redefined against what actually
  exists (the agent writes, the operator reviews after the fact via the Files tab diff) or
  recorded as not-applicable. Not silently zero.
- **Workspaces are a first-class concept.** The new-thread popover exposes `add-workspaces-button`,
  `launch-no-workspace`, and an input reading "Local". If a workspace can be registered at the
  fixture path, that is the app's own supported way to set a working directory and it replaces the
  plan to copy the fixture into the per-conversation subdir behind the app's back. probe4 written
  to inventory that flow read-only, stopping before it commits anything.
- **MCP disabled for baseline runs** via `bench/baseline/mcp_baseline.sh off`, backed up and
  reversible. Chosen over repointing Serena at the fixture or leaving it on forge-oh: a baseline
  exists to be compared against later numbers, and the alternatives make every measurement depend
  on a pinned third-party MCP commit and a foreign repo's index. Leaving it as-is would also have
  given the agent editable symbol tools over forge-oh during eight write tasks.
- **All test runs are now recorded.** `bench/baseline/ui/session.mjs` captures a Playwright trace
  (DOM snapshot before and after every action, plus network and console), a video, and screenshot
  checkpoints. `watch.sh` replays the latest run. Reason: the operator was auditing my written
  summary of each run rather than the run, and three findings today were wrong for that reason.
- Two probe defects fixed, both mine: probe3 timed out clicking a Files tab that was already open
  and whose control sits under an overlay outside the viewport (check the destination, not the
  control); and the 5s poll reported first-agent-message and status->idle at an identical 44.0s,
  a resolution artefact rather than a measurement. Now 1s.
- Minor, worth noting for local-first: the app requests
  `https://registry.npmjs.org/@openhands/agent-canvas/latest` on load. OH-GUI must not phone home.
- Files: `bench/baseline/ui/{session.mjs,probe3.mjs,probe4.mjs,watch.sh}`, `bench/baseline/mcp_baseline.sh`.
- Stop condition unchanged: Phase 0 item 3 open.

## 2026-08-08 13:44 EDT — Workspace selection answered; the agent works IN the fixture

**Stage:** Phase 0, item 3 (baseline metrics) — ADR-008.
**Files:** `bench/baseline/ui/probe5.mjs` (new), `seed_fixture.sh`, `run_baseline.sh`,
`mcp_baseline.sh`, `ui/probe{2,3,4}.mjs`, `README.md`, `DEBUG_LOG.md`.

**Executed, not inferred** (probe5 run 20260808T174224):
- `pwd` → `/home/rmholston/oh-gui-baseline/fixture`. No per-conversation subdirectory.
- `ls -a` → `.git .gitignore README.md notes_api requirements.txt tests` — the real fixture.
- On-disk contents unchanged after the run.

**Why this matters:** it is the OPPOSITE of `VITE_WORKING_DIR`, where the agent got a fresh empty
subdir and never saw the fixture. Selecting a workspace puts the agent in the directory itself, so
the eight tasks are viable — and the driver MUST restore the fixture between all sixteen runs or
task N+1 inherits task N's edits. The fixture is a git repo with a seed commit, so
`git reset --hard && git clean -fd` is the restore.

**Other observations from the same run:**
- Launch control is `launch-workspace` — generic, not per-workspace. Fine with one workspace;
  needs disambiguation if a second is ever registered. Also present: `manage-workspaces-button`.
- Re-adding the same folder produced ONE entry, not two. The app dedupes.
- `/api/workspaces`, `/api/conversations/workspaces`, `/api/settings` all returned **401** from the
  page context. Server-side ground truth is not available without a session key, so UI assertions
  cannot currently be cross-checked against the server.
- Submit→idle for a trivial `pwd`+`ls`: 31.9s → 42.1s.

**Fixture relocated** to `~/oh-gui-baseline/fixture` — the Add Workspace browser lists no
dot-entries and has no path input, so the old `~/.oh-gui/baseline/fixture` was unreachable through
the app's own mechanism. Path is now `${OH_GUI_BASELINE_FIXTURE:-...}`, one override point.

**Stop condition:** Phase 0 item 3 still OPEN. Blocking work is now the driver itself: no unknowns
remain about how to put the agent in front of the fixture.

## 2026-08-08 13:50 EDT — Automated driver; 27b profile created; matrix runner

**Stage:** Phase 0, item 3 (baseline metrics) — ADR-008.
**Files:** `bench/baseline/ui/{probe6,drive_task}.mjs` (new), `run_matrix.sh` (new),
`run_baseline.sh` (--auto/--profile), `~/.openhands/profiles/qwen3.6-27b.json` (outside repo).

**Model selection, measured:** options carry stable ids
`chat-input-llm-profile-option-<profile-name>`, so selection does not depend on label matching.

**Half the matrix was impossible and nothing said so.** Only two profiles existed: `default`
(`openai/devstral-small-2:24b`) and the 35b. There was no 27b profile. Had the driver fallen back
to `default`, it would have benchmarked devstral and labelled the output 27b — a complete,
plausible, wrong report. Created `qwen3.6-27b.json` by cloning the 35b profile and changing
exactly one field (`model`), verified: `fields differing from the 35b profile: {'model'}`. The app
picked it up with no restart. `qwen3.6:27b` is pulled (17 GB).

**Guard added because of that:** the driver selects the profile, then re-reads the label and
aborts if it did not change. Selecting and assuming is exactly how sixteen cells silently run on
one model.

**Instrumentation is not duplicated.** `--auto` swaps `mark.py` for `drive_task.mjs` and nothing
else; the GPU guard, cold wait, 1 Hz thermal CSV, `ollama ps` sampler and `server_info` capture
still wrap every cell, so automated and hand-driven runs stay comparable.

**Null, never zero.** `time_to_first_review_s`, `turns_to_acceptance`, `lines_accepted`,
`lines_accepted_without_inspection`, `accepts`, `accepts_without_inspection`,
`lost_track_incidents`, `turns_before_first_corrective` are emitted as null. They are human
judgements, and two have no accept gate to attach to at all. `lines_written` is reported instead,
read from git — a different and weaker claim, labelled as one.

**Objective signals per cell:** fixture restored to seed `99a628b` and asserted clean before each
task; git numstat plus untracked files after; `pytest` run in the fixture (pass/fail/not-run).

**Stop condition:** unchanged — Phase 0 item 3 OPEN until the matrix runs and
`docs/BASELINE-METRICS-*.md` exists with ADR-008's verdict filled in. Next action is a single-cell
smoke test, not the full sixteen.

## 2026-08-08 14:13 EDT — First clean automated cell (t01 / qwen3.6-27b)

**Stage:** Phase 0, item 3 — ADR-008. Run `~/.oh-gui/baseline/20260808_1411_run`.

`outcome=completed` · 4 turns · 2 files · +18/-0 · **tests=pass** (real venv: fastapi 0.141.1,
pytest 9.1.1) · submit 20.7s → first agent message 73.7s → idle 97.1s · fixture restored to
`d63c775` and asserted clean first · **only `qwen3.6:27b` resident for the whole cell** · GPU peak
67C, 0 samples ≥80C, 0 thermally throttled, 55 power-capped at the 435 W cap.

All four things that were wrong in the previous run are now right, verified in output rather than
asserted: profile set before the conversation exists (no "Switched to profile" in the transcript),
no stray 35b load, `Agent error` recorded as non-fatal at 47.1s with the run continuing through it,
and the test signal coming from a venv that actually has fastapi.

**Correction to my own fix, so it is not overstated:** switching the status icons to `isVisible()`
did NOT make them discriminate — the heartbeat still prints
`visible-status=working,active,check,error`, all four, in a healthy run. The signal that actually
works is `stop-button` visibility, which flipped RUNNING→idle correctly. The status list is
decoration in the heartbeat, not a state source, and nothing should be built on it.

**Open, not blocking:** an `Agent error` event appears mid-run in both t01 runs. The agent recovers
and completes. Recurring at a fixed point suggests a real underlying tool failure worth diagnosing
once the matrix is recorded — `error_events_seen` now captures it per cell.

**Stop condition:** item 3 still OPEN. Harness is proven on one cell; the matrix has not run.

## 2026-08-08 14:36 EDT — ADR-009 drafted: Qwen3.6 sampling and MTP asymmetry

**Stage:** Phase 0 (research conducted while the matrix ran; nothing changed mid-run).

Verified on Colossus: both profiles are byte-identical except `model` and **neither sets any
sampling parameter**, so Ollama's baked-in values govern. `ollama show --parameters` gives both
models `temperature 1, top_p 0.95, top_k 20, min_p 0, presence_penalty 1.5, repeat_penalty 1` —
Qwen3.6's *thinking-general* preset — while Qwen's *coding* recommendation is
`temperature 0.6, presence_penalty 0.0`. The only parameter differing between the two models is
`draft_num_predict 4`, present on the 35b only: the 35b has MTP (~1.4-2.2x generation speed, no
accuracy change) and the 27b does not.

Good news for the matrix: the config axis is clean — one variable, `model`. Bad news: that
variable bundles MTP with the 35b, so tok/s understates the 27b and cannot be reported without
the caveat.

Also recorded as UNVERIFIED, not assumed: `reasoning_effort: "high"` and
`extended_thinking_budget: 200000` are Anthropic/OpenAI-shaped fields and `drop_params: true` may
discard them before they reach Ollama. Nobody has measured whether they do anything here.

Filed `adrs/ADR-009-qwen3.6-sampling-and-mtp.md` (Proposed), index updated. Four follow-up runs
proposed, each isolated — changing sampling and MTP together would make both unmeasurable.

**Stop-condition status:** Phase 0 item 3 still OPEN, matrix in flight. ADR-009 does not block it.

## 2026-08-08 16:05 EDT — ADR-010 filed: Phase 0 stays open for MTP parity

Operator: Phase 0 cannot close until the optimised variants are pulled and benchmarked. Correct.
The running matrix compares `qwen3.6:27b` (no MTP heads) against `qwen3.6:35b-a3b-mtp-q4_K_M`, so
its tok/s figures understate the 27b by the MTP factor Unsloth documents as ~1.4-2.2x. The quality
scores already sit inside the tie band at `precise` (27b 64 vs 35b-mtp 62), which means the routing
decision falls to speed — the one axis this matrix measures unfairly.

Decision: a third 8-cell block on `qwen3.6:27b-mtp-q4_K_M` (18 GB, verified present in the Ollama
library). Speed comparisons for routing are drawn MTP vs MTP; the plain-27b block is kept because
27b vs 27b-mtp is the only clean measurement of what MTP is worth on this hardware. `27b-mtp-q8_0`
(30 GB) rejected on VRAM — no KV budget left against 32 GB.

`run_matrix.sh` and `preflight.sh` already read `OH_GUI_BASELINE_PROFILES`, so no code change.
Files: `adrs/ADR-010-mtp-parity-in-the-baseline.md`, `adrs/README.md`.

Pull deferred until the running matrix finishes — an 18 GB download writing to disk during a run
contaminates the wall-times being measured, and the GPU is not free for the third block regardless.

Stop condition: Phase 0 item 3 remains OPEN. Three blocks required, not two.

## 2026-08-08 16:05 EDT — Severity colour in harness output

Operator request. Green as expected, yellow the MODEL did poorly or something is UNKNOWN, red the
HARNESS or MACHINE is wrong and the cell is not trustworthy. The useful line is whose fault it is,
not how bad it sounds: a model failing its task is the measurement, so it is yellow; a gate that
cannot run, a workspace mismatch, or a thermal ceiling breach invalidates the cell, so it is red.

`lib/colors.sh` and `ui/colors.mjs` share the palette. Both honour NO_COLOR and disable themselves
when stdout is not a TTY, so `tee` to a log file stays clean; `OH_GUI_COLOR=1` forces, `0` disables.
Applied to preflight's ok/warn/FAIL, the PASS/FAIL banner, and the GPU verdict lines in
`bench/lib/gpu.sh` (ceiling breach and thermal throttling red, warm yellow, fine green).

## 2026-08-08 16:15 EDT — tok/s cannot come from the agent loop; separate instrument built

ADR-010 needs tok/s to compare 27b against 27b-mtp. The agent harness cannot supply it. The
conversation event log records `completion_tokens: 0` and `prompt_tokens: 0` on every call — Ollama
through litellm is not reporting usage — with only sporadic `reasoning_tokens`. Nothing else in the
harness counts tokens.

Wall-clock is not a substitute. Time-to-idle in an agent run is dominated by tool calls, file I/O
and retries after malformed tool-call JSON (measured today, present on nearly every cell). Two
questions, two instruments:

- the matrix -> does the model DO THE TASK (acceptance)
- `bench/mtp/` -> how fast does it GENERATE (throughput)

`bench/mtp/bench_mtp.py` drives Ollama's `/api/generate` directly and reads `eval_count` and
`eval_duration`, which under MTP count ACCEPTED tokens — the real speedup, not a theoretical one.
Prompts on disk (`short_gen`, `long_gen`, `prefill_heavy`), one JSON per cell, sampling pinned to
the ADR-009 values so a Modelfile change cannot silently move the baseline, `seed` fixed, models
unloaded between tags because two 18-23 GB models will not co-reside in 32 GB. GPU discipline per
standing rule: 45C cold gate before each cell, abort at 83C, temperature recorded per cell.

`bench/mtp/summarize_mtp.py` reports median tok/s and the speedup, and pairs ONLY a plain tag with
its own MTP variant — dividing 35b by 27b would repeat the exact error ADR-010 exists to prevent.
5 tests; one caught a real defect where the thermal summary disappeared whenever no plain/MTP pair
was present, which is the single-model case.

`bench/baseline/compare_blocks.py` puts the matrix blocks side by side, flags the MTP boundary, and
suppresses cross-boundary speed comparison. It states plainly that nothing in that harness counts
tokens, so no tok/s figure may be quoted from it.

Colour applied to the driver (`ui/colors.mjs`): workspace confirmed green, unverified yellow,
mismatch red; recorded model errors yellow; the outcome line via `outcomeLine()` so a harness fault
reads UNKNOWN in red rather than a plausible-looking `ACCEPTED=no`. 11 tests, including that no
escape codes survive a pipe. Baseline suite 57, mtp suite 5.

Stop condition: Phase 0 item 3 OPEN. Needs the third matrix block AND the MTP microbench.

## 2026-08-08 16:32 EDT — Matrix run 3 complete; acceptance is a tie

Both blocks 7/8. `qwen3.6-27b` missed t01 on a regression (gate passed, fixture tests failed);
`qwen3.6-35b-a3b-mtp-q4_K_M` missed t08 with turns=1, files=0 — it did not attempt the task, which
is not the same kind of miss and is reported as UNKNOWN rather than a quality failure.

Thermals were a non-issue: peak 75C, zero samples at or over 80C, zero throttled samples across all
sixteen cells. The 45C cold gate holds.

Acceptance being tied is precisely the condition ADR-010 anticipated: the decision falls to speed,
and these two models are not speed-comparable. Wall-clock differed sharply (783s vs 386s) but that
is equally explained by MTP or by a 3B-active MoE, and the harness counts no tokens, so
`compare_blocks.py` suppresses the comparison rather than reporting it.

Fixed the cid nesting defect above; reports and comparison regenerated.
Suites: baseline 61, mtp 5.

Stop condition: Phase 0 item 3 OPEN. Blocking on the MTP microbench, then the third matrix block.
