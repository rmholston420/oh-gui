---
name: oh-gui-repo-navigation
description: Where things live in the OH-GUI repo and which existing pattern to copy. Use whenever starting a feature and asking "where does this go?", investigating a bug and asking "where is this defined?", or looking for an existing implementation to base new code on. Enforces the copy-an-existing-pattern rule and the spec/ADR-first rule.
license: MIT
triggers:
  - "apps/gui"
  - "services/middleware"
  - "docs/specs"
  - "where does this go"
---

# OH-GUI Repo Navigation

OH-GUI is an **overlay** on OpenHands. It is never a fork. If a behavior already exists in the
OpenHands SDK or agent-server, the job is to expose it, not to reimplement it (ADR-015).

## Map

| You want | It lives in |
|---|---|
| React UI | `apps/gui/src/features/<feature>/` |
| App shell, routing, layout regions | `apps/gui/src/shell/` |
| Agent-server HTTP client | `apps/gui/src/api/agentServer.ts` |
| Wire types / DTOs | `apps/gui/src/api/types.ts` |
| Live + component e2e specs | `apps/gui/e2e/*.spec.ts` |
| Middleware (FastAPI, authorization seam) | `services/middleware/src/ohgui_middleware/` |
| Middleware tests | `services/middleware/tests/` |
| Normative specs | `docs/specs/NN-*.md` |
| Decisions | `adrs/ADR-###-*.md`, indexed in `adrs/README.md` |
| Vendored donor specs (read-only) | `docs/donor-specs/` |
| Enforced repo gates | `scripts/hard_constraints/`, run via `scripts/check-hard-constraints.py` |
| Vendored SDK source, for reading | `review/_sdk_src/<version>/` |
| Benchmarks | `bench/` |

## Rules

1. **Read the spec before the code.** `docs/specs/00-ground-truth.md` first, then the numbered spec
   for the area. `docs/specs/COVERAGE.md` maps requirements to evidence.
2. **SDK source beats SDK docs.** Answer "is this field native?" from `review/_sdk_src/`, never from
   memory or a docs page. This is ADR-015 and it is not negotiable.
3. **Copy an existing pattern.** Before writing a new feature directory, read a sibling under
   `apps/gui/src/features/` and match its file layout, test placement, and naming.
4. **A decision that reshapes a port, a boundary, or a gate needs an ADR** before the code lands.
5. **Donor specs are read-only.** `docs/donor-specs/` carries its own ADR numbering; never cite it
   as if it were ours.

## Gates before you claim done

```bash
python3 scripts/check-hard-constraints.py --no-color   # expect === PASSED ===
python3 -m pytest scripts/tests/ -q
cd apps/gui && npx vitest run
```
