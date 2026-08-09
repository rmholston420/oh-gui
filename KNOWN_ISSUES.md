# Known Issues — OH-GUI

Append-only. Each entry: symptom, scope, status, and the condition that closes it.

## 2026-08-08 08:15 EDT — `bench/prompts/arch.txt` states a retracted desktop-VRAM figure

**Symptom:** the prompt tells the model "Desktop idle consumes 650-850 MiB of VRAM and will
rise by 2-3 GB once a browser and the OH-GUI frontend are running." The 2–3 GB rise is
**not supported by measurement.** Idle VRAM recorded immediately before load, with the
operator's normal desktop and browser running: 657 MiB (`20260808_0531`), 666 MiB
(`20260808_0545`), 675 MiB (`20260808_0738`). ADR-004 A#6 retracts the ~3,500 MiB figure.

**Scope:** `bench/prompts/arch.txt`, `bench/gold/arch.md` (corrected in place), Path E
rounds 1 and 2 `arch` scoring.

**Impact on results: none.** All cells in a round receive the identical prompt, so the
premise error is common-mode and relative ranking is unaffected. ADR-005's planner verdict
stands.

**Deliberately NOT fixed:** editing the prompt would break comparability with rounds 1 and 2,
whose scores are already recorded. 

**Closes when:** a round 3 `arch` prompt is authored with the measured figure, at which point
round 3 scores must not be compared directly against rounds 1–2 without noting the change.

## 2026-08-08 08:15 EDT — 262,144 context remains unmeasured

**Symptom:** no cell has ever run at 262,144. A#5 declared it unusable from the retracted
3,500 MiB figure; A#6 retracted that reasoning without re-ratifying the context.

**Status:** working ceiling stays **131,072** because that is the value Path E actually
exercised — not because 262,144 was shown to fail.

**Closes when:** a cell runs at 262,144 with the desktop under interactive load and idle
VRAM recorded at start and peak.

## 2026-08-08 08:15 EDT — power sampled at 450 W against a 435 W cap

**Symptom:** run `20260808_0738` reported `power max 450W` with 102 power-capped samples;
`20260808_0705` peaked at 437 W. LACT cap is 435 W (`/etc/lact/config.yaml`).

**Hypothesis, not established:** telemetry sampling above the enforcement averaging window
rather than a genuine cap breach. No causal claim enters an artifact until executed.

**Impact:** none observed. 0 thermally throttled samples in both runs; peak temp 72 C.

**Closes when:** a sampling run at fixed load compares `nvidia-smi` instantaneous power
against the LACT enforcement window, or the cap is confirmed to be advisory for transients.

## 2026-08-08 08:40 EDT — ADR-004 A#2 vs A#7 embedder discrepancy: input length RULED OUT, still open

`bench/oneoff/embed_query_latency.sh` was written to test whether the ~12x gap between A#2's
13.7 chunks/s (73 ms/chunk) and A#7's 1.09 chunks/s (915 ms/chunk) was simply a difference in
input size. **It is not.**

Measured on CPU, `qwen3-embedding:4b`, 9 reps per length:

| tokens | median | ms/tok |
|---:|---:|---:|
| 8 | 160.3 ms | 20.04 |
| 16 | 149.8 ms | 9.36 |
| 32 | 154.4 ms | 4.82 |
| 64 | 150.6 ms | 2.35 |
| 128 | 155.5 ms | 1.21 |
| 256 | 160.7 ms | 0.63 |

Wall time is **flat across a 32x range of input length** — 149.8 to 160.7 ms, a 1.0x ratio where
~12x would have been needed to explain the gap. Single-embed cost on CPU is essentially pure
fixed overhead; per-token work is invisible below 256 tokens.

**Consequences.**
- The A#2/A#7 discrepancy **stays OPEN** and now has one fewer available explanation. Candidate
  remaining causes: different batching, different `num_ctx`, chunk count vs chunk size
  confusion in one of the two measurements, or one figure being amortised indexing throughput
  while the other is single-call latency. Not yet investigated.
- **A separate result is settled, and favourably:** query-band latency (16-64 tokens) is
  **150.6 ms** median. Not user-visible for interactive retrieval. **ADR-004 A#2 (embedder on
  CPU) and A#7 (iGPU rejected) both stand**, and the flatness means the 2560-dim native output
  costs nothing measurable at query time.
