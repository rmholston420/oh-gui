# ADR-023 — Blast radius is a per-tool projection, and the terminal tool has none

> **STATUS AMENDMENT (2026-08-09 03:40 EDT) — the discriminator is not the class name.**
>
> This ADR's projection table is keyed by action class. Implementation revealed that the class
> does **not** arrive as a bare name, and does not arrive where the first implementation looked
> for it. It arrives as `ActionEvent.action.kind`, mangled to a fully-qualified form:
>
> ```
> openhands__tools__file_editor__definition__FileEditorAction-Output__1
> openhands__sdk__mcp__definition__MCPToolAction-Output__1
> ```
>
> Pattern: `<module__path>__<ClassName>-Output__<N>`. `ActionEvent` itself carries `kind:
> 'ActionEvent'`, which is what made the mistake easy: the outer discriminator is a bare name, the
> inner one is not.
>
> The first implementation keyed on a sibling `action_class` field that does not exist, so **all 37
> classes would have resolved to `unknown-action`** — the drift state — silently and uniformly.
> Nothing in the decision text below changes; the *lookup key* does. `normalizeActionKind()`
> reduces both the mangled and bare forms to the class name, and
> `apps/gui/src/__tests__/blast-radius-contract.test.ts` walks the `Action` union out of the
> installed client's generated schema so this cannot drift back unnoticed.
>
> Two further points settled during implementation:
>
> - **Four statuses, not two.** `projected` / `no-projection` / `not-executable` / `unknown-action`.
>   `ActionEvent.action` is nullable upstream ("None when non-executable"), which is a documented
>   state, not drift, and must not render as either an empty radius or an unrecognised class.
> - The result type named `no-projection-declared` in Consequences below is implemented as
>   `no-projection`.

**Status:** Ratified 2026-08-08 23:18 EDT (operator chose option B)

> **SCOPE CORRECTION (2026-08-08 23:20 EDT):** the first revision of this ADR verified
> `openhands-tools` only. That was too narrow — the suite is `openhands-sdk`, `openhands-tools`,
> `openhands-workspace`, `openhands-agent-server`, plus the Agent Canvas reference app. Rescanning
> every `openhands.*` module in the image found **six more `Action` classes**, one of which
> (`MCPToolAction`) materially changes the decision. Findings 4 and 5 below are new. The original
> Findings 1–3 are unchanged and were re-verified under the wider scan.

**Lock-in phase:** Phase 1 — Authorization surface (§4.2)
**Supersedes:** —

## Context

ADR-015's amendment retained blast radius in spec 04 §4.2 as the one **DERIVED** item on the
authorization card, subject to conditions (a)–(e), and required "one declared formula per tool
class; a tool class without a declared projection renders `null`, not an empty blast radius."

Condition (a) requires every input to be a named native field verified per clause 1. That
verification had not been done, and could not have been done against the artifacts pinned at the
time: tool `Action` classes are not in `openhands-sdk` at all. They ship in a separate distribution,
`openhands-tools`, which had no pin in `docs/UPSTREAM_PINS.md`.

`scripts/verify_tool_actions.py` closes that gap. It reads all 16 `openhands.tools.*.definition`
modules out of the pinned agent-server image's PyInstaller PYZ, diffs each structurally against the
same module compiled from the now-pinned `openhands-tools` 1.41.0 sdist (16/16 match), then executes
the **image's own** code objects and reads the field set off each constructed pydantic model. Result:
31 `Action` subclasses, recorded at `docs/evidence/tool-action-fields.json`.

The evidence does not support the spec as written, and it fails in the direction opposite to
intuition.

## Finding 1 — the terminal tool carries no field naming anything it touches

`TerminalAction` has exactly four fields: `command: str`, `is_input: bool`, `timeout: float | None`,
`reset: bool` (`openhands/tools/terminal/definition.py`, verified in image). There is no path field,
no host field, no file list. Everything the command will touch is inside an opaque shell string.

Producing a blast radius for the terminal tool therefore requires **parsing shell**, and shell
parsing is interpretation, not projection. It is not "computed solely from named native fields" in
any sense condition (a) admits: the inputs to the computation would be substrings that no upstream
field names, delimits, or guarantees.

The consequence is that the single most dangerous tool — the one the operator most wants a blast
radius for — is the one where none can be derived. That is uncomfortable, and it is the correct
reading of the evidence. A parse of

```
rm -rf ~/dev/oh-gui/node_modules && docker volume prune -f && git clean -xfd ~/dev/oh-gui
```

