# Kosmos Session Handoff — 2026-08-09 07:26 EDT

## Current build-sequencing position
- **Stage / phase:** Phase 1 · agent context + GUI surfaces
- **Plugin / kernel component:** `oh-gui` plugin (`.agents/plugins/oh-gui/`); GUI plugins panel
- **Port(s) in progress:** agent-server plugins API (read path only)

## Completed this session
- `0f8eeee` ADR-citation gate + 4 regression tests.
- `38b0bf1` 18 skills ported from Forge-OH (MIT, SHA `df73ebe`); 5 rejected with reasons.
- `fb5e1c0` repackaged as one `oh-gui` plugin per REQ-15-006. **Pushed red** — see below.
- `aa645f9` gate fix: in repo-root logs an ADR number in inline code is a mention, not a citation.
  Specs and ADRs get no such escape.
- `97934df` `argument-hint`, not `argument_hint`. Found by loading the plugin with a real
  `openhands-sdk==1.41.0`. The loader ignored the underscore key silently, so both command hints
  were absent. New `scripts/tests/test_plugin_manifest.py` reads the accepted keys out of the
  pinned SDK source rather than restating them; 4 mutants caught.
- `20cc2ca` read-only Plugins panel at `?surface=plugins` + live Playwright spec.
- `9dba244` count is 22 agent-visible skills, not 18 — the server reports `get_all_skills()`, which
  adds one keyword-triggered skill per command. The live run was right; my assertion was wrong.
- Live spec green, operator-witnessed.

## Remaining before the current Definition of Done
- ~~Operator witness for the plugins panel~~ — **done 07:07 EDT, 2 passed headed against the live
  agent-server.** Tier 2 is complete.
- Record the ADR-016 verdict as a closing amendment (decision made: change nothing; A stays
  default. A=45.0%, B=47.5% on 40 tasks — one task apart, no confirmatory GPU run).
- ~~Assign requirement IDs across the remaining Phase 1 specs; four drift gates + mutation tests.~~
  **Both already done — this line was stale and cost a re-investigation on 2026-08-09.** Verified:
  all four ADR-028 gates exist in `scripts/hard_constraints/checks.py` (lines 552, 558, 564, 573),
  are wired as STATIC-tier entries, are mutation-tested in `scripts/tests/test_check_hard_constraints.py`,
  and are recorded IMPLEMENTED as REQ-13-078..081. Requirement IDs are assigned across all 17
  enrolled specs; `02` is excluded **by design** as the closed Phase 0 setup record, not by omission.

## Open questions / awaiting user answer
- **Tier 3 (enable/disable via `PATCH /plugins/{name}`)** — mutating but local and reversible.
  Probably no ADR. Not started.
- **Tier 4 (install / uninstall / refresh / marketplace)** — `POST /plugins` fetches remote code
  into the agent's context. Needs an ADR on authorization and blast radius before any code.

## Verified contract facts (do not re-derive)
- Plugin routes are under **`/api`** — the prefix lives on the including router (`api.py:428`),
  not on `plugins_router`.
- `POST /api/plugins` reports user- and project-discovered plugins. `GET /api/plugins/installed`
  reports **only** registry-managed installs and returns `[]` for a `.agents/plugins/` plugin.
- Manifest path is `.plugin/plugin.json` (`PLUGIN_MANIFEST_DIRS`). The `Plugin` class docstring
  saying `.agents/plugin.json` is wrong.
- Command frontmatter keys: `description`, `argument-hint`/`argumentHint`,
  `allowed-tools`/`allowedTools`. Underscore variants are silently discarded.
- `openhands-sdk==1.41.0` installs cleanly from PyPI into a throwaway venv; the plugin can be
  loaded for real without the container.

## Process failures this session — read before the next commit
1. **Pushed red at `fb5e1c0`.** I chained the gate run and the push into one command *and* appended
   to BUILD_LOG after the gate ran, so the gate never saw the final file. Twice. **Run gates as the
   last step of a bash call, or re-run after any append. Never chain a gate and a push.**
2. **A validator built from memory cannot catch a mistake made from memory.** The frontmatter
   checker encoded my assumed key names. Read accepted values out of the pinned source.
3. **Reading vendored evidence must not execute it** — a failed import wrote `__pycache__` into
   `review/_sdk_src/` and tripped the evidence-snapshot gate.

## Exact next action
Run the live plugins spec and report pass/fail:

    cd ~/dev/oh-gui && git pull --ff-only && cd apps/gui && npx playwright test plugins-live --grep @live --headed --workers=1 --reporter=list
