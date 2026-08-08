# OH-GUI Architecture Decision Records

Filed in ID order. An ADR is required for any decision that reshapes the integration
boundary, adds or changes a formal port, alters plugin/module scope, changes a storage
backend, or shifts the vendor-vs-hand-build line. Reversible code-level choices
(naming, refactors, lint style) do not get an ADR.

Amend in place with a `> **STATUS AMENDMENT (YYYY-MM-DD):**` block; never delete
original decision text. If a decision reverses, author a new ADR that supersedes the
old one and mark the old one `Amended · superseded by ADR-###`.

| ID | Title | Status | Lock-in phase |
|---|---|---|---|
| [ADR-001](ADR-001-integration-boundary.md) | OpenHands Integration Boundary: Standalone App over Agent Server API | Ratified | Phase 0 |
| [ADR-002](ADR-002-household-mode-phase-1.md) | Household Multi-User Mode Ships in Phase 1 | **Superseded by ADR-003** | Phase 0 |
| [ADR-003](ADR-003-single-operator-remove-household.md) | Single-Operator Deployment: Remove Household Multi-User Mode | Ratified | Phase 0 |
| [ADR-004](ADR-004-vram-context-envelope.md) | VRAM and Context Envelope on Colossus | Ratified | Phase 0 |
| [ADR-005](ADR-005-planner-and-coder-model-selection.md) | Planner and Coder Model Selection for OH-GUI | **OPEN** - awaiting Path E results | Phase 0 |

## Open items awaiting a decision

| Item | Blocking | Source |
|---|---|---|
| Upstream artifact pins (agent-server digest, pip/npm versions) | Phase 0 exit | ADR-001, `docs/specs/02-repo-setup.md` item 1 |
| Baseline metrics report vs. dense Qwen3 27B-35B | Phase 0 exit | ADR-005, `docs/specs/02-repo-setup.md` items 5-7 |
| Read-only stock Agent Canvas reference checkout | Phase 0 exit | `docs/specs/03-layout.md` §3.0.1 |
| First-run wizard stating default trust-dial stop in-UI | Phase 0 exit | `docs/specs/03-layout.md` §3.4 |

## Closed

| Item | Resolved by |
|---|---|
| Household-mode onboarding timing | ADR-003 - household mode removed; question is void |
| Scope of "remove the auth stuff" | ADR-003 - multi-user removed, safety plane retained |
| Phase 0 baseline model set | qwen3.6:27b (planner) + qwen3-coder:30b (coder); qwen3:32b dropped as superseded |
| LICENSE for this repo | MIT, added 2026-08-08 with NOTICE for donor attribution |
| Thermal operating point | 435 W ratified; 600 W rejected at 82 C with throttling (BUILD_LOG 2026-08-08 08:20). Core sensor only - VRAM temp is not exposed by this driver (`docs/THERMAL-5090.md`) |
| GPU hotspot enforcement | Record-only; NVIDIA removed the hotspot sensor on RTX 50 - the reading is a duplicate of core (`docs/THERMAL-5090.md`) |
| Desktop VRAM overhead | 657-666 MiB measured with browser open; the ~3,500 MiB estimate is retracted (ADR-004 A#6) |
| `OLLAMA_FLASH_ATTENTION` | Confirmed no-op on all three axes (VRAM, prefill, decode) |
| Repo layout for code | `apps/gui/` + `services/middleware/`, confirmed 2026-08-08 |