that renders "touches: `~/dev/oh-gui/node_modules`, `~/dev/oh-gui`" is not merely incomplete. It is
**confidently wrong in the favorable direction**: it omits `docker volume prune -f`, which under
this operator's standing constraint is the single most destructive command available on Colossus
(~122 GB across 69 volumes, permanently off-limits). It has no path argument for a parser to find.

An operator who reads a blast radius on a terminal action and sees two node_modules paths has been
told the action is smaller than it is. Under Principle 8 this is worse than showing nothing: a
control that displays and enforces nothing is worse than an absent one, and a *field* that displays
a falsely reassuring value is the same failure in the data layer. It is also precisely the
`trajectory/hook.py` defect recorded in ADR-015's Context — manufacturing a value where the native
signal is absent, and manufacturing the favorable one.

## Finding 2 — "credentials touched" has no native basis anywhere

Across all 31 `Action` subclasses there is **no** field whose name or type carries credentials,
secrets, tokens, keys, environment, or authentication material. Not one. This is the same category
as ADR-015 Finding 1 (analyzer identity): not a missing verification, but a field that does not
exist to be projected. It is not derivable, and no adapter recovers it.

## Finding 3 — "network hosts" reduces to exactly one field

`BrowserNavigateAction.url: str` is the only native field on any action that carries a network
host. The remaining fifteen browser actions address tabs and elements by index or id and name no
host at all. Reporting the host of a `BrowserClickAction` would require reading browser session
state that no action field carries.

## Finding 4 — `MCPToolAction` has no static field set at all

`MCPToolAction` (`openhands/sdk/mcp/definition.py`) declares exactly one field: `data: dict[str,
Any]`. The shape of that payload is defined at runtime by whichever MCP server is connected, and is
not knowable from any pinned artifact.

This is a third category, distinct from both derivable and underivable-by-parsing. There is no
fixed set of fields to declare a projection over, and the set can change between sessions without
any version of anything changing. A projection table keyed on class name cannot cover it even in
principle.

## Finding 5 — five SDK builtin actions, none of them filesystem or network

The wider scan also found `FinishAction(message)`, `ThinkAction(thought)`,
`InvokeSkillAction(name)`, `SwitchLLMAction(profile_name, reason)` and
`VisionInspectAction(image_index, question, profile_name)`. All five have `extra=forbid` and none
touches a path, a host, or a credential. They are correctly `null` under the rule below, and now
they are `null` **by verified decision** rather than by having been missed.

`openhands-workspace` and `openhands-agent-server` were scanned and define no `Action` subclass at
all. That is recorded in the evidence file as checked-and-empty, which is not the same fact as
not-checked.

## Decision

**0. Discovery is by scan, never by a hand-kept list.** `scripts/verify_tool_actions.py` walks
every `openhands.*` code object in the image and finds classes by name. The hand-kept list is
exactly what produced the first revision's blind spot, and a list would go stale on the next
upstream release with no signal.

**1. Blast radius ships as a declared projection table over verified native fields, with an
explicit `null` for every tool class not in the table.**

Declared projections (all field names verified in the pinned image, `docs/evidence/tool-action-fields.json`):

| Action class | Native inputs | Projection |
|---|---|---|
| `FileEditorAction` | `path`, `command` | one path, with the native `command` literal shown beside it |
| `PlanningFileEditorAction` | `path`, `command` | as above |
| `EditAction` | `file_path` | one path |
| `WriteFileAction` | `file_path` | one path |
| `ReadFileAction` | `file_path` | one path |
| `ListDirectoryAction` | `dir_path`, `recursive` | one path, recursive flag shown natively |
| `GlobAction` | `path`, `pattern` | search root + pattern, **not** a resolved file list |
| `GrepAction` | `path`, `pattern`, `include` | search root + pattern, **not** a resolved file list |
| `BrowserNavigateAction` | `url` | one network host, parsed by WHATWG URL, `null` on parse failure |

**2. Every other tool class renders `null`** — explicitly "not computed", visually distinct from an
empty list. This includes `TerminalAction`, `ApplyPatchAction` (paths live inside the
`*** Begin Patch` body, which is again parsing, not projection), `TaskAction`, `DelegateAction`,
`WorkflowAction`, `ConsultTomAction`, the fifteen non-navigate browser actions, the five SDK
builtins from Finding 5, and `MCPToolAction`.

