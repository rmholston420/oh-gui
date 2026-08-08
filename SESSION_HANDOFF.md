# SESSION_HANDOFF

Overwritten 2026-08-08 08:48 EDT.

## Stage in progress

Phase 0 baseline. **Path E model selection is CLOSED** — ADR-005 Ratified, Amendments #1, #2, #3.
No further planner or coder benching is warranted.

## Final selection (ADR-005)

| Role | Model | ctx | Preset | Think | num_predict |
|---|---|---:|---|---|---:|
| Planner | `qwen3.6:27b` | 131,072 | `planner` 1.0/0.95/20 | on | 16,384 |
| Coder | `qwen3.6:35b-a3b-mtp-q4_K_M` | 131,072 | `precise` 0.6/0.95/20 | on | 16,384 |

Roles do NOT collapse: 26,140 + 26,390 = 52,530 MiB against a 32,607 MiB card, so the router
MUST call `ollama stop` on the outgoing role model (`OLLAMA_KEEP_ALIVE=-1`, nothing auto-unloads).
`OLLAMA_MAX_LOADED_MODELS` stays **2** — see Amendment #4; `=1` was retracted, not applied.

## Completed this session

- ADR-005 ratified, then hardened by three amendments across four independent runs.
- Planner evidence: **c12 `27b` 6/6** on the gold decision (medians 72, 72) vs **c13 `35b-mtp`
  3/12** (medians 66, 58, 66, 64). The pre-registered `precise` test failed its gate (1/3,
  median 64), so temperature was ruled out as the cause of c13's instability.
- Harness defect fixed: `SAMPLING` was silently ignored. Real `--sampling` override, validated
  against the harness's own preset table, recorded in every result JSON, 8 regression assertions.
- Embedder query latency 150.6 ms (not user-visible); input length **ruled out** as the cause of
  the ADR-004 A#2/A#7 12x discrepancy, which stays open.
- Four self-corrections recorded this session: retracted comparability caveat; retracted
  ~3,500 MiB desktop premise in `bench/gold/arch.md`; incorrect cold-gate "wrong side of warmup"
  claim; and an ADR follow-up pre-registered without a command that could execute it.

## Exact next action

Pull, run the gate, and look at the wizard:

```bash
cd ~/dev/oh-gui && git pull && cd apps/gui && npm ci && npm run gate && npm run dev
```

Expect lint clean, **25 tests passed**, `tsc -b` clean, build; then the wizard at the dev URL.

**Then decide one thing:** the "Ask on writes outside worktree" stop is specified in a way that
cannot work (KNOWN_ISSUES 2026-08-08). It is implemented as **elevate-to-HIGH + standard
ConfirmRisky(threshold=HIGH)**, which is the only combination matching the spec's own behavior
column, and `04-authorization.md` §4.1 is annotated OPEN pending your ratification. Phase 1's
middleware must implement whatever is ratified.

Then the next slice is the **first-run wizard** (`docs/specs/03-layout.md` §3.4): seven steps,
must state and justify the default trust-dial stop `ConfirmRisky()` in its own UI copy, seed the
"lines accepted without inspection" counter at zero, and show a clearly-labelled example plan tree.
Phase 0 ships copy + shell; the working dial is Phase 1's authorization slice.

## Ollama configuration — SETTLED, do not revisit

