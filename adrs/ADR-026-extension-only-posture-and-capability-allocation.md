# ADR-026 — We build on top of OpenHands, never into it: the extension-only posture and the capability allocation map

**Status:** Ratified
**Lock-in phase:** Phase 0 — binding immediately on every slice, port, spec amendment, and ADR that follows
**Supersedes:** —
**Corroborates:** ADR-014 (hook is a deny gate, not a policy plane) · ADR-015 (native fidelity) · ADR-025 (Canvas is a donor, not a dependency)

## Context

Two operator directives arrived together on 2026-08-08, and they are one decision:

> "we do not want to modify OpenHands, we want to build on top of it so to speak"

> "i leave it to your judgement to decide what should be a skill, a hook, a plugin, or part of the
> harness or GUI"

The second is unanswerable without the first. "Where does this capability live?" has a defensible
answer only once "not inside OpenHands" is fixed, because a fork makes every other tier optional —
anything can be achieved by patching the agent loop, and so nothing is ever forced into a clean seam.

This is also the post-mortem finding from the predecessor project, in the operator's words:

> "the problem with Forge-OH that forced me to start over with OH-GUI is that you went off the rails
> and didn't use the actual contracts OpenHands provides, you ended up making your own stuff up"

Forge-OH did not fail by forking upstream. It failed by *inventing a parallel vocabulary beside*
upstream — `agent_presets.py` declaring `maxCost`, `maxSteps`, `toolAllowlist`, `systemPrompt`, and a
`loopGuard` that nothing ever read. Every one of those five concepts exists natively in 1.41.0, with
a different name, in a place that is actually wired to the agent loop. Inventing a tier is the same
class of error as modifying one: both put our concept where the framework will never look for it.

So this ADR fixes the posture, then enumerates the tiers upstream actually provides, then states a
preference order that makes "where does this go?" mechanical rather than a matter of taste.

All citations below resolve inside this repository, at `review/_sdk_src/1.41.0/`, per ADR-015
clause 1. That snapshot was committed in the same change as this ADR; see `DEBUG_LOG.md`
2026-08-09 00:51 EDT for why it was missing.

## Decision

### D1 — Extension-only posture

1. **Zero diffs against upstream.** OH-GUI never forks, patches, monkey-patches, vendors-and-edits,
   or shadow-imports a private symbol of `openhands.sdk`, `openhands.tools`,
   `openhands.workspace`, or `openhands.agent_server`. Upstream is consumed at its published
   version as a black box with a public API.
2. **Two footprints, both additive.** Agent-side, our entire footprint is *one installable plugin*
   (D3.4). Server-side, our entire footprint is a separate process that composes agent-server over
   its HTTP surface. Neither requires upstream to know OH-GUI exists.
3. **Snapshots are evidence, not dependencies.** `review/_sdk_src/` and the Agent Canvas donor tree
   (ADR-025) are read at authoring time and cited. No file under `apps/`, `services/`, or `bench/`
   may import from either.
4. **Stop condition.** If a capability appears to require modifying upstream, that is a hard stop.
   The three permitted exits are: (a) re-express the capability in a tier below; (b) accept the
   capability's absence and record it; (c) file an upstream issue and record the dependency. A local
   patch is never an exit, not even temporarily, because a temporary patch is indistinguishable from
   a permanent one after one compaction of the agent's context.

### D2 — The tiers are upstream's, and there are six

Verified present in the pinned 1.41.0 artifact. Tiers 1-4 are upstream's; 5-6 are ours.

| # | Tier | Native module | What it is | Enforcement power |
|---|---|---|---|---|
| 1 | **Skill** | `openhands/sdk/skills/` | Trigger-scoped knowledge injected into the prompt | none — advisory |
| 2 | **Hook** | `openhands/sdk/hooks/` | Deterministic gate + side effect at 6 lifecycle points | binary allow/deny |
| 3 | **Subagent** | `openhands/sdk/subagent/` | Bounded role: own tools, model, budget, permission mode | hard caps per run |
| 4 | **Plugin** | `openhands/sdk/plugin/` | Distribution unit bundling tiers 1-3 + MCP + commands | none — packaging |
| 5 | **Harness** | `services/middleware/` (ours) | Cross-run state, policy that must *ask*, provenance-bearing memory | full |
| 6 | **GUI** | `apps/gui/` (ours) | Rendering and operator decisions | none |

#### Tier 1 — Skill

`Skill` is loaded by trigger: `KeywordTrigger`, `TaskTrigger`, `PathTrigger`
(`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/skills/trigger.py:19,29,39`), installed and toggled by
`install_skill` / `enable_skill`
(`.../openhands/sdk/skills/installed.py:114,151`), and sourced from a marketplace
(`install_skills_from_marketplace`, `.../skills/installed.py:200`).

