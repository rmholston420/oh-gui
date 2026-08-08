# OH-GUI Session Handoff — 2026-08-08 19:55 EDT

## Current build-sequencing position
- **Stage / phase:** **Phase 0 — NOT exited.** Outstanding: baseline metrics report, first-run wizard
- **Component:** benchmark measurement spine (ADR-013)
- **Port(s) in progress:** none. Nothing has been vendored from Forge-OH

## Completed this session
- Cleared the Colossus dual-Docker-daemon fault; 10 orphaned containers stopped, load 3.29 -> 0.83
- Read the entire Forge-OH codebase (~116k lines) -> `docs/forge-oh-code-review.md` + six per-area
  reviews; corrected five claims in the superseded port survey
- Filed **ADR-013** (benchmark discrimination floor, Ratified), **ADR-014** (authorization
  enforcement seam, Proposed + verification gate), **ADR-015** (native-fidelity boundary, Ratified)
- Added hard-constraints v4.4; ledger gains a required `Native basis` field
- Amended ADR-015 and spec 04 §4.2 after verifying the SDK security-analyzer contract

## Remaining before current Definition of Done (Phase 0 exit)
1. Rebuild the bench harness to satisfy ADR-013 clauses 1-7 (task set with >=5 attainable
   discordant pairs, 50-70% acceptance band, replicates retained, fold rule pre-registered)
2. Port `bench/lib/mcnemar.py` and `bench/_common/nvml_sampler.py` (fail-closed on missing NVML)
   with ledger entries and contract tests
3. Pull and benchmark the optimized models
4. First-run wizard

## Open questions / awaiting operator answer
1. ~~ADR-015 DERIVED tier~~ — **RESOLVED 2026-08-08 19:25 EDT by verification against the shipped
   1.41.0 SDK**, not by operator choice. DERIVED ratified with five conditions (sentinel-zero rule;
   auth-card values must show native inputs inline). Spec 04 §4.2 amended: analyzer identity and
   rationale removed as unrecoverable, native `summary`/`thought`/`reasoning_content` substituted;
   blast radius retained as DERIVED. My own proposed exclusion of the auth card was overturned.
2. ~~vLLM vs Ollama~~ — **DEFERRED by operator 2026-08-08 19:13 EDT**: "we will need to re-run
   proper benchmarks later to make a valid comparison." See `KNOWN_ISSUES.md`. Pre-registered
   constraint: no like-for-like A/B exists (vLLM's GGUF path is experimental/under-optimized;
   INT4-AutoRound/NVFP4/AWQ have no Ollama path), so the rerun must be scoped as a **stack**
   comparison, not a runtime comparison.
3. ~~Disk reclaim~~ — **DONE 2026-08-08 19:40 EDT.** 247 GB reclaimed (434G -> 681G free):
   `/var/lib/docker` 154 GB and `/var/lib/containerd` 94 GB, both orphaned apt-stack data-roots.
   The "137 GB SWE-bench repo cache" in the original question **did not exist** — `~/.forge-oh`
   is 602 MB total. Still open for the operator, not urgent: ~35 GB of reclaimable images and
   stopped containers on the live snap daemon. Its 122 GB of volumes must not be pruned blind.

## Exact next action
No operator answer outstanding — Q3 is closed. Next: write the ADR-013-compliant task set before
any GPU time is spent — it is the prerequisite for both the Phase 0 baseline report and the
deferred stack comparison.
