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

