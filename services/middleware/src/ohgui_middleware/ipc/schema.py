"""Wire types for the hook <-> middleware IPC seam.

ADR-014 clause 1: the hook serializes its stdin payload here and translates the verdict
back to allow/deny. It holds no policy and no state.

**Native fidelity (ADR-015).** The request mirrors the `pre_tool_use` stdin envelope
field-for-field and adds nothing. `tool_input` is carried as an opaque mapping — this slice
makes no claim about its contents. ADR-014's verification gate item 3 ("`tool_input` is
confirmed to carry the arguments we intend to judge, for each tool class") is unrun, so any
typed projection over it would be a guess.

**ADR-021 classification.** `Decision` is OH-GUI's own contract and free. `AuthorizeRequest`
is upstream-shaped and hand-authored, which ADR-021 permits only against a verified native
basis — an artifact path and line. That basis now exists: see
`docs/evidence/hook-envelope/envelope.json`, produced by executing the `HookEvent` model
extracted from `agent-server@sha256:f0244fd7…` itself. The earlier hand-written version of
this model, taken from documentation, got four of eight fields wrong.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Verdict = Literal["allow", "deny"]

#: Where a decision came from. `failclosed` means no policy produced this verdict — the
#: guard did, because something went wrong. It must never be indistinguishable from a
#: policy `deny`, or a broken gate looks exactly like a working strict one.
DecisionSource = Literal["policy", "failclosed"]


#: Set while `AuthorizeRequest` rests on documentation rather than an observed envelope.
#: `checks.provisional_types_not_wired` refuses to let a hook be installed while it is True,
#: and `scripts/check-hard-constraints.py` fails the build if that rule is violated.
#:
#: Cleared 2026-08-08: the shape is no longer inferred. `scripts/extract_image_sdk.py` pulls
#: `openhands.sdk.hooks.types` out of the pinned image's PyInstaller bundle, proves it matches
#: the pinned upstream sdist, then executes it to serialize a real envelope.
#:
#: What this does NOT establish, and what still gates ADR-014: the *static* shape is verified,
#: the *runtime population* is not. Nothing here observes a live agent-server filling these
#: fields during a real tool call, so ADR-014 items 1-4 stand unrun.
AUTHORIZE_REQUEST_PROVISIONAL = False


class AuthorizeRequest(BaseModel):
    """The `pre_tool_use` hook envelope, as the pinned image actually defines it.

    Native basis: `openhands.sdk.hooks.types.HookEvent`, extracted from
    `agent-server@sha256:f0244fd7…` and executed to produce
    `docs/evidence/hook-envelope/envelope.json`. Regenerate with
    `scripts/capture-hook-envelope.sh`; `scripts/diff_envelope.py` fails on any drift.

    Four corrections against the previous documentation-derived version, all confirmed by
    running the image's own model:

    - `tool_name` is `str | None` upstream. We required `str`.
    - `tool_input` is `dict | None` upstream. We defaulted it, which still rejects an
      explicit null — and the image always sends the key, null included.
    - `tool_response` is always serialized, always null for `pre_tool_use`. Undeclared.
    - `message` likewise. Undeclared.

    The nulls matter because `model_dump_json` does not drop them: all eight keys are present
    on every event. Under the old model a real `pre_tool_use` with a null `tool_input` would
    have failed validation, and `server.authorize` would have denied it as unparseable — every
    call, with a message blaming the payload. Fail-closed, so not an escape, but an
    indistinguishable-from-broken gate is the kind an operator switches off.

    Nullable `tool_name` is a wire-level fact, not a licence to judge a nameless call. See
    `is_judgeable`.

    Extra fields are *preserved*, not rejected: upstream adding a field must not turn the
    gate into a 422, which fails open in effect by making every call error out at the edge.
    """

    model_config = ConfigDict(extra="allow")

    event_type: str
    tool_name: str | None = None
    tool_input: dict[str, Any] | None = None
    tool_response: dict[str, Any] | None = None
    message: str | None = None
    session_id: str | None = None
    working_dir: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def is_judgeable(self) -> tuple[bool, str]:
        """Can a policy meaningfully rule on this call?

        Accepting a null `tool_name` at the wire keeps the gate from 422-ing on a shape the
        image is entitled to send. It must not quietly become an *allow* of an unidentified
        tool. In the shipped SDK `ActionEvent.tool_name` is a required `str`
        (`event/llm_convertible/action.py:44`), so this should be unreachable in practice —
        which is exactly why it needs a deny rather than an assumption.
        """
        if self.tool_name is None:
            return False, "envelope carried no tool_name; refusing to judge an unnamed call"
        if self.tool_input is None:
            return False, f"envelope carried no tool_input for {self.tool_name!r}"
        return True, ""


class Decision(BaseModel):
    """A verdict. Immutable, and always attributed."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    verdict: Verdict
    #: Operator-visible. ADR-014 clause 7 requires a deny to reach the audit log with a
    #: reason the operator can read, including denies that never executed.
    reason: str
    source: DecisionSource

    @property
    def is_allow(self) -> bool:
        return self.verdict == "allow"


def deny(reason: str, *, source: DecisionSource = "failclosed") -> Decision:
    return Decision(verdict="deny", reason=reason, source=source)


def allow(reason: str) -> Decision:
    return Decision(verdict="allow", reason=reason, source="policy")
