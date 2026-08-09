<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Original filename : Forge-OH-Improvements-Research-Model-Council-Synthesis.md
Origin            : Forge-OH, the predecessor project. Supplied by the operator on 2026-08-09 01:01 EDT.
Filed by          : agent, verbatim, unmodified below the marker line.
sha256 (body)     : 90e0b65360540f17
Why filed         : Deep research + three-model council, 2026-08-06. Source of the Stage 7.0-7.9 backlog. Referenced by Forge-OH ADR-029 and previously believed unrecoverable.

Standing rules for this directory (docs/donor-specs/):
  1. The body below the marker is the operator's document. Never edit it, never "correct" it,
     never summarise it in place. Disagreements go in an ADR that cites this file, not in edits.
  2. Nothing here is a specification of OH-GUI. These are donor documents. A statement becomes
     binding on OH-GUI only when an ADR or a file under docs/specs/ adopts it.
  3. Every OpenHands API, field, or extension surface named below is UNVERIFIED until checked
     against review/_sdk_src/ per ADR-015. Documentation is not verification.
  4. These files exist because iterating a spec drops information. Source-shaped memory is the
     structural fix; summary-shaped memory is what failed.
-->

<!-- ===================== VERBATIM DONOR DOCUMENT BELOW ===================== -->

# Forge-OH Improvements — Deep Research + Model Council (2026-08-06)

**Baseline being improved:** Forge-OH v0.9-ish (post-Stage-6, OpenHands agent-server 1.40.0 + Qwen3.6-27B AWQ-4 as `c01`, `c02` planner), SWE-bench Verified 30-task smoke **pass@1 = 26.7% → 33.3%** (post-6.7 code-execute run 2026-08-06 12:11 EDT).

**Ask:** rank top-3 highest-ROI improvements per axis (Coder / Debugger / Planner / Learner / Infrastructure), run through Model Council, log for a future implementation slice.

**Sources:** deep-research subagent output `research_output.md` (15 recommendations, 8158 words, primary-source cited); Model Council members Claude Fable 5, GPT 5.6 Sol, Gemini 3.1 Pro; Forge-OH inventory in `research_ctx/`.

**Constraints held throughout:** single RTX 5090 32 GB VRAM, local-first, permissive OSS, 1-3 slice actionability, honest transfer-risk assessment.

---

## TL;DR — the final ranked plan (council-adjusted)

The council's convergent verdict overturns the researcher's ordering. Instead of "top-3 per axis," the correct decomposition is **three horizontal capability layers**, all three council members agreeing on the substance if not the exact ordering:

1. **Measurement + serving-infra first** (1 slice) — APC, fp8 KV-cache, chunked prefill, spec-decode as a config bundle + expand smoke set / add paired McNemar telemetry.
2. **Hermetic verification primitive + bounded execution-grounded repair loop** (2 slices) — the shared test-run-fix runner is the single highest-ROI capability, harvested across the Coder, Debugger, and Best-of-N items.
3. **Selection layer: execution-first gates + LLM-as-judge for ties** (1-2 slices) — replaces `CodeT dual-execution` and the raw `best-of-N` with a stack-matched verifier pattern (SWE-Gym evidence).

Everything else (Agentless localization, SBFL, plan-and-execute, ACE playbook, RepoCoder) is downstream of these three layers and should be sequenced after them. **Axis 3 (Planner) is the lowest-ROI axis at 27B AWQ-4** — deferred behind Axes 1/2/5.

---

## Council models consulted

- **Claude Fable 5** — critique focused on category omissions, statistical power, and ranking-thesis contradictions ([forge-oh-council-claude_fable_5-2026-08-06.md](./forge-oh-council-claude_fable_5-2026-08-06.md)).
- **GPT 5.6 Sol** — critique focused on transfer-probability calibration, interaction effects, and cost-per-solved-task reframing ([forge-oh-council-gpt_5_6_sol-2026-08-06.md](./forge-oh-council-gpt_5_6_sol-2026-08-06.md)).
- **Gemini 3.1 Pro** — critique focused on SWE-bench 2026 SOTA scan, OpenHands SDK-native features, and vLLM 0.10+ features ([forge-oh-council-gemini_3_1_pro-2026-08-06.md](./forge-oh-council-gemini_3_1_pro-2026-08-06.md)).

## Where the council agrees

