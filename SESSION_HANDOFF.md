# OH-GUI Session Handoff — 2026-08-08 19:45 EDT

## Standing operator constraints — CARRY FORWARD VERBATIM into every future handoff

1. **Never prune Docker local volumes on Colossus.** Operator instruction, 2026-08-08 19:40 EDT:
   "Leave the local volumes untouched." The live snap daemon holds ~122 GB across 69 local volumes
   (~32 GB reported reclaimable); this is where `kosmos-valkey`, `kosmos-adr010-searxng` and other
   persistent state live. `docker volume prune` is **not reversible**. No volume may be removed
   without the operator naming that specific volume as disposable. Image and stopped-container
   pruning are a separate question and remain open, not authorized.
2. **Never introduce cloud control planes, multi-user assumptions, or GitHub-native CI.**
3. **GPU gates:** `GPU_MAX_C=83`, `GPU_WARN_C=80`, `GPU_COLD_C=45`. Every script that drives the LLM
   must sample temperature. Only core temp is real on RTX 50.
4. **OpenHands API/SDK is the single source of truth**; trust its code over its documentation
   (ADR-015).

## Current build-sequencing position
- **Stage / phase:** **Phase 0 — NOT exited.** Outstanding: baseline metrics report, first-run wizard
- **Component:** benchmark measurement spine (ADR-013)
- **Port(s) in progress:** none. Nothing has been vendored from Forge-OH
- **Repo:** `main` @ `87094e9`, clean, pushed

## Completed this session
- Cleared the Colossus dual-Docker-daemon fault; 10 orphaned containers stopped, load 3.29 -> 0.83
- Read the entire Forge-OH codebase (~116k lines) -> `docs/forge-oh-code-review.md` + six per-area
  reviews; corrected five claims in the superseded port survey
- Filed **ADR-013** (benchmark discrimination floor, Ratified), **ADR-014** (authorization
  enforcement seam, Proposed + verification gate), **ADR-015** (native-fidelity boundary, Ratified)
- Added hard-constraints v4.4; ledger gains a required `Native basis` field
- Amended ADR-015 and spec 04 §4.2 after verifying the SDK security-analyzer contract
- **Reclaimed 247 GB** (434G -> 681G free): `/var/lib/docker` 154 GB + `/var/lib/containerd` 94 GB.
  Found that the earlier daemon fix was incomplete — `containerd.service` is a separate unit from
  the `containerd.io` package and was still active/enabled. Both units now masked. Local volumes
  untouched by instruction.

## Remaining before current Definition of Done (Phase 0 exit)
1. Rebuild the bench harness to satisfy ADR-013 clauses 1-7 (task set with >=5 attainable
   discordant pairs, 50-70% acceptance band, replicates retained, fold rule pre-registered)
2. Port `bench/lib/mcnemar.py` and `bench/_common/nvml_sampler.py` (fail-closed on missing NVML)
   with ledger entries and contract tests
3. Pull and benchmark the optimized models (operator: Phase 0 cannot close without this)
4. First-run wizard

## Open questions / awaiting operator answer
**None.** All three prior questions are closed:

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
3. ~~Disk reclaim~~ — **CLOSED 2026-08-08 19:45 EDT.** 247 GB reclaimed. The "137 GB SWE-bench repo
   cache" in the original question **did not exist** — `~/.forge-oh` is 602 MB total. The remaining
   ~30 GB of reclaimable images and ~4.9 GB of stopped containers on the snap daemon are noted but
   **not authorized**; volumes are permanently off-limits per standing constraint 1.

## Known host state (Colossus)
- Free space: **681G of 1.9T (62% used)**
- Docker: **snap daemon only**, root `/var/snap/docker/common/var-lib-docker` (170 GB), own
  containerd at `/run/snap.docker/containerd/containerd.toml`
- Masked: `docker.service`, `docker.socket`, `containerd.service`. Masks are root symlinks to
  `/dev/null` under `/etc/systemd/system` and survive dpkg upgrades — do not "fix" this by purging.
  `apt-get purge --dry-run docker-ce containerd.io` reports it would install NEW packages, and the
  working CLI is `docker-ce-cli` at `/usr/bin/docker` (`/snap/bin/docker` is only the generic
  `/usr/bin/snap` wrapper).
- Running: `kosmos-valkey`, `kosmos-adr010-searxng`
- `forge-oh-bff:latest` and Forge-OH's SearXNG image are **gone**. A live Forge-OH behavioural
  comparison now requires a rebuild under the snap daemon; unmasking recovers nothing.
- Open, unrelated: `kosmos-dozerdb` exits 3 on startup (Kosmos-side issue)

## Exact next action
Write the ADR-013-compliant task set. It gates both the Phase 0 baseline report and the deferred
stack comparison, and no GPU time should be spent before it exists.
