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

## Remaining before current Definition of Done (Phase 0 exit)
1. Rebuild the bench harness to satisfy ADR-013 clauses 1-7 (task set with >=5 attainable
   discordant pairs, 50-70% acceptance band, replicates retained, fold rule pre-registered)
2. Port `bench/lib/mcnemar.py` and `bench/_common/nvml_sampler.py` (fail-closed on missing NVML)
   with ledger entries and contract tests
3. Pull and benchmark the optimized models
4. First-run wizard

## Open questions / awaiting operator answer
1. **ADR-015 DERIVED tier** — adopt it, or hold clause 1 strictly and amend spec 04 §4.2 and
   spec 08 to drop blast radius, analyzer identity, and derived telemetry?
2. **vLLM vs Ollama.** Operator states vLLM performs much better. The donor's artifacts split:
   vLLM wins decisively on **quality/capability** and sustained-load stability, and **loses on raw
   throughput** — the canonical vLLM coder c01 runs 79-121 tok/s (ADR-013 line 311) against Ollama
   cells at 230-300 tok/s (F.19-pre raw JSON). Adopting vLLM is a deliberate quality-for-speed
   trade, not a free win. Confirm before it becomes a bench axis or an OH-GUI runtime assumption.
3. Reclaim the 154 GB under the masked apt Docker daemon and the 137 GB SWE-bench repo cache?

## Exact next action
Operator answers Q1 and Q2. Then: write the ADR-013-compliant task set before any GPU time is spent.
