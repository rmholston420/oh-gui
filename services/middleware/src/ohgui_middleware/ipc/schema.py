"""Wire types for the hook <-> middleware IPC seam.

ADR-014 clause 1: the hook serializes its stdin payload here and translates the verdict
back to allow/deny. It holds no policy and no state.

**Native fidelity (ADR-015).** The request mirrors the SDK's documented `pre_tool_use`
stdin envelope field-for-field and adds nothing. `tool_input` is carried as an opaque
mapping — this slice makes no claim about its contents. ADR-014's verification gate item 3
("`tool_input` is confirmed to carry the arguments we intend to judge, for each tool class")
is unrun, so any typed projection over it would be a guess.

**ADR-021 classification.** `Decision` is OH-GUI's own contract and free. `AuthorizeRequest`
is upstream-shaped and hand-authored, which ADR-021 permits only against a verified native
basis — an artifact path and line. The paragraph above says *documented*, and ADR-015 exists
because documentation is not verification. It is therefore marked below and gated.
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
AUTHORIZE_REQUEST_PROVISIONAL = True


class AuthorizeRequest(BaseModel):
    """The `pre_tool_use` hook envelope. **PROVISIONAL — UNVERIFIED** (ADR-021).

    Native basis: *none yet*. These field names were taken from the SDK's documented envelope,
    not from an observed one. Under ADR-015 that is an unverified mirror, and a hand-written
    mirror has already shipped one wrong decision on this project (DEBUG_LOG 2026-08-08 20:05).

    A wrong field shape here fails in the dangerous direction: the middleware would read
    `tool_name` as absent, judge an empty call, and the operator would see a gate that looks
    installed. So the marker is load-bearing — **no hook may be installed while it stands.**

    Cleared by ADR-014 verification gate item 5: capture the real envelope against the pinned
    `agent-server@sha256:f0244fd7…` container, diff it field-by-field, record it in ADR-021,
    then replace this docstring with the artifact path and line and set the flag False.

    Extra fields are *preserved*, not rejected: upstream adding a field must not turn the
    gate into a 422, which fails open in effect by making every call error out at the edge.
    """

    model_config = ConfigDict(extra="allow")

    event_type: str
    tool_name: str
    tool_input: dict[str, Any] = Field(default_factory=dict)
    session_id: str | None = None
    working_dir: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


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
