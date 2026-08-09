"""OH-GUI middleware — the policy plane (ADR-001 item 3).

Slice 1 of Phase 1 is deliberately **pre-enforcement**: the IPC seam exists and is
fail-closed, but no policy is installed and no SDK hook is registered. ADR-014's
lock-in clause requires that ADR to be ratified — via its four-item executable
verification gate on Colossus — before the first line of enforcement is written.

Until then `/v1/authorize` denies everything, by construction, and says why.
"""

__version__ = "0.1.0"

__all__ = ["__version__"]