- The 512-token row is invalid — at/over the 512 `num_ctx` the input was truncated. The operator
  intended `NUM_CTX=2048` but set it as a separate shell statement, so it never reached the
  script. Re-run as `NUM_CTX=2048 bash bench/oneoff/embed_query_latency.sh` on one line if the
  long-input tail matters; it does not affect the query-band verdict.
- Thermally irrelevant: peak 39 C, 34 W, 0 samples under load.

## ~~2026-08-08 08:52 EDT — `MAX_LOADED_MODELS=2` eviction order is unmeasured~~ — CLOSED 08:58 EDT

**Status: CLOSED 2026-08-08 08:58 EDT by run `20260808_0855`. No configuration change; `=2` stays.**

> **RESOLUTION.** The slot limit counts CPU-resident models and reserves nothing: with
> `{embedder(0 MiB), planner}` resident, loading the coder evicted the embedder, and freeing it
> released zero VRAM, so only the slot limit explains it. **But `=2` is still correct.** Step 4 ran
> the sequence ADR-005 requires — `ollama stop` the outgoing role model, then load the incoming one
> — and residency stayed at 2 throughout, so **the embedder survived**. The churn is a symptom of
> the forbidden load-over-resident sequence, not of the value. `ollama stop` is therefore the sole
> enforcement mechanism, and its omission costs an embedder reload rather than an OOM, because the
> VRAM ceiling independently forbids role co-residency. Full reasoning in ADR-005 Amendment #5.

