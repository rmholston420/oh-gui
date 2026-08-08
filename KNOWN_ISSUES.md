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

**Status: OPEN — needs operator ratification. Implemented as HIGH elevation in the Phase 0 display
mirror; the Phase 1 middleware must match whatever is ratified.**

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

Contained for now by `trust-dial.test.ts`, which pins all 14 behaviors to the spec table. **Phase 1
must drive this from the middleware** — the generated Agent Server OpenAPI document (ADR-001
Amendment #1, finding 2) makes that feasible — and delete the hand-maintained mirror.