`OLLAMA_MAX_LOADED_MODELS` stays **2**, confirmed by measurement (run `20260808_0855`, ADR-005
Amendment #5). The slot limit counts CPU-resident models and reserves nothing for the embedder, but
on the required sequence — `ollama stop` outgoing, then load incoming — residency never exceeds 2
and the embedder survives.

**The router MUST call `ollama stop` on the outgoing role model.** `OLLAMA_KEEP_ALIVE=-1` means
nothing auto-unloads, and this is now measured as the sole enforcement mechanism. Omitting it costs
an embedder reload, not an OOM: planner 20,364 + coder 25,578 = 45,942 MiB against a 32,607 MiB
card, so role co-residency is physically impossible at any `num_ctx` and the VRAM ceiling refuses it
independently. **When the role-switch path is built, it needs a test asserting the embedder is still
resident afterwards** — that is what distinguishes a correct router from one that has quietly
stopped calling `ollama stop`.

## Remaining before Phase 0 Definition of Done

1. ~~Upstream artifact pins~~ — **DONE 2026-08-08**, `docs/UPSTREAM_PINS.md`.
2. ~~Read-only stock Agent Canvas reference checkout~~ — **DONE 2026-08-08 09:14**, provisioned on
   Colossus at `~/dev/oh-gui-ref/agent-canvas/v1.12.0` (21M, MIT, commit `4d0fe498`).
3. **Baseline metrics report** — model set SETTLED (ADR-005 Amdt #6): planner `qwen3.6:27b` +
   coder `qwen3.6:35b-a3b-mtp-q4_K_M`; "dense" retired. Per `02-repo-setup.md` items 5-7: 5-10
   representative tasks, time-to-first-review, turns-to-acceptance, lines-accepted-without-
   inspection, "lost track" incidents, GPU temp/power, plus the mental-model-formation baseline.
   Runs against the stock app — use the disposable copy
   (`bash scripts/provision-reference-checkout.sh --run-copy`), never the pristine tree.
4. ~~First-run wizard (§3.4)~~ — **DONE 2026-08-08**. Five steps, gate green, all five screens
   rendered and inspected. Step 2 computes its table from the real `shouldConfirm()` predicate
   rather than showing canned copy. Deferred and stated in-UI, not faked: backend detection
   (needs middleware), a genuinely live example action (needs an agent), counter persistence.

## Frontend — scaffolded 2026-08-08, gate green

`apps/gui`, Vite 8 + React 19 + Tailwind 4 + Vitest 4 + Playwright. `npm run gate` = lint + test +
`tsc -b` + build.

- **TypeScript is pinned to 6.0.3 on purpose. Do not "upgrade" to 7.x** — `typescript-eslint@8.66`
  peers `typescript >=4.8.4 <6.1.0`, so TS 7 silently breaks linting.
- **jsdom is not on the critical path.** Default Vitest env is `node`; jsdom 30 needs Node >=22.14.
  Component tests opt in per-file with `// @vitest-environment jsdom`. Unverified on Colossus.
- **`@openhands/typescript-client` is a types-only devDependency** (ADR-001 Amdt #3). Never import
  it at runtime. Two gates enforce this, both proven to fail on a real violation.

## Agent Canvas donor — corrected 2026-08-08, read before vendoring

Donor is **`github.com/OpenHands/OpenHands`** @ tag `v1.12.0` = commit
`4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364`, **MIT**, root `package.json` named
`@openhands/agent-canvas`. All five donor paths verified present at that commit.

**Do NOT vendor from `github.com/OpenHands/agent-canvas`** — it is a README-only stub with **no
LICENSE file**. PORTING_LEDGER.md previously conflated the two repos and claimed MIT plus
"archived, frozen donor"; both halves were wrong, and the real donor is actively developed. Fixed in
PORTING_LEDGER.md and ADR-001 Amendment #2.

Checkout layout: pristine read-only `~/dev/oh-gui-ref/agent-canvas/v1.12.0/` (outside the repo —
git does not track write permissions, so in-repo could not be held read-only); disposable writable
`~/.oh-gui/reference/agent-canvas-run/` for baseline metrics only.

## Upstream pins — recorded, see `docs/UPSTREAM_PINS.md`

`agent-server` @ `sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520`
(= `refs/tags/v1.41.0`, verified from the image config blob) · `openhands-{sdk,tools,workspace,
agent-server}` **1.41.0**, `requires_python >=3.12` · `@openhands/typescript-client` **1.37.0**.

**Read ADR-001 Amendment #1 before writing any compose file, health check, or frontend import.**
Pinning required inspecting the artifacts, and that falsified four ADR-001 claims: the client is
**not** remote-only (it exports a working `LocalConversation`, so the §4.8 structural argument does
not hold and an import gate is now required); a formal contract-tested OpenAPI schema **does** exist
upstream; the server exposes **8000 + 8002**, not 8001; and `ws` plus **`@openrouter/sdk`** are hard
dependencies of the client.

Lockfiles deliberately do not exist yet — neither project is scaffolded. `UPSTREAM_PINS.md` is the
source they must be generated from verbatim.

## Open

- **Security-analyzer architecture is NOT decided.** `bench/gold/arch.md` is a scoring rubric, not
  an ADR. Option C plus a CPU second stage needs its own ADR before any code is written. Best
  available port drafts: run `0824` rep 3 (frozen dataclasses, `ActionType` incl. `TEXT_INGEST`,
  `TaintTag` with propagation rules) and run `0836` rep 1 (`ActionDisposition` separated from risk
  level, `analyze_action` + `analyze_text`).
- KNOWN_ISSUES: A#2/A#7 embedder discrepancy (length ruled out, cause unknown); arch.txt's
  retracted desktop figure (deliberately unedited to preserve cross-run comparability); 262,144
  envelope unmeasured; 450 W vs 435 W anomaly (runs `0824` and `0836` peaked 197 W and 193 W, so
  still unexplained).
