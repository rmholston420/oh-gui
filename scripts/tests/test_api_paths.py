"""The endpoint checker must fail on a wrong path, or it is decoration."""

from __future__ import annotations

from pathlib import Path

from hard_constraints.api_paths import (
    collect_client_paths,
    collect_server_paths,
    unresolved_client_paths,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def test_router_prefixes_are_composed_not_just_decorators() -> None:
    routes = collect_server_paths(REPO_ROOT)
    # The exact bug this exists to prevent: the decorator says "/changes", the route is not.
    assert "/api/git/changes" in routes
    assert "/changes" not in routes


def test_every_client_path_resolves_today() -> None:
    assert unresolved_client_paths(REPO_ROOT) == []


def test_the_client_paths_are_actually_being_found() -> None:
    # A parser that silently matches nothing would make the check above vacuously true.
    assert "/git/changes" in collect_client_paths(REPO_ROOT)
    assert len(collect_client_paths(REPO_ROOT)) >= 3


def test_a_bad_path_is_reported(tmp_path: Path) -> None:
    sdk = REPO_ROOT / "review" / "_sdk_src"
    fake = tmp_path / "review" / "_sdk_src"
    fake.parent.mkdir(parents=True)
    fake.symlink_to(sdk, target_is_directory=True)
    client = tmp_path / "apps" / "gui" / "src" / "api"
    client.mkdir(parents=True)
    (client / "agentServer.ts").write_text(
        "requestJson<Thing[]>(`/changes?${query.toString()}`)", encoding="utf-8"
    )
    assert unresolved_client_paths(tmp_path) == ["/api/changes"]