| Finding | Claude Fable 5 | GPT 5.6 Sol | Gemini 3.1 Pro | Evidence |
|---|---|---|---|---|
| The single highest-ROI missing capability is a **hermetic execution-grounded repair loop** (validate → diagnose from real failure → patch → re-validate), not any localization scaffold | ✓ | ✓ | ✓ | Agentless validation ablation, [arXiv:2407.01489](https://arxiv.org/abs/2407.01489); OpenSWE 62.4% pass@1 relies on iterative repair, [arXiv:2603.13023](https://arxiv.org/abs/2603.13023); [Chen et al. Self-Debugging arXiv:2304.05128](https://arxiv.org/abs/2304.05128) |
| **vLLM serving-infra wins (APC + spec-decode + fp8 KV-cache + chunked prefill) go first** as a config bundle, before any capability work | ✓ | ✓ | ✓ | [vLLM APC docs](https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/); [vLLM spec-decode docs](https://docs.vllm.ai/en/latest/features/speculative_decoding/); [vLLM fp8 KV blog 2026-04-22](https://vllm.ai/blog/2026-04-22-fp8-kvcache) |
| The report's **CodeT (Axis 1.2) picks the wrong best-of-N mechanism**; replace with LLM-as-judge / verifier-based selection because generated-repo-tests are the weakest 27B capability | ✓ | ✓ | ✓ | [SWE-Gym arXiv:2412.21139](https://arxiv.org/abs/2412.21139): 32B Qwen verifier lifted SWE-bench 20.6→32.0%; [Mathews & Nagappan arXiv:2412.14137](https://arxiv.org/abs/2412.14137) shows generated-test oracle risk |
| **Axis 3 (Planner) is over-ranked**; plan-and-execute split should NOT be #1 anywhere until validate-retry exists | ✓ | ✓ | ✓ | [Agentless arXiv:2407.01489](https://arxiv.org/abs/2407.01489) contradicts the "add roles" thesis; [Olausson et al. arXiv:2306.09896](https://arxiv.org/abs/2306.09896) shows weak-model self-critique often gains nothing |
| **RepoCoder (Axis 1.3) is redundant** under oracle-retrieval and duplicates Axis 4.3 (memory re-query) under Path B | ✓ | ✓ | ✓ | [RepoCoder arXiv:2303.12570](https://arxiv.org/abs/2303.12570); the incremental "iteration 2 over one-pass RAG" gain is ~1-4pt, not >10pt |
| The report **omits fp8 KV-cache** despite KNOWN_ISSUES.md naming it as the 32k-ceiling remedy | ✓ | ✓ (implicitly, in cost-per-solve context) | ✓ (explicit: chunked prefill is the same class of miss) | [vLLM fp8 KV-cache blog](https://vllm.ai/blog/2026-04-22-fp8-kvcache) |

## Where the council disagrees

| Topic | Claude Fable 5 | GPT 5.6 Sol | Gemini 3.1 Pro | Why they differ |
|---|---|---|---|---|
| **Sequence order of the first 5 slices** | Config bundle → measurement hardening (Slice 0.5) → shared runner → validate-retry → verifier BoN → SBFL | Hermetic runner + telemetry first (uplift = 0, but enabling value = infinite) → bounded N=1 repair → adaptive N=2 selector → SBFL fusion → runtime bundle | vLLM chunked prefill / APC as Slice 0 (zero code) → Iterative Chain-of-Repair via SDK Pluggable Runtime as #1 → tree-sitter + Microagents | Different definitions of "prerequisite" — Fable weights measurement (n=30 SE ±8.1pt is fatal), Sol weights the verifier primitive itself as the true bottleneck, Gemini weights the *framework-native* path (uses what OpenHands ships) |
| **Should Agentless-style localization ship at all?** | Keep, but honestly framed as "validate-retry loop, not localize" for the current oracle-retrieval regime | Bounded N=1 repair loop captures the transferable part; skip Agentless's 80-candidate budget | Yes, but hierarchical repo→file→function search backed by **tree-sitter**, not LLM file reading | Fable and Sol converge on "the localize half is redundant vs. oracle baseline"; Gemini's angle is that tree-sitter makes localization cheap enough to include unconditionally |
| **How to handle Axis 3 Planner** | Demote 3.1 to non-#1, promote 3.3 (Self-Refine) as the cheapest falsifiable experiment, sequence axis LAST | Uncertain transfer on all Axis 3 items; skip planner calls entirely for localized/simple issues | Replace custom plan-and-execute with **OpenHands Microagents**, which ship the primitive natively | Fable and Sol argue for less planning; Gemini argues the planning is already handled if you use SDK-native features rather than building custom |
| **How much to trust the report's cited numbers** | Every single number is unmeasurable at n=30 SE ±8.1pt (McNemar / bootstrap CI required) | 5-point transfer-probability table: only APC, spec-decode, and Chain-of-Repair rate "Very likely"; CodeT / ToT / Self-Refine flagged "Unlikely" or "Uncertain" | Numbers not litigated directly; instead points at the current 2026 SOTA (OpenSWE-32B 62.4%, OpenSWE-72B 66.0%) as the actual ceiling for this model class | Fable brings statistical rigor, Sol brings mechanism-transfer analysis, Gemini brings leaderboard-grounded reality-check |
| **The right cost objective** | Cost-per-solved-task should be tracked; latency multipliers compound catastrophically | GPU-seconds and joules per solved task, not credits — Colossus runs local | Not addressed directly | Fable and Sol converge; Gemini treats infra wins as automatic under any objective |
| **Constrained decoding / edit-format schemas** | 1 slice, measure "patch applies cleanly" rate, honest transfer caveat from Diff-XYZ | Constrain the *protocol* (tool-call JSON, edit schema), not source code, via vLLM XGrammar | vLLM Guided Decoding via `GuidedDecodingParams` at engine level, offloading tool-call parsing to vLLM | All three agree in kind, disagree on framing (Fable: aider-style; Sol: XGrammar; Gemini: engine-level tool parser) |

## Unique discoveries

| Model | Unique finding | Why it matters |
|---|---|---|
| Claude Fable 5 | **Doc-internal inconsistencies**: (a) AutoCodeRover summary row says "22.33%→30.67% pass@1" but detail correctly reports pass@1 ablation as 17.00%→20.33% and 30.67% as **pass@3**; (b) Semantic Voting "19-52 percentage points" quoted as absolute in §1.2 and as *relative margin* in §5.3 | A synthesizer quoting only the summary tables would carry away 3× inflated, unit-confused numbers — the report needs a table-vs-body reconciliation pass before any commit reads from it |
| Claude Fable 5 | **Statistical power kill-shot**: at p=0.267 with n=30, standard error is √(0.267·0.733/30) ≈ **±8.1pt** (95% CI ±16pt); one task = 3.3pt. "+3-5pt" uplift claims are statistically undetectable on the current eval | Every ranking below the top 2-3 items is measurement noise on the current smoke set — need Slice 0.5 (measurement hardening: paired seeds, McNemar's test, bootstrap CI, expand toward n≈100) before capability slices are falsifiable |
| Claude Fable 5 | **Oracle→Path B regime shift is never modeled** — half the rankings invert when oracle retrieval is removed | The current 33.3% baseline is Path A (oracle-retrieval); Path B (autonomous localization) is the real deployment target. Localization scaffolds (Agentless, RepoCoder, SBFL) are worth ~zero on Path A and mission-critical on Path B |
| Claude Fable 5 | **OpenHands condenser `keep_first=4`** preserves the system+task prefix, so condensation can be *configured* to preserve the APC cache prefix rather than assumed to break it | Direct mitigation for the "condenser breaks APC" concern GPT 5.6 Sol raised independently; converts a supposed interaction-cancellation into a configurable interaction-compound |
| GPT 5.6 Sol | **DARS (dynamic action re-sampling)**, [arXiv:2503.14269](https://arxiv.org/abs/2503.14269) — a 27B-defensible o1-style test-time-compute approach at trajectory checkpoints, not raw best-of-N; and **SWE-Reasoner** ([arXiv:2503.23803](https://arxiv.org/html/2503.23803v2)) 32B system 46% at budget 8 using PRM-guided beam search | Fills the gap between "cheap best-of-N" and "expensive full RL" that the report leaves unexplored; correct scale for Forge-OH's 27B budget |
| GPT 5.6 Sol | **TVCACHE** ([arXiv:2602.10986](https://arxiv.org/abs/2602.10986)) — up to 70% hits and 6.9× median tool-call speedup with stateful pure-tool-result caching keyed by `(worktree commit, cwd, args, env fingerprint)` — with the explicit warning that naïve arg-only caching is *incorrect* | Attacks cost-per-solved-task directly with no accuracy risk; every read/search/test that Forge-OH runs is a candidate for memoization |
| GPT 5.6 Sol | **CodeJudgeBench** ([arXiv:2507.10535](https://arxiv.org/abs/2507.10535)) — pairwise judging beats pointwise, and Qwen3-8B thinking can beat larger specialist judges | Concrete design guidance for the LLM-as-judge tie-breaker: pairwise not pointwise, potentially small sequential-load judge model |
| Gemini 3.1 Pro | **2026 SWE-bench SOTA scan**: OpenSWE-32B **62.4%**, OpenSWE-72B **66.0%** on SWE-bench Verified (Qwen2.5 base) trained on 45,320 executable Docker environments | Sets the realistic ceiling for Forge-OH's model class — the target isn't "better than 26.7% baseline" it's "closable gap to 62%" if we adopt search-based scaffolding, tree-sitter localization, and iterative repair; MASAI's 28.33% Lite validates modular pluggable-runtime approaches |
| Gemini 3.1 Pro | **`pytest-testmon` + `pytest-xdist`** — dependency-tracked incremental test selection + parallel execution; shrinks the debugger validation loop from minutes to seconds | Deterministic, non-LLM cost win that stacks with every other item in the plan; directly addresses the wall-time tail seen in the 33.3% run (matplotlib-24570 at 35s, requests-6028 at 55s, xarray at 53s) |
| Gemini 3.1 Pro | **vLLM Chunked Prefill** (`long_prefill_token_threshold`) as the *direct* fix for the 32k context ceiling — trades slight latency for higher context capacity on constrained VRAM | Complements fp8 KV-cache (which Fable independently flagged); together they're a two-flag fix for the 4 out of 30 tasks currently context-budget-skipped |
| Gemini 3.1 Pro | **OpenHands Microagents + Context Condensation + Pluggable Runtime** are SDK-native primitives that make ~half the report's custom scaffolding unnecessary | Fights the framework less; the same functional gains ship with zero custom code — check what OpenHands 1.40+ already provides before building |

## Comprehensive analysis

### The high-confidence, do-this-now findings

Three items converge across all three council members with high confidence and directly attack Forge-OH's currently observed pain points:

**A. Hermetic execution-grounded repair loop as the shared primitive.** All three council members put this at or near the top. The current baseline is single-shot: `c01` gets the oracle files + task, emits a patch, and we score `resolved` at the SWE-bench harness boundary. Every improvement axis funnels back to *"do that again with feedback."* Claude Fable 5 frames it as "the validate-retry half of Agentless." GPT 5.6 Sol frames it as "the transferable core of Agentless without the 80-candidate budget." Gemini 3.1 Pro frames it as "iterative Chain-of-Repair via the OpenHands Pluggable Runtime." Same primitive under three names. Evidence: Agentless's cleanest ablation is 25.67% → 32.0% ([arXiv:2407.01489](https://arxiv.org/html/2407.01489)), Self-Debugging up to +12% ([arXiv:2304.05128](https://arxiv.org/abs/2304.05128)), and — most importantly for Forge-OH's scale — OpenSWE 62.4% on SWE-bench Verified with Qwen2.5-32B base uses exactly this pattern ([arXiv:2603.13023](https://arxiv.org/abs/2603.13023)). Sol's honest transfer estimate: **+3-7pt at 2-3× generation/test time**, gated on full-500 confirmation, not the smoke-30 SE ±8.1pt band.

**B. Serving-infra config bundle first.** Zero-code slice: enable APC + spec-decode + fp8 KV-cache + chunked prefill in one vLLM restart. APC ([docs](https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/)) attacks the dominant prefill cost on the long repo contexts we're already sending. fp8 KV-cache ([vLLM blog](https://vllm.ai/blog/2026-04-22-fp8-kvcache)) drops per-token KV memory to ~54% of BF16 — recovering the 4/30 context-budget-skipped tasks currently costs us ~13% of the eval. Chunked prefill ([vLLM 0.10+](https://digitalbourgeois.tistory.com/1929)) is the direct complement. Spec-decode is "modest" per vLLM's own docs but stacks with the others at zero VRAM. Two caveats: (a) validate before/after on the same 30-task smoke to catch the fp8 KV long-context accuracy regression that vLLM has documented on some kernel/GPU combos; (b) the OpenHands condenser's `keep_first=4` setting must be aligned with the APC prefix boundary or condensation will invalidate the cache.

**C. Selection layer built on execution-first gates + LLM-as-judge for ties, not CodeT.** The report's #2 pick in Axis 1 (CodeT) is wrong. Three converging arguments: (i) CodeT depends on the model generating plausible repo-level tests, which is the *weakest* 27B AWQ-4 capability; (ii) it hits the same generated-test-as-oracle problem the report itself uses to demote CoverUp in Axis 2 ([Mathews & Nagappan arXiv:2412.14137](https://arxiv.org/abs/2412.14137)); (iii) the SWE-Gym result is directly stack-matched: 32B Qwen2.5-Coder verifier lifted a 32B agent from **20.6% → 32.0%** on SWE-bench Verified at Best@16 ([arXiv:2412.21139](https://arxiv.org/abs/2412.21139)). Sol's practical design: deterministic gates first (patch parses, applies, compiles, focused tests pass, regression subset passes, diff scope OK), then a pairwise judge only for ties (CodeJudgeBench: pairwise beats pointwise, [arXiv:2507.10535](https://arxiv.org/abs/2507.10535)). Zero-shot with `c01` as judge is 1 slice; a distilled LoRA verifier from Forge-OH's own trajectory logs is a future refinement.

### Where the models diverge and how to weigh it

The sequencing disagreement is real. Fable wants a **measurement-hardening slice** (0.5) before any capability work, arguing that the ±8.1pt SE at n=30 makes every uplift claim unfalsifiable. Sol wants the **verifier primitive itself** as slice 1 (uplift = 0 by construction; enabling value = every subsequent claim becomes measurable). Gemini wants the **infra config bundle** as slice 0 because it's zero-code and unblocks context-limited tasks immediately. All three are defensible; they attack different bottlenecks. Reconciled order:

1. Slice 0 = infra config bundle (zero code, ~1 day)
2. Slice 0.5 = measurement hardening (McNemar, paired seeds, expand smoke to ≥100 tasks, add cost-per-solved-task telemetry)
3. Slice 1 = hermetic verification primitive (the shared runner)
4. Slice 2 = bounded execution-grounded repair loop (N=1, no-progress stopping)
5. Slice 3 = selection layer (deterministic gates + judge tie-breaker)
6. Then and only then: Agentless-style hierarchical localization, SBFL fusion, ACE playbook, etc.

The Axis 3 Planner disagreement resolves cleanly: all three models agree the report's "Plan-and-Execute split as Axis 3.1" is wrong, but for different reasons. Fable and Sol argue *less planning* (the planner and executor share weights; role prompts add variance without diversity). Gemini argues *native planning* (OpenHands Microagents already ship the primitive; building a custom LangGraph split fights the framework). Recommended action: **skip Axis 3 as a standalone build** — activate OpenHands Microagents when planner and executor genuinely need distinct system prompts (thinking preset on `c02`), otherwise use `c01` single-role. Self-Refine (report's Axis 3.3) can run as a cheap A/B *after* the validate-retry loop exists — it has nothing to gate on before then.

The trust-in-numbers divergence is easy to reconcile: **trust none of the point estimates** until we've run each candidate on ≥100 tasks with McNemar's exact test over paired per-task outcomes. Fable's arithmetic is right — the current 30-task SE swamps every claimed uplift below +8pt. The council does not agree on any specific pass@1 number, only on *which mechanisms* transfer to Forge-OH's scale.

### Final recommendation

**Adopt the reconciled 5-slice sequence above as the Stage 7+ implementation plan.** Reject the report's original "top-3 per axis" flat ranking in favor of the horizontal capability layers. Specifically:

- **Do NOT build:** CodeT dual-execution (Axis 1.2), a custom plan-and-execute harness (Axis 3.1), CoverUp-style broad generated-test synthesis (Axis 2.3 raw form), sequential best-of-N without a verifier (Axis 5.3).
- **Do build (in order):** infra config bundle (0), measurement hardening (0.5), hermetic verification primitive (1), bounded repair loop (2), selection layer (3), then Agentless-style hierarchical localization backed by tree-sitter (4), then SBFL fusion (5), then ACE playbook with token budget cap (6), then Self-Refine A/B (7).
- **Investigate before building:** OpenHands Microagents / Context Condensation / Pluggable Runtime (Gemini's angle) — half the custom scaffolding above may already ship in the SDK. This investigation is 1 hour, not 1 slice.
- **Track:** GPU-seconds per solved task, wall-seconds per solved task, and pass@1 with McNemar's test — not just pass@1 uplift.
- **Ceiling reality-check:** OpenSWE-32B hit 62.4% on SWE-bench Verified with Qwen2.5-32B base. Forge-OH's ceiling on Qwen3.6-27B AWQ-4 with equivalent scaffolding is plausibly in the 40-55% range. The gap to 62% is closable in ~5 slices; the report's original plan would have gotten us maybe halfway there and mis-measured whether we arrived.

---

## Slice mapping — proposed Stage 7 backlog

| Slice | Title | 1-line description | Est. size | Depends on |
|---|---|---|---|---|
| 7.0 | vLLM infra config bundle | Enable APC + spec-decode + fp8 KV-cache + chunked prefill; align OpenHands condenser `keep_first` with APC prefix; re-baseline smoke-30 | 1 slice (config only) | — |
| 7.0.5 | Measurement hardening | Add paired-seed McNemar test to bench harness; expand smoke set toward ≥100 tasks; add GPU-seconds / wall-seconds / cost-per-solved-task telemetry | 1 slice | 7.0 |
| 7.1 | Hermetic verification primitive | Sandboxed pytest runner via OpenHands Pluggable Runtime (or vendored equivalent); deterministic outcome schema; patch dry-run, syntax check, import check, focused-test + regression-subset outcomes | 1 slice | 7.0.5 |
| 7.2 | Bounded execution-grounded repair loop | N=1 generate → verify → diagnose from actual failure → 1-2 patch retries → stop on no progress; feed test output into next-prompt reasoning stream | 1 slice | 7.1 |
| 7.3 | Selection layer (deterministic gates + LLM-as-judge tiebreak) | Rank candidates by trusted tests > compile-passes > minimal-diff > pairwise `c01`-as-judge tie-break with swapped-order; start N=2 adaptive | 1 slice | 7.1, 7.2 |
| 7.4 | Path B autonomous localization (tree-sitter + hierarchical) | Vendor tree-sitter for AST-aware file→function localization; hierarchical repo→file→function search backed by RepoGraph + tree-sitter | 2 slices | 7.3 (validate loop must exist first) |
| 7.5 | SBFL fusion (on-demand) | Coverage.py-based SBFL only when a failing repro exists; intersect with RepoGraph rather than concatenate | 1 slice | 7.1, 7.4 |
| 7.6 | ACE-style skill playbook with token budget cap | Agent-authored SKILL.md with hard token budget (not skill-count cap); routing gate on task signature | 2 slices | 7.2 |
| 7.7 | Task-conditioned memory re-query | Event-triggered re-retrieval on new tracebacks/failures during the repair loop | 1 slice | 7.2 |
| 7.8 | Self-Refine plan critique (A/B) | Cheapest falsifiable planner experiment; retry-without-feedback as the control arm | 1 slice | 7.2 |
| 7.9 | Tool-call memoization (TVCACHE-style) | Cache pure tool results keyed by `(commit sha, cwd, tool + args, env fingerprint)`; invalidate on writes | 1 slice | 7.1 |

**Investigate before slicing (1 hour, not a slice):**
- OpenHands 1.40+ SDK — do Microagents / Context Condensation / Pluggable Runtime already cover 7.1 / 7.6 / 7.2 respectively?

---

## Key claims to verify empirically before committing to any slice

1. **fp8 KV-cache long-context accuracy** on Qwen3.6-27B AWQ-4 — run the 30-task smoke before/after; vLLM has documented long-context regressions on some kernel/GPU combos.
2. **APC hit rate** on Forge-OH's actual traffic — the condenser can invalidate the shared prefix if `keep_first` is misaligned.
3. **Spec-decode acceptance rate** — vLLM grades n-gram/suffix as "modest" gains that are workload-dependent.
4. **Path A vs Path B regime** — half the ranking inverts under autonomous localization; do NOT commit to Agentless-style scaffolding purely against the current Path A oracle baseline.
5. **Judge model latency** at N=2 — Fable's Slice 0 estimate assumes `c01`-as-judge is cheap; if load-time is a factor consider a sequentially-loaded 8B judge (CodeJudgeBench validates this at 8B scale).

---

## Documentation trail

- Deep-research subagent output: [`forge-oh-deep-research-2026-08-06.md`](./forge-oh-deep-research-2026-08-06.md)
- Council member analyses: `forge-oh-council-{claude_fable_5,gpt_5_6_sol,gemini_3_1_pro}-2026-08-06.md` in this project
- Baseline benchmark artifact: `~/.forge-oh/bench_pathF_swebench/20260806_1211_run/` on Colossus (Path A, 30 tasks, pass@1=33.3%, model c01)
- Previous BUILD_LOG entry: `## 2026-08-06 12:12 EDT — Post-Stage-6 · Path B harness + token-comparison harness shipped` on Colossus
- This document supersedes any "top-3 per axis" reading of the original research output; treat the 5-slice sequence above as canonical.

---

## Primary sources cited

- Agentless — [arXiv:2407.01489](https://arxiv.org/abs/2407.01489)
- AutoCodeRover — [arXiv:2404.05427](https://arxiv.org/abs/2404.05427)
- RepoCoder — [arXiv:2303.12570](https://arxiv.org/abs/2303.12570)
- CodeT — [arXiv:2207.10397](https://arxiv.org/abs/2207.10397)
- Self-Debugging (Chen et al.) — [arXiv:2304.05128](https://arxiv.org/abs/2304.05128)
- Reflexion — [arXiv:2303.11366](https://arxiv.org/abs/2303.11366)
- Weak-model self-repair limits (Olausson et al.) — [arXiv:2306.09896](https://arxiv.org/abs/2306.09896)
- CoverUp / generated-test oracle risk (Mathews & Nagappan) — [arXiv:2412.14137](https://arxiv.org/abs/2412.14137)
- ACE — [arXiv:2510.04618](https://arxiv.org/abs/2510.04618)
- Voyager — [arXiv:2305.16291](https://arxiv.org/abs/2305.16291)
- SWE-Gym verifier — [arXiv:2412.21139](https://arxiv.org/abs/2412.21139)
- CodeMonkeys — [arXiv:2501.14723](https://arxiv.org/abs/2501.14723)
- DeepSWE — [HuggingFace model card](https://huggingface.co/agentica-org/DeepSWE-Preview)
- OpenSWE — [arXiv:2603.13023](https://arxiv.org/abs/2603.13023)
- MASAI — [project page](https://masai-dev-agent.github.io/)
- DARS — [arXiv:2503.14269](https://arxiv.org/abs/2503.14269)
- SWE-Reasoner — [arXiv:2503.23803](https://arxiv.org/abs/2503.23803)
- CodePRM — [ACL 2025 Findings](https://aclanthology.org/2025.findings-acl.428)
- CodeJudgeBench — [arXiv:2507.10535](https://arxiv.org/abs/2507.10535)
- TVCACHE — [arXiv:2602.10986](https://arxiv.org/abs/2602.10986)
- XGrammar — [arXiv:2411.15100](https://arxiv.org/abs/2411.15100)
- LongLLMLingua — [arXiv:2310.06839](https://arxiv.org/abs/2310.06839)
- Diff-XYZ — [arXiv:2510.12487](https://arxiv.org/abs/2510.12487)
- Tree of Thoughts — [arXiv:2305.10601](https://arxiv.org/abs/2305.10601)
- vLLM APC docs — https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/
- vLLM speculative decoding docs — https://docs.vllm.ai/en/latest/features/speculative_decoding/
- vLLM fp8 KV-cache blog — https://vllm.ai/blog/2026-04-22-fp8-kvcache
- vLLM 0.10+ chunked prefill / guided decoding — https://digitalbourgeois.tistory.com/1929
- OpenHands SDK architecture — https://www.arxiv.org/pdf/2511.03690.pdf
- OpenHands condenser deep-dive — https://dev.to/truongpx396/openhands-deep-dive-build-your-own-guide-1al0
- Tree-sitter — https://github.com/tree-sitter/tree-sitter
- pytest-testmon — https://testmon.org/blog/v14-with-xdist-support-is-out/
- aider unified-diffs — https://aider.chat/docs/unified-diffs.html
