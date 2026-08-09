"""HTTP contract for the IPC seam, over a real ASGI transport."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from ohgui_middleware.config import ConfigError, Settings, require_loopback
from ohgui_middleware.ipc.schema import AuthorizeRequest, Decision, allow
from ohgui_middleware.ipc.server import create_app

PAYLOAD = {
    "event_type": "pre_tool_use",
    "tool_name": "bash",
    "tool_input": {"command": "cat ~/.ssh/id_ed25519"},
    "session_id": "s1",
    "working_dir": "/home/rmholston/dev/oh-gui",
}


def client(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://middleware.invalid"
    )


async def test_healthz_admits_it_is_not_enforcing() -> None:
    async with client(create_app()) as c:
        r = await c.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["policy_plane"] == "not-installed"
    assert body["default_verdict"] == "deny"
    assert "ADR-014" in body["enforcement"]


async def test_upstream_probe_reports_the_four_pins() -> None:
    async with client(create_app()) as c:
        r = await c.get("/v1/upstream")
    names = {p["name"] for p in r.json()["packages"]}
    assert names == {
        "openhands-sdk",
        "openhands-tools",
        "openhands-workspace",
        "openhands-agent-server",
    }
    assert all(p["expected"] == "1.41.0" for p in r.json()["packages"])


async def test_authorize_denies_by_default() -> None:
    async with client(create_app()) as c:
        r = await c.post("/v1/authorize", json=PAYLOAD)
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] == "deny"
    assert body["source"] == "failclosed"


@pytest.mark.parametrize(
    "bad",
    [b"not json", b"", b"[]", b'{"tool_name": 5}', b'{"event_type": "x"}'],
    ids=["garbage", "empty", "array", "wrong-type", "missing-field"],
)
async def test_malformed_request_denies_with_http_200_not_422(bad: bytes) -> None:
    # A 422 is an error result, and the SDK reads an error result as proceed. The verdict
    # must be in the body, always.
    async with client(create_app()) as c:
        r = await c.post(
            "/v1/authorize", content=bad, headers={"content-type": "application/json"}
        )
    assert r.status_code == 200
    assert r.json()["verdict"] == "deny"


async def test_unknown_upstream_fields_are_preserved_not_rejected() -> None:
    seen: dict[str, object] = {}

    async def spy(req: AuthorizeRequest) -> Decision:
        seen.update(req.model_dump())
        return allow("ok")

    async with client(create_app(resolver=spy)) as c:
        r = await c.post("/v1/authorize", json={**PAYLOAD, "brand_new_upstream_field": 42})
    assert r.json()["verdict"] == "allow"
    assert seen["brand_new_upstream_field"] == 42


async def test_slow_policy_denies_at_the_configured_timeout() -> None:
    async def slow(_: AuthorizeRequest) -> Decision:
        await asyncio.sleep(5)
        return allow("too late")

    app = create_app(Settings(verdict_timeout_s=0.05), resolver=slow)
    async with client(app) as c:
        r = await c.post("/v1/authorize", json=PAYLOAD)
    assert r.json()["verdict"] == "deny"
    assert r.json()["source"] == "failclosed"


# ------------------------------------------------------------------- loopback binding


@pytest.mark.parametrize("host", ["127.0.0.1", "::1", "localhost"])
def test_loopback_hosts_accepted(host: str) -> None:
    require_loopback(host)


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.10", "10.0.0.1", "colossus"])
def test_non_loopback_hosts_refused(host: str) -> None:
    with pytest.raises(ConfigError):
        require_loopback(host)


@pytest.mark.parametrize("port", [0, 70000, -1])
def test_bad_ports_refused(port: int) -> None:
    with pytest.raises(ConfigError):
        Settings(port=port)


def test_non_positive_timeout_refused() -> None:
    with pytest.raises(ConfigError):
        Settings(verdict_timeout_s=0)
