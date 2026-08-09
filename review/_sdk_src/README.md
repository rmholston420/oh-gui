# Vendored OpenHands source snapshots — read-only evidence, never a dependency

## Why this exists

ADR-015 makes upstream **source** the source of truth over upstream **documentation**. Every
native-fidelity finding in `adrs/` cites a path under `review/_sdk_src/<version>/`. Before
2026-08-09 those paths did not exist in this repository: the snapshot lived only inside an ephemeral
agent sandbox, so six citations in `adrs/ADR-015-native-fidelity-boundary.md` and
`docs/forge-oh-review/02-bff-services.md` pointed at nothing a reader could open. See `DEBUG_LOG.md`
2026-08-09 00:51 EDT.

Committing the snapshot makes every fidelity citation resolvable offline, in any future session,
by any reader, without a network fetch and without trusting a summary of what the source said.

## Provenance

| Field | Value |
|---|---|
| Version | 1.41.0 |
| Packages | `openhands_sdk`, `openhands_tools`, `openhands_workspace`, `openhands_agent_server` |
| Source | PyPI sdists/wheels for the pinned version |
| Retrieved | 2026-08-09 |
| Excluded | `__pycache__/` |
| Size | ~5.7 MB, 446 `.py` files |

## Rules

1. **Read-only.** Never edit a file under this directory. It is evidence, not code.
2. **Never imported.** No file in `apps/`, `services/`, or `bench/` may import from here.
   This is not a vendored dependency and does not participate in the build (ADR-026, ADR-025).
3. **Additive by version.** A new pinned version gets a new `review/_sdk_src/<version>/` tree.
   Old trees stay so that older ADR citations keep resolving.
