"""Middleware runtime configuration.

Single-operator, local-first (project instructions; ADR-003). There is no cloud control
plane and no remote listener. Binding anything other than loopback is a hard error, not a
warning — a policy plane reachable off-box is a different threat model than the one every
Phase 1 control was designed against.
"""

from __future__ import annotations

import ipaddress
import os
from dataclasses import dataclass

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787

# ADR-014 clause 3: the hook blocks on this call while the operator decides, so the timeout
# is an authorization-latency budget, not a network timeout. Exceeding it denies.
DEFAULT_VERDICT_TIMEOUT_S = 5.0


class ConfigError(ValueError):
    """Raised when the middleware is asked to run in a shape the spec forbids."""


@dataclass(frozen=True)
class Settings:
    host: str = DEFAULT_HOST
    port: int = DEFAULT_PORT
    verdict_timeout_s: float = DEFAULT_VERDICT_TIMEOUT_S

    def __post_init__(self) -> None:
        require_loopback(self.host)
        if not (1 <= self.port <= 65535):
            raise ConfigError(f"port out of range: {self.port}")
        if self.verdict_timeout_s <= 0:
            raise ConfigError(f"verdict_timeout_s must be positive, got {self.verdict_timeout_s}")


def require_loopback(host: str) -> None:
    """Reject any bind address that is not loopback.

    `0.0.0.0` and `::` are the two that matter in practice; both are rejected here rather
    than relying on a firewall the operator may not have.
    """
    try:
        addr = ipaddress.ip_address(host)
    except ValueError as exc:  # hostnames are not accepted: they resolve, and resolution moves
        if host == "localhost":
            return
        raise ConfigError(
            f"host must be a loopback IP literal (or 'localhost'), got {host!r}"
        ) from exc
    if not addr.is_loopback:
        raise ConfigError(
            f"refusing to bind {host!r}: OH-GUI middleware is loopback-only "
            "(single-operator, local-first)"
        )


def from_env(env: dict[str, str] | None = None) -> Settings:
    e = os.environ if env is None else env
    return Settings(
        host=e.get("OHGUI_MIDDLEWARE_HOST", DEFAULT_HOST),
        port=int(e.get("OHGUI_MIDDLEWARE_PORT", str(DEFAULT_PORT))),
        verdict_timeout_s=float(
            e.get("OHGUI_MIDDLEWARE_VERDICT_TIMEOUT_S", str(DEFAULT_VERDICT_TIMEOUT_S))
        ),
    )
