# ADR-023 — Blast radius is a per-tool projection, and the terminal tool has none

**Status:** Proposed — awaiting operator ratification
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

## Decision

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
`WorkflowAction`, `ConsultTomAction`, and the fifteen non-navigate browser actions.

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
- `docs/UPSTREAM_PINS.md` §2 gains sdist digests, including the previously unpinned
  `openhands-tools`.
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
