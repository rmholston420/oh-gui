# ADR-014 — The SDK hook is a deny gate, not a policy plane: where Phase 1 enforcement lives

**Status:** Proposed — ratification gated on executable verification (see Verification gate)

> **RATIFICATION REVIEW 2026-08-09 01:38 EDT.** Reviewed for ratification and **not ratified.**
> The static shape is now verified — `scripts/extract_image_sdk.py` pulls `openhands.sdk.hooks.types`
> from the pinned image, proves it matches the pinned upstream sdist, and executes it to serialize a
> real envelope, which is why `AUTHORIZE_REQUEST_PROVISIONAL` was cleared to `False` on 2026-08-08.
> That clears nothing in the gate below. All four items require a hook to *execute against a live
> pinned agent-server* and be asserted on the destination state; none has been run. Ratifying on the
> static evidence would repeat the ADR-001 Amendment #1 error the gate was written to prevent —
> mistaking a read artifact for an observed behaviour. Items 1–4 are executable only on Colossus
> (no container runtime in the agent sandbox); the commands are staged in `SESSION_HANDOFF.md`.
**Lock-in phase:** Phase 1 (Authorization slice)
**Supersedes:** —

## Context

ADR-001 item 3 puts the entire policy plane in Python middleware running in-process with
`openhands-sdk`. It does not say **by what mechanism** the middleware intercepts a tool call before
it executes. `docs/specs/04-authorization.md` §4.2 assumes the conversation can enter
`WAITING_FOR_CONFIRMATION` and stay there until the operator decides, with expiry
(§4.2.1), an exportable audit log, and an emergency stop (Phase 1 scope in `11-dev-plan.md`).

The Forge-OH review read the SDK 1.40.0 and 1.41.0 sdists directly and mapped the one available
interception point. **The hook package and `openhands/sdk/event/` are byte-identical between the two
versions**, so the finding holds at our 1.41 pin. A `pre_tool_use` wildcard `HookType.COMMAND`
receives JSON on stdin (`event_type`, `tool_name`, `tool_input` = `action.model_dump()`,
`session_id`, `working_dir`, `metadata`) and can:

| Operation | Available |
|---|---|
| Inspect tool name and arguments | **Yes** |
| Block the pending action | **Yes** — exit 2, `{"decision":"deny"}`, or `{"continue":false}` |
| Attach diagnostic context | Partly — camel-case `additionalContext` |
| Modify or replace the action | **No** — `HookResult` has no mutation field |
| Native ASK / pending state | **No** — commented future concept, `hooks/types.py:35-45` |
| Fail closed on hook error or timeout | **No** — error, timeout, exit 1 and malformed output all produce an *error* result, not a block |
| Cancel work already in flight | **No** — pre-tool runs before execution |

Every one of the four §4.2 requirements — ASK, expiry, audit, emergency stop — is in the "No"
column. The spec's assumed mechanism does not exist in the SDK.

The donor demonstrates both failure modes of getting this wrong. `verify/hook.py` emits
`{"decision":"block"}` and exits 0, which the SDK does not recognize, so **its retry enforcement has
never fired** — and `tests/verify/test_loop.py:136-142` pins the invalid string as expected,
so the test suite certifies the broken behavior. Separately, `gpu/hook.py` reads stdin and discards
it, so the only true pre-tool hook in the donor cannot see the arguments it would need to judge.

## Decision

**The SDK `pre_tool_use` hook is a thin, synchronous, fail-closed deny gate and nothing else. All
authorization state lives in OH-GUI middleware, reached from the hook over localhost IPC.**

1. **One hook, minimal.** A single wildcard `pre_tool_use` command hook. It serializes stdin to the
   middleware, waits for a verdict, and translates it to allow or deny. It contains **no policy**.
2. **ASK is synthesized by blocking.** There is no native pending state, so the hook **blocks** on
   the middleware call while the operator decides. The card, the timer, the expiry and the
   resolution are middleware-side. From the SDK's perspective there are only two outcomes.
3. **Fail closed, inverting the SDK default.** IPC failure, middleware unreachable, timeout,
   malformed verdict, or any unexpected exception ⇒ **deny**. The SDK's own default is to treat all
   of these as an error result that lets the action proceed; we must not inherit it.
4. **`{"decision":"deny"}` with exit code 2.** Both, not either. The donor's exit-0 defect is a
   direct consequence of relying on the JSON field alone with an unverified string.
5. **The hook never decides; the middleware never executes.** The hook holds no allowlist, no
   trust-dial state, no cache of prior grants. A cached "allow" is a bypass with a shelf life.
6. **Emergency stop cannot be a pre-tool concern.** Pre-tool cannot cancel in-flight work, so the
   emergency stop is a separate control against the conversation and the process, and must be
   specified as such rather than assumed to fall out of the hook.
7. **Audit is written by the middleware at decision time**, not by the hook and not at execution
   time — an action denied before execution must still appear in the log.
8. **No donor hook file is vendored.** `gpu/hook.py` is taken as a seam reference only; the
   `verify` and `trajectory` hooks are stop hooks with confirmed defects and are excluded.

## Verification gate — this ADR is not ratified until these pass

Recorded as a gate because ADR-001 Amendment #1 had to retract four Context claims that came from
reading prose instead of artifacts. This ADR's claims come from the sdists, which is better, but
**no hook has yet been executed against the pinned 1.41.0 server.** Required, on Colossus:

