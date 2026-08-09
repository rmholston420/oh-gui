#!/usr/bin/env python3
"""Fail when the GUI calls an agent-server path the pinned SDK does not serve.

Run: python3 scripts/check-api-paths.py [--no-color]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hard_constraints.api_paths import (  # noqa: E402
    collect_client_paths,
    collect_server_paths,
    unresolved_client_paths,
)

REPO_ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    color = "--no-color" not in sys.argv
    red = "\x1b[31m" if color else ""
    green = "\x1b[32m" if color else ""
    off = "\x1b[0m" if color else ""

    server = collect_server_paths(REPO_ROOT)
    if not server:
        print(f"{red}FAIL{off} no pinned agent-server source under review/_sdk_src/")
        return 1

    client = collect_client_paths(REPO_ROOT)
    problems = unresolved_client_paths(REPO_ROOT)
    if problems:
        print(f"{red}FAIL{off} {len(problems)} client path(s) match no route in the pinned SDK:")
        for path in problems:
            print(f"  {path}")
        print("\nA FastAPI path is decorator + router prefix + including-router prefix.")
        print("Check the router's own APIRouter(prefix=...), not just the decorator.")
        return 1

    print(f"{green}PASS{off} {len(client)} client path(s) resolve against {len(server)} routes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