> **UPDATE 2026-08-08 08:56 EDT — one half of this is now SETTLED, the other reframed.**
>
> **Settled: co-residency is physically impossible, so this setting was never the protection.**
> Measured at `num_ctx=4096`, planner 20,364 MiB + coder 25,578 MiB = **45,942 MiB** against a
> 32,607 MiB card. Weights dominate at every context, so the two role models cannot both be
> resident at any `num_ctx`. The **VRAM ceiling** is what forbids co-residency;
> `MAX_LOADED_MODELS` cannot be credited with it. Step 3 of run `0850` confirmed the scheduler
> evicts as much as it needs — loading the coder evicted **both** resident models, not just the
> one the slot limit required.
>
> **Reframed: what the setting actually governs is embedder reload churn.** Whether `=2` reserves
> a slot for the CPU embedder is still unmeasured.
>
> **Why v1 was invalid:** it omitted `"num_gpu": 0`, so the embedder loaded onto the **GPU** at
> 2,754 MiB rather than CPU-resident at 0 (ADR-004 A#2). Evicting a GPU-resident embedder frees
> real VRAM, so its eviction cannot be attributed to the slot limit — the precise confound the
> probe existed to eliminate. v2 forces `num_gpu:0` and **hard-fails** if step 1 does not report
> `size_vram: 0`.

`OLLAMA_MAX_LOADED_MODELS=2` is intended to mean "one GPU role model plus the CPU-resident
embedder", enforcing ADR-004's never-co-resident invariant at the server. **Which model the
scheduler evicts when the limit is exceeded has never been measured.**

With `{qwen3-embedding:4b, qwen3.6:27b}` resident and the coder then loaded:

- If it evicts the **planner** → `=2` is a correct backstop.
- If it evicts the **embedder** → both role models go resident. At 131,072 that is
  26,140 + 26,390 = **52,530 MiB against a 32,607 MiB card**, and `=2` provides no protection at
  all; only the router's explicit `ollama stop` does.

Run `bash bench/oneoff/max_loaded_lru_probe.sh`. It changes no configuration and restarts nothing.

**Related and settled:** `=1` is NOT the fix. A CPU-placed model occupies a model slot (measured,
BUILD_LOG 2026-08-08 05:50 EDT), so `=1` would thrash the embedder on every role switch. ADR-005
Amendment #4 retracts that change.

## 2026-08-08 09:02 EDT — frontend can bypass the policy plane via `LocalConversation`

**Status: CLOSED 2026-08-08 by ADR-001 Amendment #3.** The client is now a types-only
`devDependency` behind two independent gates (ESLint + a Vitest source scan), both demonstrated
failing on a deliberate violation and passing a type-only import. Residual gap: the gates cover this
repo's source, not a transitive dependency importing the client. Original entry follows.

`@openhands/typescript-client` 1.37.0 exports a **functional** `LocalConversation` from its
top-level barrel — local agent loop, bash tool definition, caller-supplied `toolExecutor`, plus its
own `security/confirmation-policy`, `security/security-analyzer`, `stuck-detector` and
`secret-registry`. ADR-001 described the client as "remote conversations only" and rested its
`04-authorization.md` §4.8 argument on that ("a remote-only client cannot reach the hole").

**Nothing currently prevents frontend code from importing `LocalConversation` and driving an agent
loop that never transits the middleware**, bypassing the entire policy plane and defeating
Principle 8. ADR-001 item 4 is therefore a convention, not a control.

**Required:** a mechanical import gate — frontend must not import `LocalConversation`,
`LocalWorkspace`, `.../llm`, or `.../security` — plus a test that fails the build on violation.
Local to this repo, no GitHub-native CI. See ADR-001 Amendment #1 C#1.

**Related, same package:** `@openrouter/sdk ^0.13.24` is a non-optional dependency and
`dist/llm/openrouter-llm.js` ships. Verify no path reaches OpenRouter and that it is tree-shaken
from the production bundle; treat an outbound OpenRouter request as a defect.

## 2026-08-08 09:02 EDT — Agent Server / TypeScript client version skew is unquantified

**Status: OPEN, accepted risk, mitigation deferred to first integration slice.**

Pinned server/SDK **1.41.0** vs client **1.37.0** — four minor versions. Separate repos, 15 client
releases against 81 SDK releases, gaps in the client series, no `peerDependencies`, no published
compatibility matrix, no supported-server range. The first integration slice must verify the
endpoints it actually calls against the pinned server rather than trusting version proximity.

Upside recorded in ADR-001 Amendment #1 C#2: a formal, contract-tested OpenAPI schema **does** exist
upstream, so the anti-corruption layer can be generated and diffed rather than hand-written.

## 2026-08-08 — the "Ask on writes outside worktree" stop, as specified, cannot work

**Status: CLOSED 2026-08-08 — ratified as [ADR-006](adrs/ADR-006-out-of-worktree-stop-elevates-to-high.md).**
Elevate to HIGH, standard `ConfirmRisky(threshold=HIGH)` unchanged. Binding on the Phase 1
middleware. Retained here as the record of a control that would have shipped deciding nothing.

`docs/specs/04-authorization.md` §4.1 specifies this stop as a `SecurityAnalyzerBase` subclass that
elevates any out-of-worktree write **"to at least MEDIUM"**, composed into
`EnsembleSecurityAnalyzer` and **"paired with standard `ConfirmRisky()`"**. Its behavior column
reads: *"Read-only and in-scope writes proceed; out-of-scope pauses."*

Writing the predicate as an executable function and testing it showed no reading of that text
produces that behavior:

| Elevation | Threshold | Result |
|---|---|---|
| MEDIUM | HIGH (the "standard" `ConfirmRisky()`) | MEDIUM is below the threshold, so the elevation changes nothing. **The stop is inert** — it would ship looking correct and pause on nothing it did not already pause on. |
| MEDIUM | MEDIUM | An ordinary in-scope MEDIUM edit now pauses, **contradicting "in-scope writes proceed"**. |
| **HIGH** | **HIGH (standard)** | In-scope reads and edits proceed; any out-of-worktree write pauses. **Matches the behavior column exactly.** |

**Implemented:** elevate to HIGH, keep `ConfirmRisky()` standard. This honors §4.1's hard correction
(the analyzer, not a `ConfirmationPolicyBase` subclass, does the path-scoping) and changes only the
elevation target.

**How it surfaced.** Not by reading the spec. A test asserting the four stops are ordered strictest
to loosest failed, because under the MEDIUM/MEDIUM reading the third stop was *stricter* than the
second. The inert MEDIUM/HIGH variant is the dangerous one: an authorization control that silently
does nothing is worse than one that is absent, because the operator relies on it.

**Owed:** ratify, then amend §4.1 so the Python middleware and this mirror cannot diverge.

---

## 2026-08-08 — trust-dial semantics are duplicated in the frontend

**Status: OPEN. Accepted for Phase 0 only.**

`apps/gui/src/features/first-run/trust-dial.ts` re-implements the stop→decision mapping in
TypeScript so the wizard can show the operator what each stop decides, computed rather than
asserted. Enforcement remains in the middleware (ADR-001 item 4), so this is a **display mirror**
and a divergence risk: the mirror could drift from the Python policy and confidently tell the
operator something false.

**Containment upgraded 2026-08-08 22:20 EDT.** It was contained by `trust-dial.test.ts`, which
pins every behavior to the **spec table** — to a document a human wrote. That catches drift
between the mirror and our prose; it cannot catch our prose being wrong, which is precisely what
happened to `AuthorizeRequest` (four of eight fields, undetected). The mirror is now *additionally*
pinned to upstream by `trust-dial.upstream.test.ts`, whose fixture is generated by
`scripts/capture-trust-dial.sh` from the pinned image's own policy objects. All 192 combinations
agree; the mirror was correct.

**This does not close the issue.** A verified mirror is still a mirror:

- The check is only as fresh as the last capture. Bump the pinned image and the fixture is stale
  until someone re-runs the script — nothing forces that on a pin bump.
- It covers the decision function only. Nothing pins `mapsTo` strings, labels, or the ADR-006
  analyzer actually existing in the middleware.
- `DiscriminatedUnionMixin` was stubbed during capture (see the fixture's `caveat`), so policy
  logic living in the base class would not be seen.

**Phase 1 must still drive this from the middleware** — the generated Agent Server OpenAPI
document (ADR-001 Amendment #1, finding 2) makes that feasible — and delete the hand-maintained
mirror.

---

## 2026-08-08 — the model benchmark cannot tell the candidates apart

**Status: OPEN. Model choice routed around it via ADR-012.**

The Phase 0 baseline ran 48 cells: six blocks, three model builds, two sampling presets. **Every
block scored 7/8, and every block failed a different task.**

| Preset | qwen3.6:27b | 27b-mtp | 35b-a3b-mtp |
|---|---|---|---|
| General (Ollama default) | t01 | t02 | t08 |
| Coding (ADR-011) | t08 | t04 | t07 |

Acceptance never moved. Only the identity of the failing cell moved. **At one repetition per cell
this harness measures variance, not model quality**, and no ranking may be drawn from
`docs/BASELINE-COMPARE-six-blocks.md` — the table is a record of what happened, not a comparison.

**Why it cannot discriminate.** Two causes, both fixable:

1. **n=1.** With a single run per cell there is no way to distinguish a model that fails t04 from a
   model that failed t04 *this time*. The six blocks are consistent with all three builds having
   the same per-cell failure probability of roughly one in eight.
2. **The tasks are too easy and too few.** Eight tasks against a small FastAPI fixture, seven of
   which every build cleared. There is no headroom: a better model has nothing left to be better
   at. Two of the six misses were not quality failures at all — one changed no files, one was
   killed by malformed tool-call JSON.

**What a proper harness needs.**

- **Repetitions per cell** — at least 3, ideally 5, so per-cell variance is visible and a
  difference can be tested rather than eyeballed. Cost scales directly: one block is ~12 min, so
  3 models x 3 reps is roughly 1.5–2 h of GPU.
- **Harder tasks with headroom.** Multi-file changes with real coupling, tasks with a wrong-but-
  plausible solution the gate rejects, and at least two nobody is expected to pass first time.
  Ceiling effects are the main defect of the current set.
- **A discriminating metric besides pass/fail.** Acceptance is one bit per cell and saturated.
  Turns-to-acceptance and diff minimality carry more signal — but turns are contaminated by
  tool-call retries, so that defect must be fixed or measured out first.
- **Report variance, not just totals.** Per-cell spread across repetitions, so a reader can see
  whether a difference exceeds the noise. The current report has no place to put that.

**Related open defect.** Malformed tool-call JSON, ~2 per cell on every build regardless of preset
or model, which destroyed a whole cell once (t02 on `27b-mtp-q4_K_M`: three identical rejected
`file_editor` calls, run never started). It inflates turns and so contaminates the most promising
alternative metric. Wants its own ADR.

**Owed:** build the above before any model-selection claim is made from local benchmarks. ADR-012
chose the default coder model on OpenHands' upstream recommendation precisely because this harness
could not, and carries a falsifiable revisit trigger that depends on this work existing.

**Do not** quote acceptance rates from the six Phase 0 blocks as evidence that one local model is
better than another. They are a baseline of record for the app, not a model ranking.

### 2026-08-08 — Runtime comparison (vLLM vs Ollama) is deferred and cannot be run like-for-like

- **Blocks:** no current phase. Deferred by operator decision 2026-08-08 19:13 EDT — "we will need
  to re-run proper benchmarks later to make a valid comparison." Must be resolved before any OH-GUI
  runtime assumption is hard-coded.
- **Symptom:** the donor's F.19-pre matrix confounds runtime with quantization in every cell — no
  pair holds the model fixed across runtimes — so it cannot isolate a runtime effect in either
  direction. Raw tok/s favors Ollama (230-300 vs vLLM 117-391, and the canonical vLLM coder c01 sits
  at 79-121); quality and capability favor vLLM decisively.
- **Why a clean A/B is not available:** the two runtimes cannot serve the same weights in any
  configuration we would ship.
    - vLLM's GGUF path is documented upstream as "highly experimental and under-optimized … might be
      incompatible with other features," and single-file only
      (https://docs.vllm.ai/en/stable/features/quantization/gguf/). Benching vLLM on GGUF measures
      vLLM's worst-supported loader and would understate it.
    - The formats that produced every defensible winner — INT4 AutoRound, NVFP4, AWQ-Marlin — have
      no Ollama path at all, so there is nothing to compare against.
  Holding the model fixed is therefore only possible on a configuration neither runtime would ship.
- **Consequence for the rerun:** pre-register it as a **stack** comparison, not a runtime
  comparison — "best Ollama-servable configuration vs best vLLM-servable configuration" — and state
  the claim in those terms. A result phrased as "vLLM is faster/better than Ollama" would not be
  supported by any design available to us.
- **Attempted fixes:** none; measurement deferred.
- **Next investigation:** write the ADR-013-compliant task set first (>=5 attainable discordant
  pairs, 50-70% acceptance band, replicates retained, fold rule pre-registered), then define the two
  stacks. Capture tok/s and latency alongside pass/fail, since the axes disagree and both matter.
- **Related DEBUG_LOG search terms:** vllm, ollama, gguf, tok/s, runtime, quantization, confound

### 2026-08-08 — The SWE-bench harness disagrees with itself on 40% of repeated tasks

- **Blocks:** any decisive local model comparison. Does **not** block Phase 0 exit (ADR-016) or
  Phase 1.
- **Symptom:** Of 58 tasks run more than once under an identical configuration
  (`c01_coder_vllm_qwen36_27b_int4`), **23 returned different `resolved` values between runs**.
  Mean per-task pass probability across those 23 is **0.515**. Examples:
  `scikit-learn__scikit-learn-14629` → `[T,T,T,T,T,T,F,T,F,T]`;
  `matplotlib__matplotlib-24570` → `[F,T,T,T,T,F,F,T,F,T]`.
- **Why it matters:** it caps benchmark power far below what task count alone predicts. One GPU
  hour yields 36% power against a 20-point model gap; 80% power costs 3-5 hours (ADR-013 clause 8).
  Noise reduction is a cheaper route to a decisive answer than more runs.
- **Suspected contributors (unverified, do not cite as cause):**
  1. Malformed tool-call JSON, ~2/cell, already recorded under ADR-013 clause 6.
  2. Sampling non-determinism — the coder preset is `temperature=0.7, top_p=0.8` (ADR-011).
  3. Genuine flakiness in the upstream SWE-bench test suites themselves.
  None of these is yet demonstrated to be *the* cause and no run has been executed to separate them.
- **Next investigation:** re-run one high-flip task (`scikit-learn__scikit-learn-14629`, 10 runs
  already on disk) N times at reduced temperature, holding everything else fixed. If the flip rate
  collapses, sampling dominates; if not, look at tool-call failures and upstream flakiness. Cheap:
  single task, single model.
- **Related DEBUG_LOG search terms:** flip rate, run-to-run variance, resolved mismatch, mid-p,
  discordant pairs, statistical power, MDE

### 2026-08-08 — First-run wizard steps 1 and 3 ship inert pending the middleware

- **Blocks:** nothing. Phase 0 exit is met without them; they are owed work in Phase 1.
- **Symptom:** Spec 03-layout.md §3.4 item 1 ("Connect a model/agent — detected local backends
  pre-populate from the model-profile scan") renders a labelled "Not active yet" placeholder, and
  item 3's "one **live**, harmless example action" shows a computed decision rather than an
  executed action.
- **Why:** ADR-001 item 4 confines the frontend to the OH-GUI middleware, which does not exist
  until Phase 1. The browser cannot reach Ollama directly, so backend detection cannot be honestly
  faked, and no action can be executed without a conversation.
- **Also owed:** `trust-dial.ts` is a hand-maintained mirror of the spec table. Phase 1 must drive
  it from the middleware's generated schema (ADR-001 Amendment #1 finding 2). Until then
  `trust-dial.test.ts` pins every cell so drift fails the gate rather than misleading the operator.
- **Next investigation:** build the middleware model-profile scan endpoint in the Phase 1
  authorization slice, then replace both placeholders.
- **Related DEBUG_LOG search terms:** trust-dial, mirror, drift, model-profile scan, middleware

### 2026-08-08 — Phase 1 scope items surfaced by the full spec read

> **NARROWED 2026-08-08 21:20 EDT.** Items 1, 2, 9 and 10 are resolved by ADR-018, ADR-019,
> ADR-020 and ADR-021 respectively and have been removed rather than struck — this file is the
> *open* list, and the closed record lives in the ADRs and `BUILD_LOG.md`. Renumbering is
> deliberate: stable numbering here would be a fiction, since the list was never referenced by
> number anywhere. Items below are the six that remain untracked.

- **Blocks:** Phase 1 Definition of Done (they are in scope but were untracked).
- **Symptom:** `SESSION_HANDOFF.md`'s remaining list omits the following, each traceable to a
  spec file that had not been read in full:
  1. §4.1 — trust dial must be settable **per task type**, not only globally.
  2. §4.3 — the thirteen named batching/confirmation trigger conditions are not enumerated
     anywhere in the build list.
  3. §8.4 — model-profile fields `generation/family version` and `dense vs MoE` are
     hard-constraint gates distinct from `deterministic_replay`.
  4. §8.5/§8.6 — tool-call-depth budget axis (distinct from turns and wall clock) and the
     30-concurrent-tool soft warning.
  5. ~~§3.2 / v4.3 gate — below 900px authorization cards are read-only with no exception path.~~
     **CLOSED 2026-08-08 22:38 EDT** by ADR-022 + `e2e/authorization-narrow.spec.ts`. Struck rather
     than removed because items 1-4 and 6 are still numbered against this list.
  6. §04a — quarantine invocations must be written to the authorization audit log with
     source and trust class, and batched when several untrusted items arrive in one turn.
     The audit shape is now fixed by ADR-020; the batching behaviour is not.
- **Attempted fixes:** item 5 closed (see above). Items 1-4 and 6 still recorded, not resolved.
- **Next investigation:** these six are build work, not decisions — none appears to need an ADR.
  Item 5 is the cheapest and is a headed-Playwright assertion, which is how the operator wants
  frontend behaviour proven; do it first so the pattern exists for the rest.
- **Related DEBUG_LOG search terms:** per task type, tool-call depth, 900px, quarantine audit,
  batching triggers, model profile fields

### 2026-08-08 — The authorization card is one bullet of §4.2, not the section

- **Blocks:** Phase 1 exit criteria (§4.12). Not blocking any current slice.
- **Symptom:** `AuthorizationCard` was built as the minimum surface needed to make the 900px gate
  real (a gate needs something to gate). It renders the exact command, the LLM-attributed risk,
  and the three actions. The rest of `docs/specs/04-authorization.md` §4.2 is absent:
  - **Blast radius** — files, paths, hosts, credentials. DERIVED under ADR-015, so it needs one
    declared per-tool-class projection, the native inputs displayed inline at their native field
    names (condition e), and `null` rather than an empty list for tool classes with no projection.
    Deliberately not stubbed: an empty list and an uncomputed list must never look alike.
  - **Untrusted-content badge** (04a), distinct from the risk badge.
  - ~~**The agent's own account**~~ — **BUILT 2026-08-09 00:20 EDT.** Ported from Agent Canvas
    under ADR-025 with three donor defects fixed; see PORTING_LEDGER.md and
    `apps/gui/src/features/authorization/agent-account.ts`. `critic_result` and
    `responses_reasoning_item` remain unexposed, both deliberately and both out of §4.2 scope.
  - **§4.2.1 audit log** — approvals, rejections-with-reason, relax grants; session-scoped
    expiry; the live relaxation badge count on the trust dial.
  - **Reject is not wired to `conversation.reject_pending_actions(reason)`** — the card takes an
    `onReject` callback and the harness passes none. Nothing is transmitted anywhere yet.
- **Also carried:** `App.tsx` selects the surface from `?surface=`, a seam standing in for the
  §3.1 shell. Trivial by design so there is nothing to migrate when the shell lands.
- **Next investigation:** ~~blast radius~~ (ADR-023, built) and ~~the agent's own account~~
  (ADR-025, built) are done. Next is the untrusted-content badge (04a), then §4.2.1's audit log,
  then wiring Reject — the audit log is the one with a zero-trust obligation attached, since every
  entry must carry the structured `provenance` array captured at decision time.
- **Related DEBUG_LOG search terms:** blast radius, DERIVED, authorization card, reject_pending_actions

### 2026-08-09 — Ollama runtime too old for two registered bench candidates; upgrade deliberately deferred

- **Blocks:** nothing currently. Two ADR-016 **exploratory** cells (G, H in the manifest arm table)
  cannot execute. No confirmatory cell is affected, so the benchmark's inferential claim is intact.
- **Symptom:** exact text from the pull attempt, 2026-08-09 04:30 EDT:
  ```
  Error: pull model manifest: 412:
  The model you are attempting to pull requires a newer version of Ollama.
  ```
  Affects `laguna-xs-2.1:q4_K_M` and `ornith:35b`. Both then fail the tool-call probe with
  `model '<tag>' not found`, which is a *downstream* symptom of the failed pull, not an
  independent capability finding — neither model has been shown to lack tool-calling.
  `glm-4.7-flash:q4_K_M` and `lfm2.5:8b` pulled and probed PASS on the same runtime.
- **Affected stage / plugin / port:** Phase 0 parallel track · ADR-016 tool-call benchmark ·
  no port.
- **Why deferred rather than fixed:** two independent reasons, either sufficient.
  1. **Unattended-run risk.** The decision arose at ~04:30 EDT with the overnight benchmark due to
     start at ~05:30. An upgrade that breaks model serving would burn the whole window silently.
  2. **Measurement validity — the stronger reason.** The benchmark measures native tool-call
     emission, which is a property of the *runtime's* chat/tool templates as much as of the model
     weights. Upgrading Ollama mid-design would mean the baseline `qwen3.6:35b-a3b-mtp-coder` is
     characterised under a different runtime than the one ADR-012 selected it on, and results
     before and after would not be comparable. The runtime version is part of the registered
     environment, not an incidental detail.
- **Attempted fixes:** none attempted by design. No upgrade, no `--insecure` pull, no manual
  manifest fetch.
- **Known gap in the record:** the installed Ollama version was **never captured** before the
  overnight run, so the registered environment is under-specified. This should have been recorded
  alongside the timing probe. Capture it with:
  ```bash
  ollama --version && curl -s http://127.0.0.1:11434/api/version
  ```
- **Next investigation:** while awake and with no run in flight — record the current version,
  upgrade Ollama, then **re-probe all four confirmatory models (A-D)** for tool-call emission and
  re-run `timing_probe.py`. If any confirmatory cell's behaviour changes, the completed benchmark
  is scoped to the old runtime and must be labelled as such rather than silently carried forward.
  Only then pull `laguna-xs-2.1` and `ornith:35b`.
- **Related DEBUG_LOG search terms:** 412, pull model manifest, requires a newer version of Ollama,
  model not found, laguna-xs-2.1, ornith, tool_calls probe