- [ ] A hook returning `{"decision":"deny"}` + exit 2 demonstrably prevents the tool from running —
      asserted on the destination state (the file is unchanged / the command left no trace), not on
      the hook's own log line.
- [ ] A hook that times out demonstrably **denies** under our wrapper, and demonstrably **allows**
      without it. Both halves; the second is what proves the wrapper is the thing doing the work.
- [ ] `tool_input` is confirmed to carry the arguments we intend to judge, for each tool class in
      the Phase 1 capability manifest — not just for `bash`.
- [ ] A deny is present in the audit log with the operator-visible reason.
- [x] **The `pre_tool_use` envelope is captured and diffed field-by-field against
      `ipc/schema.py:AuthorizeRequest`** — added 2026-08-08 by
      [ADR-021](ADR-021-dto-generation-boundary.md), **discharged 2026-08-08 21:58 EDT**.

      Evidence: `docs/evidence/hook-envelope/envelope.json`, regenerated by
      `scripts/capture-hook-envelope.sh`.

      The documented mirror was wrong in four of eight fields. `tool_name` and `tool_input` are
      both nullable upstream; we required the first and defaulted the second, and the image sends
      explicit nulls for both. `tool_response` and `message` are always serialized and were
      undeclared. Because `model_dump_json` does not drop nulls, all eight keys arrive on every
      event — so a real `pre_tool_use` would have failed validation and been denied as
      *unparseable*, on every call. Fail-closed, so not an escape; but a gate that denies
      everything while blaming the payload is one an operator removes.

      **Scope of what this discharges.** The capture is *static*. The image ships no importable
      Python and no interpreter; the SDK lives in a PyInstaller bundle inside a single stripped
      binary. The harness extracts `openhands.sdk.hooks.*` from that bundle, proves it matches the
      pinned upstream sdist structurally, and executes the image's own `HookEvent` to serialize the
      envelope. That establishes the **shape** the image defines. It does **not** observe a live
      agent-server populating those fields during a real tool call. Items 1-4 below are exactly the
      things that would need that, and they remain unrun.

Until all five are executed and logged, §4.2's mechanism remains **assumed**. Item 5 is now
discharged; **items 1-4 are not**, so the mechanism is still assumed and ADR-014 stays *Proposed*.

## Rationale

**Why not put policy in the hook.** It is a subprocess spawned per tool call with no durable state,
no way to render a card, and no way to be told the operator's answer. Any state it held would be a
cache of an authorization decision, which is the thing least safe to cache.

**Why blocking-as-ASK rather than deny-and-retry.** Deny-and-retry — refuse, then let the agent
re-propose after approval — loses the exact action. The operator approved a specific command; the
re-proposed one may differ. §4.2 requires the card to show "the exact command/patch/tool call about
to execute", and only holding the original satisfies that.

**Why fail-closed is worth the availability cost.** A fail-open authorization gate is
indistinguishable from no gate precisely when it matters — under fault. This is Principle 8 again:
the control that displays correctly and enforces nothing is worse than an absent one, because the
operator relies on it. ADR-006 rejected an inert control for the same reason.

**Alternatives rejected:**

- **`ConfirmationPolicy` / `SecurityAnalyzer` alone, no hook.** These are the correct home for
  *risk classification* and ADR-006 already binds their use. They are not an interception point for
  an arbitrary tool call, and §4.8's `execute_tool()` bypass is not closed by them.
- **Patch the SDK to add a native ASK state.** Violates ADR-001 item 1 outright. Also puts us on a
  2–3 day rebase treadmill for the single most security-sensitive path in the product.
- **Adopt the donor's hook layer and repair it.** Its only pre-tool hook cannot read its own input,
  its stop hooks contain a defect certified by their own tests, and `stop_on_block=True` means
  repairing one silently disables another. Cheaper to write 60 correct lines.

## Consequences

- `docs/specs/04-authorization.md` §4.2 needs an amendment naming the mechanism and stating that
  ASK is synthesized rather than native. Deferred until the verification gate passes — amending the
  spec from an unverified premise is the ADR-001 Amendment #1 failure repeated.
- Phase 1 gains a hard prerequisite: the middleware IPC endpoint must exist and be fail-closed
  before the hook is installed. Installing the hook first yields a gate that denies everything or,
  worse, allows everything.
- The emergency stop becomes its own design item (clause 6) rather than an assumed by-product.
- `PORTING_LEDGER.md`: donor hook files marked reference-only / excluded per clause 8.
- The audit log's write point is fixed at decision time, which constrains its schema — it must
  represent actions that never executed.

## Lock-in phase

Phase 1. Must be ratified before the first line of middleware enforcement is written, and Phase 0
must close first (`11-dev-plan.md` is a vertical-slice sequence, and ADR-013 blocks Phase 0 exit).

## References

- ADR-001 items 1, 3, 4 and Amendment #1 (the lesson this ADR's verification gate encodes)
- ADR-006 — an inert authorization control is worse than none
- `docs/specs/04-authorization.md` §§4.2, 4.2.1, 4.8; `docs/specs/01-principles.md` Principle 8
- `docs/forge-oh-code-review.md` §2 — the seam table, read from the sdists
- `docs/forge-oh-review/03-tools-ext.md` — 1.40/1.41 wheel diff; `hooks/executor.py:28-66`, `475-510`; `hooks/types.py:35-45`; `hooks/manager.py:180-196`
- `docs/UPSTREAM_PINS.md` — SDK / agent-server 1.41.0
