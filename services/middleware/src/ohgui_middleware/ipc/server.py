"""Loopback HTTP surface for the hook and, later, the frontend (ADR-001 item 4).

Slice 1 endpoints:
  GET  /healthz        liveness + honest self-description of the enforcement state
  GET  /v1/upstream    anti-corruption-layer probe (installed vs pinned)
  POST /v1/authorize   the fail-closed verdict seam. Denies everything in this slice.

No policy, no hook registration, no audit log yet — those land after ADR-014 is ratified.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .. import __version__
from ..config import Settings
from ..upstream import sdk as upstream_sdk
from .failclosed import Resolver, guarded_decide, null_resolver
from .schema import AuthorizeRequest, deny

#: Set once ADR-014 is ratified and the policy plane exists. Until then every response
#: says so out loud rather than reading like a working gate.
ENFORCEMENT_STATE = "pre-enforcement: ADR-014 Proposed, policy plane not installed"


def create_app(
    settings: Settings | None = None,
    resolver: Resolver | None = None,
) -> FastAPI:
    settings = settings or Settings()
    resolver = resolver or null_resolver

    app = FastAPI(
        title="OH-GUI middleware",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url="/openapi.json",
    )
    app.state.settings = settings
    app.state.resolver = resolver

    @app.get("/healthz")
    async def healthz() -> dict[str, Any]:
        return {
            "status": "ok",
            "version": __version__,
            "enforcement": ENFORCEMENT_STATE,
            "policy_plane": "not-installed",
            "default_verdict": "deny",
            "upstream": upstream_sdk.probe().state,
        }

    @app.get("/v1/upstream")
    async def upstream() -> dict[str, Any]:
        return upstream_sdk.probe().to_dict()

    @app.post("/v1/authorize")
    async def authorize(request: Request) -> JSONResponse:
        # Parsed by hand rather than via a signature-typed body so a malformed payload
        # produces a *deny*, not a 422. A 422 is an error result, and the SDK treats an
        # error result as proceed — that is the fail-open default ADR-014 clause 3 inverts.
        try:
            payload = await request.json()
            parsed = AuthorizeRequest.model_validate(payload)
        except Exception as exc:  # noqa: BLE001
            decision = deny(f"unparseable authorization request: {type(exc).__name__}: {exc}")
            return JSONResponse(decision.model_dump(), status_code=200)

        decision = await guarded_decide(
            app.state.resolver,
            parsed,
            timeout_s=app.state.settings.verdict_timeout_s,
        )
        # Always HTTP 200. The verdict is in the body. A non-2xx status would make the hook
        # distinguish transport failure from denial, and the safe reading of "I could not
        # tell" is already deny — encoded once, here, not twice.
        return JSONResponse(decision.model_dump(), status_code=200)

    return app