**Use for anything whose failure mode is "the agent did it worse", not "the agent did something
forbidden".** House conventions, per-language idioms, the planning method, the review checklist as
guidance, spec-authoring procedure, repo-specific how-to, debugging heuristics.

**Never use for** anything that must hold when the model ignores it. A skill is a suggestion the
model reads; it is one distracted turn away from being unread.

#### Tier 2 — Hook

Six events: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`
(`.../openhands/sdk/hooks/types.py:9-17`). Three kinds: `COMMAND` (subprocess), `PROMPT` (LLM
evaluation, marked future), `AGENT` (agent with tool access)
(`.../openhands/sdk/hooks/config.py:39-44`). Bounded by `timeout: int = 60` and
`max_iterations: int = 3` (`.../hooks/config.py:62-63`). Configured from
`{workspace}/.openhands/hooks.json` (`.../openhands_agent_server-1.41.0/openhands/agent_server/hooks_service.py:36`).

**The decisive constraint — a hook cannot ask.** `HookDecision` has exactly two members, `ALLOW`
and `DENY`; `ASK` exists only as a commented-out line marked *"Future: prompt user for confirmation
before proceeding"* (`.../openhands/sdk/hooks/types.py:35-40`).

Two consequences, and they are the most load-bearing findings in this ADR:

- **ADR-014 is corroborated by evidence it did not have.** It was filed as *Proposed*, gated on
  executable verification, asserting the hook is a deny gate rather than a policy plane. The absent
  `ASK` member is that verification. A hook is structurally incapable of being a policy plane,
  because a policy plane's characteristic move is deferring to a human.
- **The authorization card in spec 04 §4.2 cannot be implemented as a hook, and never could have
  been.** Approval lives in tier 5 driving tier 3 (D4), not in tier 2.

**Use for** dangerous-command blocking (`PreToolUse` → `DENY`), completion gates (`Stop`), evidence
and test-outcome capture (`PostToolUse`), product-context loading (`SessionStart`), episodic-memory
write (`SessionEnd`), prompt enrichment (`UserPromptSubmit`).

**Never use for** anything needing operator input, anything needing more than 60s, anything whose
verdict is a spectrum rather than yes/no.

#### Tier 3 — Subagent

An `AgentDefinition` is markdown-with-frontmatter, discovered at `project`, `user`, `builtin`,
`plugin`, or `programmatic` level (`.../openhands/sdk/subagent/schema.py:23`), carrying `tools`,
`skills`, `model`, `hooks`, `mcp_config`, `condenser`, `max_iteration_per_run`,
`max_budget_per_run`, and `permission_mode` ∈ {`always_confirm`, `never_confirm`, `confirm_risky`}
(`.../subagent/schema.py:26-45`).

**This is where the Forge-OH inventions belonged.** The mapping is exact and it is the strongest
available argument for this ADR's whole method:

| Forge-OH invention | Native home |
|---|---|
| `maxCost` | `max_budget_per_run` |
| `maxSteps` | `max_iteration_per_run` |
| `toolAllowlist` | `tools` |
| `systemPrompt` | the `AgentDefinition` markdown body |
| `loopGuard` | `Stop` hook, or a critic (`openhands/sdk/critic/`) |

**Use for** every "the agents think/plan/review better" capability that is really a *role* with a
narrower remit than the main agent: planner, critic, reviewer, test-author, repair worker, spec
interrogator. A role with its own budget and tool set is a subagent, not harness code.

**Never use** a subagent to hold cross-conversation state; it is scoped to a run by construction.

#### Tier 4 — Plugin

`Plugin` bundles `manifest`, `skills`, `hooks`, `mcp_config`, `agents`, and `commands`
(`.../openhands/sdk/plugin/plugin.py:39,58-73`), manifested from `.plugin/` or `.claude-plugin/`
(`.../plugin/plugin.py:35`), with a native install/enable/update lifecycle
(`.../openhands/sdk/plugin/installed.py:57,95,136`).

**A plugin is packaging, not behaviour.** Nothing is ever "implemented as a plugin" — it is
implemented in tier 1, 2, or 3 and *shipped* in a plugin. Our agent-side footprint is exactly one
versioned OH-GUI plugin, which is what makes D1.2 true and what makes our footprint uninstallable in
one native operation.

#### Tier 5 — Harness (`services/middleware/`)

**Admission test — a capability enters the harness only if it fails all three:** (a) it cannot be
advice, (b) it cannot be a binary gate inside 60s, (c) it is not scoped to one run.

**Belongs here:** anything that must *ask the operator* (the authorization card, the trust dial,
batching); anything spanning runs (episodic memory, budget accounting, the audit log); anything
carrying `provenance` + `confidence` on a memory write; projections the GUI needs that upstream does
not compute (blast radius, ADR-023).

**Prohibited here:** any reimplementation of tiers 1-4. If harness code contains a loop over
lifecycle events, a tool allowlist, a per-run step cap, or a prompt-fragment registry, it is a
misallocation and must move down a tier. This prohibition is the entire lesson of Forge-OH: the
harness is the tier that swallows everything if it is not fenced.

#### Tier 6 — GUI (`apps/gui/`)

Renders state and captures operator decisions. Contains no policy and no enforcement — consistent
with ADR-022, where even a viewport threshold is an affordance rather than a boundary. A rule that
exists only in the GUI does not exist.

### D3 — Preference order

**Allocate to the lowest-numbered tier that can carry the capability.** Tiers 1-4 before 5; 5 before
6; never below 6.

Rationale: the preference order runs from least power to most, and therefore from most native to most
ours. Every step down the list increases what we own, what we must test, and what can drift from
upstream. Forge-OH's collapse was not a single wrong choice but a systematic bias toward the bottom
of this list, one defensible step at a time.

### D4 — Where approval actually lives

Approval is `ConfirmationPolicyBase` — `AlwaysConfirm`, `NeverConfirm`, or
`ConfirmRisky(threshold: SecurityRisk = HIGH)`
(`.../openhands/sdk/security/confirmation_policy.py:9,27,35,43-44`) — selected per role by
`permission_mode` (`.../subagent/schema.py:39,43`).

The trust dial of spec 04 §4.1 is therefore **a mapping from task type to a confirmation policy and
a risk threshold**, computed in tier 5, expressed in tier 3, rendered in tier 6. It is not a set of
hooks. Any future amendment proposing hook-based approval must first overturn
`.../hooks/types.py:40`.

## Consequences

- `services/middleware/` gains an admission test with a falsifiable form (D5 below).
- The Vibe/Pro lens becomes a tier-3-and-5 question, not a GUI toggle: two confirmation policies and
  two role sets over one event log.
- ADR-014 can move from *Proposed* to *Ratified* on the `HookDecision` evidence — filed separately,
  since this ADR must not silently amend another.
- Spec 04 §4.2's authorization card is re-grounded on `ConfirmationPolicyBase`. Its behaviour does
  not change; its stated mechanism does.
- `review/_sdk_src/1.41.0/` is now committed (5.6 MB, 446 `.py`), so ADR-015's six previously
  dangling citations resolve.
- A proposed `docs/specs/15-middleware-harness.md` must be written against this allocation, and is
  expected to move most of the capability wish-list *out* of the harness.

### D5 — Enforceable checks

Added to the hard-constraints registry (ADR-018), each mutation-tested per the standing rule:

1. No file under `apps/`, `services/`, or `bench/` imports from `review/_sdk_src/` or the Canvas
   donor tree.
2. No dependency pin resolves OpenHands to a git URL, fork, or local path.
3. No file under `review/_sdk_src/` differs from its published upstream artifact (hash manifest).
4. No ADR or spec cites a `review/_sdk_src/` path that does not exist at the cited line.

Check 4 is the one that would have caught the defect this ADR fixes, which is why it is written as a
resolvable-citation check rather than a file-existence check.

## Alternatives considered

**Alt-A — Fork OpenHands and modify freely.** Rejected. It is the operator's explicit instruction,
and independently it destroys the preference order of D3: with a fork available, no capability is
ever *forced* into a native tier, so the framework's seams stop constraining anything.

**Alt-B — Four tiers, folding subagent into plugin.** Rejected. Subagent and plugin differ on the
axis this ADR exists to police: subagent has hard per-run enforcement
(`max_budget_per_run`, `max_iteration_per_run`, `permission_mode`), plugin has none. Merging them
would have hidden the exact native home of every Forge-OH invention, which is the most useful
finding here.

**Alt-C — Allocate case by case, no standing order.** Rejected. Forge-OH's failure was not any single
misallocation but the absence of a default, which let each choice be argued locally toward the
harness. D3 makes the default mechanical and puts the burden of proof on descent.

## References

- `review/_sdk_src/1.41.0/` — pinned artifact, all citations above
- `adrs/ADR-014-authorization-enforcement-seam.md` — corroborated by `HookDecision`
- `adrs/ADR-015-native-fidelity-boundary.md` — source-over-docs rule
- `adrs/ADR-018-hard-constraints-runner.md` — registry for D5
- `adrs/ADR-025-canvas-alignment...` — donor-not-dependency precedent
- `docs/donor-specs/forge-oh/` — donor specs of record
- `docs/specs/04-authorization.md` §4.1-4.2 — re-grounded by D4
