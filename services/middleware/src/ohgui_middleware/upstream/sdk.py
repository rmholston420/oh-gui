"""Anti-corruption layer (ADR-001 item 7).

**This module is the only place in the middleware permitted to import `openhands*`.**
`tests/test_import_boundary.py` fails the build otherwise, by AST scan.

**Scope discipline (ADR-015).** Slice 1 mirrors *nothing*. It reports which upstream
packages are installed and at what versions, and stops. `trust-dial.ts` already shipped one
wrong decision because a hand-written mirror was written from an assumption about SDK
semantics rather than from SDK source (DEBUG_LOG 2026-08-08 20:05 EDT). Every field this
layer eventually exposes must be read out of the pinned 1.41.0 source first.
"""

from __future__ import annotations

from dataclasses import dataclass
from importlib import metadata

#: Verbatim from docs/UPSTREAM_PINS.md §2. The four move in lockstep.
PINNED_UPSTREAM: dict[str, str] = {
    "openhands-sdk": "1.41.0",
    "openhands-tools": "1.41.0",
    "openhands-workspace": "1.41.0",
    "openhands-agent-server": "1.41.0",
}


@dataclass(frozen=True)
class PackageStatus:
    name: str
    expected: str
    installed: str | None

    @property
    def state(self) -> str:
        if self.installed is None:
            return "missing"
        return "ok" if self.installed == self.expected else "drift"


@dataclass(frozen=True)
class UpstreamProbe:
    packages: tuple[PackageStatus, ...]

    @property
    def state(self) -> str:
        states = {p.state for p in self.packages}
        if states == {"ok"}:
            return "ok"
        if "drift" in states:
            return "drift"
        return "missing"

    def to_dict(self) -> dict[str, object]:
        return {
            "state": self.state,
            "packages": [
                {
                    "name": p.name,
                    "expected": p.expected,
                    "installed": p.installed,
                    "state": p.state,
                }
                for p in self.packages
            ],
        }


def probe() -> UpstreamProbe:
    """Report installed-vs-pinned for the four upstream packages.

    Never raises on absence. The SDK extra is optional so the fail-closed seam remains
    testable on a machine without the wheels; a missing SDK is a reported state, not a
    crash. It is emphatically *not* a reason to allow anything.
    """
    statuses = []
    for name, expected in PINNED_UPSTREAM.items():
        try:
            installed: str | None = metadata.version(name)
        except metadata.PackageNotFoundError:
            installed = None
        statuses.append(PackageStatus(name=name, expected=expected, installed=installed))
    return UpstreamProbe(packages=tuple(statuses))
