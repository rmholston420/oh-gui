# Kosmos Session Handoff — 2026-08-08 22:44 EDT

## Current build-sequencing position
- **Stage / phase:** Phase 1 · Authorization slice
- **Plugin / kernel component:** frontend authorization surface (`apps/gui/src/features/authorization/`)
- **Port(s) in progress:** none — the last two slices were evidence and frontend only, no port or
  adapter touched.

## Completed this session
- `ce461da`, `f5c3d2a` — hook-envelope capture + `AuthorizeRequest` fix; ADR-014 item 5 closed.
- `efee480` — evidence-directory guard.
- `de9ed54` — trust-dial mirror verified against the pinned image. All 192 combinations agree; the
  mirror was correct. ADR-006 amended; a spec self-contradiction ("at least MEDIUM" vs HIGH) fixed.
- `6047116` — 900px read-only gate (ADR-022), headed Playwright proof, 16 mutants all caught.
- Operator reproduced both captures on Colossus with real docker; evidence byte-identical.

## Remaining before current Definition of Done
Phase 1 exit criteria (§4.12 per ADR-017). Five items remain in KNOWN_ISSUES from the untracked
set, plus one new one:
1. §4.1 — trust dial settable **per task type**, not only globally.
2. §4.3 — the thirteen named batching/confirmation trigger conditions.
3. §8.4 — model-profile fields `generation/family version` and `dense vs MoE`.
4. §8.5/§8.6 — tool-call-depth budget axis and the 30-concurrent-tool soft warning.
6. §04a — quarantine invocations batched into the audit log.
+ **New:** the rest of §4.2 — blast radius (DERIVED, ADR-015 condition (e)), untrusted-content
  badge, the agent's own account, §4.2.1 audit log, and wiring Reject to
  `conversation.reject_pending_actions(reason)`. Nothing is transmitted anywhere yet.

Carried debt: wizard §3.4 items 1 & 3 inert; `trust-dial.ts` still owed to the middleware
(OpenAPI-driven, ADR-001 Amendment #1 finding 2) — verifying it did not retire it; ADR-016
baseline benchmark unrun (~3-5 GPU hours); ADR-014 items 1-4 need a live agent-server plus an
Ollama model, so ADR-014 stays *Proposed*.

## Open questions / awaiting user answer
- None. The two scope questions from this session (how much §4.2 card to build, and where the
  900px rule is enforced) were answered "make optimal choice" and are recorded in ADR-022 and the
  new KNOWN_ISSUES entry.

## Exact next action
Watch the gate drive the UI, which has not yet been done headed on Colossus:

    cd ~/dev/oh-gui && git pull && cd apps/gui && npx playwright test authorization-narrow --headed

Then start blast radius — it is the one remaining §4.2 item carrying an ADR-015 obligation, so it
is the expensive one to get wrong.

## Environment note
The sandbox runs Node 20, where jsdom 30 cannot load and vitest reports the crash as an *error*
while the summary line still reads "passed". Read the exit code, not the summary. Colossus is on
Node >=22.14 and unaffected.
