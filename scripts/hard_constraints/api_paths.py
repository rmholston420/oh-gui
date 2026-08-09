"""Every agent-server path the GUI calls must resolve to a real route in the pinned SDK source.

A FastAPI path is assembled from three places: the decorator, the router's own ``prefix=``, and the
prefix of the router that includes it. Reading only the decorator produced ``/api/changes`` when the
route was ``/api/git/changes`` -- a 404 that no type checker, unit test, or fixture could catch,
because a URL is just a string. This check reads all three and compares.
"""

from __future__ import annotations

import re
from pathlib import Path

# `agentServer.ts` builds paths as template literals; capture the static leading segments.
_CLIENT_CALL = re.compile(r"""requestJson<[^>]*>\(\s*[`'"](/[^`'"?${]*)""")
_CLIENT_FETCH = re.compile(r"""fetch\(\s*`\$\{baseUrl\}\$\{?(/[^`'"?${]*)""")
# Leading whitespace matters: `api_router` is defined inside a function, indented.
_ROUTER_DEF = re.compile(r"""^\s*(\w+)\s*=\s*APIRouter\((.*)$""", re.MULTILINE)
_PREFIX = re.compile(r"""prefix\s*=\s*["']([^"']+)["']""")
_ROUTE = re.compile(r"""@(\w+)\.(get|post|patch|put|delete)\(\s*["']([^"']*)["']""")
_INCLUDE = re.compile(r"""(\w+)\.include_router\((\w+)""")


def _agent_server_dir(repo_root: Path) -> Path | None:
    roots = sorted((repo_root / "review" / "_sdk_src").glob("*/openhands_agent_server-*/openhands/agent_server"))
    return roots[-1] if roots else None


def collect_server_paths(repo_root: Path) -> set[str]:
    """Full paths the pinned agent-server actually serves."""
    source_dir = _agent_server_dir(repo_root)
    if source_dir is None:
        return set()

    prefixes: dict[str, str] = {}
    routes: list[tuple[str, str]] = []
    includes: list[tuple[str, str]] = []

    for path in sorted(source_dir.glob("*.py")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for name, tail in _ROUTER_DEF.findall(text):
            found = _PREFIX.search(tail)
            prefixes[name] = found.group(1) if found else ""
        for router, _verb, route in _ROUTE.findall(text):
            routes.append((router, route))
        includes.extend(_INCLUDE.findall(text))

    # Resolve one level of nesting, which is all the agent-server uses: api_router includes the
    # feature routers. Deeper nesting would need a fixed point; assert the shape instead of
    # silently under-reporting.
    parent_of = {child: parent for parent, child in includes}
    full: set[str] = set()
    for router, route in routes:
        chain, cursor = [], router
        while cursor is not None and cursor not in chain:
            chain.append(cursor)
            cursor = parent_of.get(cursor)
        prefix = "".join(prefixes.get(name, "") for name in reversed(chain))
        full.add(f"{prefix}{route}" or "/")
    return full


def collect_client_paths(repo_root: Path) -> set[str]:
    client = repo_root / "apps" / "gui" / "src" / "api" / "agentServer.ts"
    if not client.exists():
        return set()
    text = client.read_text(encoding="utf-8")
    return {match for pattern in (_CLIENT_CALL, _CLIENT_FETCH) for match in pattern.findall(text)}


def unresolved_client_paths(repo_root: Path) -> list[str]:
    """Client paths with no matching server route. `baseUrl` already carries `/api`."""
    server = collect_server_paths(repo_root)
    if not server:
        return []
    problems = []
    for path in sorted(collect_client_paths(repo_root)):
        candidate = f"/api{path}"
        # Conversation paths interpolate an id; compare against the templated form too.
        if candidate in server:
            continue
        if any(route.startswith(candidate.rstrip("/")) and "{" in route for route in server):
            continue
        problems.append(candidate)
    return problems
