"""The fail-closed guard, and proof that the guard is the thing doing the work.

Every fault case is asserted twice:

  1. **Guarded** — through `guarded_decide`. Must deny.
  2. **Unguarded control** — the same faulty resolver called directly. Must NOT produce a
     deny; it raises, hangs, or returns junk.

The control half is the point. A test that only asserts "denied" would still pass if
`guarded_decide` were replaced by `return deny(...)` unconditionally, and it would also
pass if the fault never happened. Pairing the two pins the guard as the cause. This is the
same shape as ADR-014's verification gate item 2 ("both halves; the second is what proves
the wrapper is the thing doing the work"), applied to the seam rather than to the hook.
"""

from __future__ import annotations

import asyncio

import pytest

from ohgui_middleware.ipc.failclosed import (
    PolicyPlaneNotInstalled,
    guarded_decide,
    null_resolver,
)
from ohgui_middleware.ipc.schema import AuthorizeRequest, Decision, allow

FAST = 0.25


def req(tool: str = "bash") -> AuthorizeRequest:
    return AuthorizeRequest(
        event_type="pre_tool_use",
        tool_name=tool,
        tool_input={"command": "rm -rf /"},
        session_id="s1",
        working_dir="/home/rmholston/dev/oh-gui",
    )


# --------------------------------------------------------------------------- happy path


async def test_allow_passes_through_unchanged() -> None:
    async def ok(_: AuthorizeRequest) -> Decision:
        return allow("operator approved")

    d = await guarded_decide(ok, req(), timeout_s=FAST)
    assert d.verdict == "allow"
    assert d.source == "policy"


async def test_policy_deny_is_attributed_to_policy_not_to_the_guard() -> None:
    async def refuse(_: AuthorizeRequest) -> Decision:
        return Decision(verdict="deny", reason="operator rejected", source="policy")

    d = await guarded_decide(refuse, req(), timeout_s=FAST)
    assert (d.verdict, d.source) == ("deny", "policy")
    # A broken gate must never be indistinguishable from a working strict one.


# ------------------------------------------------------------------- fault: no policy


async def test_default_resolver_denies_because_no_policy_is_installed() -> None:
    d = await guarded_decide(null_resolver, req(), timeout_s=FAST)
    assert d.verdict == "deny"
    assert d.source == "failclosed"
    assert "no policy plane is installed" in d.reason


async def test_control_default_resolver_raises_when_unguarded() -> None:
    with pytest.raises(PolicyPlaneNotInstalled):
        await null_resolver(req())


# ---------------------------------------------------------------------- fault: timeout


async def _hangs(_: AuthorizeRequest) -> Decision:
    await asyncio.sleep(30)
    return allow("never reached")


async def test_timeout_denies() -> None:
    d = await guarded_decide(_hangs, req(), timeout_s=0.05)
    assert d.verdict == "deny"
    assert d.source == "failclosed"
    assert "did not answer" in d.reason


async def test_control_timeout_never_resolves_when_unguarded() -> None:
    # Without the wrapper there is no verdict at all — the caller waits forever. Asserted
    # by proving a short external timeout fires, i.e. the resolver did not self-limit.
    with pytest.raises(TimeoutError):
        async with asyncio.timeout(0.05):
            await _hangs(req())


# -------------------------------------------------------------------- fault: exception


async def _explodes(_: AuthorizeRequest) -> Decision:
    raise RuntimeError("policy plane fell over")


async def test_exception_denies() -> None:
    d = await guarded_decide(_explodes, req(), timeout_s=FAST)
    assert d.verdict == "deny"
    assert "RuntimeError" in d.reason
    assert "policy plane fell over" in d.reason


async def test_control_exception_propagates_when_unguarded() -> None:
    with pytest.raises(RuntimeError, match="fell over"):
        await _explodes(req())


@pytest.mark.parametrize("exc", [MemoryError, KeyboardInterrupt, SystemExit])
async def test_even_baseexception_denies(exc: type[BaseException]) -> None:
    async def boom(_: AuthorizeRequest) -> Decision:
        raise exc()

    d = await guarded_decide(boom, req(), timeout_s=FAST)
    assert d.verdict == "deny"


async def test_cancellation_denies_rather_than_propagating() -> None:
    async def cancelled(_: AuthorizeRequest) -> Decision:
        raise asyncio.CancelledError()

    d = await guarded_decide(cancelled, req(), timeout_s=FAST)
    assert d.verdict == "deny"
    assert "cancelled" in d.reason


# --------------------------------------------------------------- fault: malformed verdict


@pytest.mark.parametrize(
    "bad",
    [None, "allow", {"verdict": "allow"}, 1, True, ["allow"]],
    ids=["none", "bare-string", "dict", "int", "bool", "list"],
)
async def test_non_decision_return_denies(bad: object) -> None:
    async def junk(_: AuthorizeRequest) -> object:
        return bad

    d = await guarded_decide(junk, req(), timeout_s=FAST)
    assert d.verdict == "deny"
    assert "not a Decision" in d.reason


async def test_control_non_decision_returns_truthy_junk_when_unguarded() -> None:
    async def junk(_: AuthorizeRequest) -> object:
        return {"verdict": "allow"}

    got = await junk(req())
    # Unguarded, a caller doing the obvious thing reads this as an allow.
    assert got["verdict"] == "allow"  # type: ignore[index]


async def test_unknown_verdict_string_denies() -> None:
    # The donor's exact defect: `{"decision":"block"}` is not a string the SDK recognises,
    # so its retry enforcement never fired (ADR-014 Context). Constructed by bypassing
    # validation, because that is how it reaches us in the wild — from another process.
    smuggled = Decision.model_construct(verdict="block", reason="donor-style", source="policy")

    async def weird(_: AuthorizeRequest) -> Decision:
        return smuggled

    d = await guarded_decide(weird, req(), timeout_s=FAST)
    assert d.verdict == "deny"
    assert "unknown verdict" in d.reason


async def test_control_unknown_verdict_is_not_a_deny_when_unguarded() -> None:
    smuggled = Decision.model_construct(verdict="block", reason="donor-style", source="policy")
    assert smuggled.verdict != "deny"
    assert not smuggled.is_allow
    # Neither allow nor deny: silently un-actionable. That is the donor failure mode.


# ------------------------------------------------------------------------ no caching


async def test_a_prior_allow_is_never_reused(monkeypatch: pytest.MonkeyPatch) -> None:
    """ADR-014 clause 5: a cached allow is a bypass with a shelf life."""
    calls = 0

    async def counting(_: AuthorizeRequest) -> Decision:
        nonlocal calls
        calls += 1
        return allow("approved once")

    for _ in range(3):
        await guarded_decide(counting, req(), timeout_s=FAST)
    assert calls == 3