**2b. A tool with no projection still shows its native inputs verbatim, under a heading that
promises no analysis.** Ratified as option B. Rendering nothing would withhold information the
operator already needs and which is already native — `TerminalAction.command` is on the card
regardless. What is refused is the *implication of analysis*: the raw value appears under a heading
that names the native field and states no projection was computed, never under a "blast radius"
heading. The distinction is between showing an operator a command and telling them what it will do.

This costs nothing in fidelity: the value is native, displayed at its native field name, unparsed.
It concedes nothing to the shell parser rejected in Alternative A — no substring is extracted, no
target is claimed, no completeness is implied. A test must fail if a projected value and a raw
native value render under the same heading or with the same affordance.

**2a. `MCPToolAction` renders `null` permanently, not pending work.** Per Finding 4 there is no
static field set to project. The card must name the MCP tool via the native `ActionEvent.tool_name`
and state that no projection is possible for MCP tools — distinct from "none declared yet", which
would imply a future in which one is. Under 2b its native `data` dict is shown verbatim as JSON,
unparsed, under the same no-analysis heading.

**3. `GlobAction` and `GrepAction` project a search root, never a match set.** The set of files a
glob will match is not knowable before execution and is not a native field. Showing a root labelled
as a root is honest; showing a file list would be a prediction.

**4. Spec 04 §4.2 is amended:** "credentials touched" is **dropped** with no substitute, per
Finding 2. Nothing native replaces it, and inventing a heuristic ("this command mentions `AWS_`")
would be the manufacture that ADR-015 clause 3 forbids.

**5. Condition (e) is satisfied literally.** Each projected value renders with its native field
name and native value inline — `path = "/home/rmholston/dev/oh-gui/vite.config.ts"`, not a bare
path. The operator audits the derivation rather than trusting the label.

**6. The `null` case is not silent.** Where no projection exists the card states which tool class
was seen and that no projection is declared for it, so an operator can tell "this tool has no
declared projection" from "this tool touches nothing." A test must fail if these two render alike.

## Rationale

**Alternative A — parse shell for `TerminalAction` (rejected).** Considered and rejected on the
`docker volume prune -f` case above. Shell parsing cannot be made sound for this purpose: command
substitution, aliases, `eval`, variable expansion, and `&&` chains all defeat it, and every failure
mode under-reports. A blast radius that is right 90% of the time on the terminal tool trains the
operator to trust it, which makes the 10% worse than never having shipped it. If it is ever
attempted it belongs behind its own ADR with an accuracy gate, not inside this slice.

**Alternative B — parse the apply_patch body (rejected, weaker).** The `*** Begin Patch` format is
formally specified and a header parse would be far more sound than shell. It is rejected here for a
different reason: it would be a second implementation of upstream's own parser living in our
frontend, which is exactly the divergence risk ADR-015 clause 7 orders eliminated for the
trust-dial mirror. If upstream ever exposes parsed paths as a native field, this becomes a
projection and can be added.

**Alternative C — omit blast radius entirely (rejected).** Nine tool classes do have clean native
path fields. Withholding a sound projection because an unsound one is impossible elsewhere would
lose real operator value, and the per-tool `null` mechanism already makes the boundary visible.

## Consequences

- New: `apps/gui/src/features/authorization/blast-radius.ts` — the projection table, one entry per
  class above, returning a discriminated result (`projected` | `no-projection-declared`).
- New: `scripts/verify_tool_actions.py`, `docs/evidence/tool-action-fields.json`.
- `docs/UPSTREAM_PINS.md` §2 gains sdist digests for all four Python distributions, including
  the previously unpinned `openhands-tools`, `openhands-workspace`, and `openhands-agent-server`.
- `docs/specs/04-authorization.md` §4.2 amended: credentials dropped; blast radius gains the
  per-tool table and the terminal-tool exclusion.
- `PORTING_LEDGER.md`: blast radius logged as DERIVED with native basis and formula per ADR-015
  condition (d).
- A contract test must fail if a new `Action` class appears in the evidence file with no decision
  recorded here — silence must not default to `null`-by-accident.

## Lock-in phase

Phase 1, before the authorization card transmits any decision.

## References

- `adrs/ADR-015-native-fidelity-boundary.md` (DERIVED conditions (a)–(e); Findings 1–4)
- `adrs/ADR-022-narrow-viewport-gate-is-a-ui-affordance.md`
- `docs/evidence/tool-action-fields.json`
- `docs/specs/04-authorization.md` §4.2
- `docs/UPSTREAM_PINS.md` §2
