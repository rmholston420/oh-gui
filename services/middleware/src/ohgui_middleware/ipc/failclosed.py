"""The fail-closed guard (ADR-014 clause 3).

The SDK's own default is that a hook error, timeout, exit 1, or malformed output produces
an *error* result which lets the action proceed. We invert that. Everything that is not an
affirmative, well-formed `allow` from an installed policy is a **deny**.

Principle 8 / ADR-006: a control that displays correctly and enforces nothing is worse than
an absent one. A fail-open authorization gate is indistinguishable from no gate precisely
under fault, which is when it matters.

`guarded_decide` is the only thing in this package that may produce a verdict from a
resolver. Nothing may call a resolver directly on a request path.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from .schema import AuthorizeRequest, Decision, deny

logger = logging.getLogger(__name__)

Resolver = Callable[[AuthorizeRequest], Awaitable[Any]]


class PolicyPlaneNotInstalled(RuntimeError):
    """Raised by the default resolver.

    Slice 1 of Phase 1 ships the seam without the plane. ADR-014 is Proposed and its
    lock-in clause forbids writing enforcement before ratification, so the honest state is
    "no policy installed", surfaced as a deny with that exact reason — not a silent allow
    and not a pretend policy.
    """


async def null_resolver(request: AuthorizeRequest) -> Decision:
    raise PolicyPlaneNotInstalled(
        f"no policy plane is installed; refusing {request.tool_name!r} by default"
    )


async def guarded_decide(
    resolver: Resolver,
    request: AuthorizeRequest,
    *,
    timeout_s: float,
) -> Decision:
    """Run `resolver` and return a Decision, denying on every abnormal outcome.

    Denies on: timeout, cancellation, any exception, a non-Decision return value, `None`,
    and a Decision whose verdict is not exactly ``allow`` or ``deny``.

    Note the deliberate absence of a cache. ADR-014 clause 5: a cached allow is a bypass
    with a shelf life.
    """
    try:
        async with asyncio.timeout(timeout_s):
            result = await resolver(request)
    except PolicyPlaneNotInstalled as exc:
        return deny(str(exc))
    except TimeoutError:
        return deny(
            f"policy plane did not answer within {timeout_s}s for {request.tool_name!r}"
        )
    except asyncio.CancelledError:
        # Swallowing a cancellation would be wrong in general, but a cancelled
        # authorization must not become an allow, and re-raising here would surface to the
        # hook as an error result — which the SDK treats as proceed.
        return deny(f"authorization was cancelled for {request.tool_name!r}")
    except BaseException as exc:  # noqa: BLE001 - breadth is the point; see module docstring
        logger.exception("policy plane raised; denying")
        return deny(f"policy plane raised {type(exc).__name__}: {exc}")

    if not isinstance(result, Decision):
        return deny(
            f"policy plane returned {type(result).__name__}, not a Decision; "
            "a malformed verdict is a deny"
        )
    if result.verdict not in ("allow", "deny"):
        return deny(f"policy plane returned unknown verdict {result.verdict!r}")
    return result
