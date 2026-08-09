"""The middleware must accept the envelope the pinned image actually sends.

These tests are driven by `docs/evidence/hook-envelope/envelope.json` — the payload produced
by executing `HookEvent` extracted from `agent-server@sha256:f0244fd7…`. They are the
regression guard for the defect the capture found: the documentation-derived `AuthorizeRequest`
required `tool_name: str` and defaulted `tool_input`, while the image sends both as explicit
nulls. Every `pre_tool_use` call would have failed validation and been denied as *unparseable*.

That is fail-closed, so nothing escapes. It is still a serious bug, and the reason it needs a
test rather than a fix-and-move-on is the failure mode: a gate that denies every call while
blaming the payload is indistinguishable from a broken integration, and the fastest way for an
operator to make the agent work again is to take the gate out.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import pytest
from ohgui_middleware.ipc.schema import AuthorizeRequest, Decision, allow
from ohgui_middleware.ipc.server import create_app

pytestmark = pytest.mark.anyio

EVIDENCE = Path(__file__).resolve().parents[3] / "docs" / "evidence" / "hook-envelope" / "envelope.json"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@asynccontextmanager
async def client(app) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        yield c


def captured_payload() -> dict:
    return json.loads(EVIDENCE.read_text(encoding="utf-8"))["example_payload"]


def test_the_evidence_directory_holds_nothing_but_evidence() -> None:
    """Only the capture and its README may live here.

    The first capture script left `locate.err` and `types-path.txt` in this directory when it
    failed. They were never committed, but debris in an evidence directory is how a hand-made
    file eventually gets read as a capture. Anything new here is either evidence — in which case
    name it in this test and say in the README how it is produced — or it does not belong.
    """
    present = {p.name for p in EVIDENCE.parent.iterdir() if not p.name.startswith(".")}
    assert present == {"README.md", "envelope.json"}, (
        f"unexpected files in the evidence directory: {sorted(present - {'README.md', 'envelope.json'})}"
    )


def test_the_evidence_file_still_looks_like_a_capture() -> None:
    """Guard against the evidence being replaced by something hand-written.

    Not a strong check — a determined edit passes it. It exists so that an *accidental*
    truncation or a placeholder committed in a hurry does not silently satisfy every other
    test in this file.
    """
    data = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    assert "agent-server@sha256:f0244fd7" in data["source"]
    assert set(data["serialized_keys"]) == set(data["example_payload"]), (
        "the recorded key list and the recorded payload disagree"
    )
    assert len(data["serialized_keys"]) == 8


def test_nulls_are_not_dropped_by_the_image() -> None:
    """`model_dump_json` keeps nulls, so all eight keys arrive on every event.

    This is the fact the old model got wrong, so it is asserted directly rather than left
    implicit in the tests below.
    """
    payload = captured_payload()
    assert payload["tool_response"] is None
    assert payload["message"] is None
    assert len(payload) == 8


async def test_the_real_envelope_reaches_the_resolver() -> None:
    seen: list[AuthorizeRequest] = []

    async def spy(req: AuthorizeRequest) -> Decision:
        seen.append(req)
        return allow("ok")

    async with client(create_app(resolver=spy)) as c:
        r = await c.post("/v1/authorize", json=captured_payload())

    assert r.json()["verdict"] == "allow", (
        "the captured envelope was rejected before reaching policy: " + r.json()["reason"]
    )
    assert len(seen) == 1
    assert seen[0].tool_name == "execute_bash"
    assert seen[0].tool_input == {"command": "rm -rf /"}


async def test_explicit_nulls_do_not_deny_as_unparseable() -> None:
    """The exact shape the old model rejected: tool_name and tool_input both null.

    It must reach policy. Policy is then free to deny it — and does, below — but the denial
    has to be a judgement, not a parse failure.
    """
    payload = {**captured_payload(), "tool_name": None, "tool_input": None}
    reached = False

    async def spy(_: AuthorizeRequest) -> Decision:
        nonlocal reached
        reached = True
        return allow("ok")

    async with client(create_app(resolver=spy)) as c:
        r = await c.post("/v1/authorize", json=payload)

    assert reached, f"null tool_name/tool_input never reached policy: {r.json()['reason']}"


def test_an_unnamed_call_is_not_judgeable() -> None:
    """Accepting null on the wire must not become an allow of an unidentified tool."""
    ok, why = AuthorizeRequest(event_type="PreToolUse", tool_name=None).is_judgeable
    assert ok is False
    assert "tool_name" in why

    ok, why = AuthorizeRequest(
        event_type="PreToolUse", tool_name="execute_bash", tool_input=None
    ).is_judgeable
    assert ok is False
    assert "tool_input" in why

    ok, why = AuthorizeRequest(
        event_type="PreToolUse", tool_name="execute_bash", tool_input={"command": "ls"}
    ).is_judgeable
    assert ok is True
    assert why == ""
