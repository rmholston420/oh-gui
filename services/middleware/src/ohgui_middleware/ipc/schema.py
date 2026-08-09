"""Wire types for the hook <-> middleware IPC seam.

ADR-014 clause 1: the hook serializes its stdin payload here and translates the verdict
back to allow/deny. It holds no policy and no state.

**Native fidelity (ADR-015).** The request mirrors the SDK's documented `pre_tool_use`
stdin envelope field-for-field and adds nothing. `tool_input` is carried as an opaque
mapping — this slice makes no claim about its contents. ADR-014's verification gate item 3
("`tool_input` is confirmed to carry the arguments we intend to judge, for each tool class")
is unrun, so any typed projection over it would be a guess.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Verdict = Literal["allow", "deny"]

#: Where a decision came from. `failclosed` means no policy produced this verdict — the
#: guard did, because something went wrong. It must never be indistinguishable from a
#: policy `deny`, or a broken gate looks exactly like a working strict one.
DecisionSource = Literal["policy", "failclosed"]


class AuthorizeRequest(BaseModel):
    """The `pre_tool_use` hook envelope, verbatim.

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
