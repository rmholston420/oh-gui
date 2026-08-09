# OH-GUI Session Handoff — 2026-08-08 21:30 EDT

## Current build-sequencing position

- **Stage / phase:** Phase 1 (Authorization slice), governance sub-slice
- **Plugin / kernel component:** none in flight — the four blocking decisions are ruled
- **Port(s) in progress:** none. `datamodel-code-generator` is PLANNED, not vendored.

## Completed this session

- **ADR-018** — `13-hard-constraints.md` is now executable. 72 gates, four tiers
  (STATIC/PHASE/WITNESS/RETIRED), runner fails on spec↔registry drift, on a closed phase leaving
  a PHASE gate unproven, on a WITNESS gate naming no artefact, and on an uncited retirement.
- **ADR-019** — Spec Wizard moved to the Phase 1→2 boundary; Phase 1 owns the restricted-capability
  primitive that `04a §4.9.1` quarantine shares.
- **ADR-020** — §4.2.1 split: Phase 1 captures structured `provenance` at decision time, Phase 5
  resolves it in the Context Inspector.
- **ADR-021** — DTO boundary ruled in three classes. `AuthorizeRequest` found non-compliant and
  marked `PROVISIONAL — UNVERIFIED` behind a live interlock.
- ADR-014 gained a **fifth verification item** (capture and diff the real envelope).
- KNOWN_ISSUES items 1, 2, 9, 10 closed; six remain.
- Six mutants introduced and killed; three defects found in the tests themselves, including one
  vacuous test that could never have failed.

## State of the gate

`scripts/verify-local.sh --constraints-only` → **PASSED** (1 yellow: pytest resolves from the
middleware venv, absent in the agent sandbox; present on Colossus).
41 runner tests · 52 middleware assertions · ruff clean · 16 enforced gates.

## Remaining before the current Definition of Done

Phase 1 exit is **§4.12**, unchanged. Not started:

1. §3.2 / v4.3 — below 900px, authorization cards read-only, no exception path. Headed Playwright
   assertion at a narrow viewport. **Cheapest, and establishes the headed pattern — do it first.**
2. §4.1 — trust dial settable per task type, not only globally.
3. §4.3 — enumerate the thirteen batching/confirmation trigger conditions.
4. §8.4 — model-profile `generation/family version` and `dense vs MoE` gates.
5. §8.5/§8.6 — tool-call-depth budget axis; 30-concurrent-tool soft warning.
6. §04a — quarantine audit writes (shape fixed by ADR-020; batching behaviour still unspecified).
7. ADR-014's five verification items — **blocking all middleware enforcement**.
8. Carried debt: wizard §3.4 items 1 & 3 inert; `trust-dial.ts` still a hand-maintained mirror;
   ADR-016 baseline benchmark unrun (~3–5 GPU hours; do not restart casually).

## Open questions / awaiting your answer

None. Every ambiguity flagged last session is now ruled.

One thing worth saying plainly: the green run proves the **runner** works. It does not prove the
48 deferred gates hold — they are labelled deferred precisely so that count cannot be mistaken for
coverage.

## Exact next action

Capture the real `pre_tool_use` envelope. It unblocks item 7, clears the `AuthorizeRequest`
interlock, and every other middleware task queues behind it:

```bash
cd ~/dev/oh-gui && git pull && scripts/verify-local.sh --constraints-only
```

Then start ADR-014 verification item 5 against
`ghcr.io/openhands/agent-server@sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520`.
