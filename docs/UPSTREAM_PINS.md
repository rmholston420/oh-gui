# Upstream Artifact Pins

**Authoritative source of truth for every upstream OpenHands artifact OH-GUI consumes.**

Required by `docs/specs/02-repo-setup.md` item 1 (as replaced by
[ADR-001](../adrs/ADR-001-integration-boundary.md)) and by the Phase 0 exit criterion.

**Pins recorded:** 2026-08-08 09:02 EDT
**Re-verify at:** every phase gate (spec item 1). Record each re-verification in `BUILD_LOG.md`.

> **Why this file exists rather than a lockfile.** Spec item 1 says to pin in "the middleware's
> Python lockfile" and "the frontend lockfile". **Neither project is scaffolded yet** — there is no
> `pyproject.toml`, no `package.json`, and no lockfile anywhere in this repo. Recording the pins is
> the Phase 0 exit criterion; generating lockfiles is Phase 1 scaffolding work. This file is the
> source those lockfiles MUST be generated from verbatim. When they exist, this file stays as the
> human-readable record and the lockfiles become the enforcement.

---

## 1. Agent Server container image

Pinned **by digest**, per ADR-001 item 2. The tag is recorded for provenance only and must never
appear in a compose file or run command.

| Field | Value |
|---|---|
| Repository | `ghcr.io/openhands/agent-server` |
| **Pin (multi-arch index)** | `sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520` |
| `linux/amd64` child (Colossus) | `sha256:7bfd4fb6b7e084ba595935ec8a2a2d22f8a9022801b05b0f07baea5757f0c24d` |
| `linux/arm64` child | `sha256:bada51bc85fda7b83289897a949d43a1f4f10a3118ffc659d6a0f5a4b66f498a` |
| Provenance tag | `ca46719-python` |
| Upstream git SHA | `ca46719d5e9a0b0af79f7de2da37067a5b94563c` |
| Upstream git ref | `refs/tags/v1.41.0` |
| Image created | 2026-08-06T13:34:08Z |
| Bundled Python | 3.13.14 |
| Exposed ports | **8000/tcp, 8002/tcp** (8002 = `NOVNC_PORT`) |

Canonical reference:

```
ghcr.io/openhands/agent-server@sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520
```

**Verified, not assumed.** Identity was confirmed from the image config blob, which carries
`OPENHANDS_BUILD_GIT_SHA=ca46719d5e9a0b0af79f7de2da37067a5b94563c` and
`OPENHANDS_BUILD_GIT_REF=refs/tags/v1.41.0`. The tag list is **not** a reliable index: the registry
caps `tags/list` at 1000 entries, and `ca46719-python` does not appear in that page even though it
resolves. Resolve tags directly; never infer absence from the listing.

The image carries **no** `org.opencontainers.image.version`, `.revision`, or `.source` label — only
`.authors`. Digest pinning plus the two `OPENHANDS_BUILD_GIT_*` env vars are the only identity
signals available.

The index also contains two `unknown/unknown` manifests (attestations). Pinning the index digest
covers every platform and both attestations.

## 2. Python packages (middleware)

All four move in lockstep and were published together at 2026-08-06T13:29Z.

| Package | Version | `requires_python` | wheel `sha256` |
|---|---|---|---|
| `openhands-sdk` | **1.41.0** | >=3.12 | `3fcd1ff4ef93c49a37ed1095d36c69714711661a0e8e7812882088af3a6d0427` |
| `openhands-tools` | **1.41.0** | >=3.12 | `88c9f64d07e5298895698c806e9a1c03c41ecf552e68b61cc54c729685bbc2b4` |
| `openhands-workspace` | **1.41.0** | >=3.12 | `8ce1ced56126a29099a86f1ce1cec51475b0482655492bd2901cb5482b7d3b29` |
| `openhands-agent-server` | **1.41.0** | >=3.12 | `a1fd602105b20c0321d67c7851b6ffd379ebf95b75cca53e570a33530aaea5b7` |

`requires_python >=3.12` is a hard floor on the middleware venv. Colossus's project venvs must be
checked against it before scaffolding (`colossus-python-env` skill; do not assume the system Python).

## 3. Frontend client

| Field | Value |
|---|---|
| Package | `@openhands/typescript-client` |
| Version | **1.37.0** |
| License | MIT |
| Published | 2026-08-04T02:03:25Z |
| `integrity` | `sha512-mqvzOOhhJiduA4BglV53MukpteX4v33Z5iWj0XKZTq8/56Udi+ta+TleURoCd5YY1Cv7JtN0eYnds6msWvE0/g==` |
| `shasum` | `a0f7ea7722035e47897ac2426af3c3d4099ce79c` |
| Declared deps | `ws ^8.20.0`, `@openrouter/sdk ^0.13.24` |

### Version skew — server 1.41.0 vs client 1.37.0

The client is **four minor versions behind** the SDK and server it talks to, and it is not a
generated-in-lockstep artifact: it lives in a separate repo (`OpenHands/typescript-client`), has 15
published versions against the SDK's 81, and skips ranges (no 1.29–1.31). Client 1.37.0 predates
SDK 1.41.0 by two days.

There is **no** `peerDependencies` constraint, no published compatibility matrix, and no stated
supported-server range. The skew is therefore unquantified, not benign. Mitigation is ADR-001 item 7
(anti-corruption layer); the first integration slice must verify the endpoints it actually calls
against the pinned server rather than trusting version proximity.

### `@openrouter/sdk` is a hard dependency — local-first concern

The client declares a **cloud LLM SDK** as a normal (not optional) dependency, and ships
`dist/llm/openrouter-llm.js`. This project is local-only (Ollama on Colossus). Before this package
is admitted to the frontend, verify that no code path reaches OpenRouter and that the module is
tree-shaken out of the production bundle. Treat an outbound OpenRouter request as a defect.

### `ws` is a hard dependency, but the browser path is native

`dist/events/websocket-client.js` selects `window.WebSocket` when present and falls back to
`require('ws')` in a guarded `try/catch` that is documented upstream as never throwing on import.
So the browser **runtime** behaves as ADR-001 assumed. However `ws` is a declared runtime
dependency, so it is installed regardless, and a bare `require('ws')` inside an ESM module can break
some bundlers — plan for an alias or an `external`. ADR-001's phrase "no Node dependency" is wrong
about the dependency graph and right about browser runtime behaviour; corrected in ADR-001
Amendment #1.

## 4. Upstream sources (for provenance, not consumption)

| What | Where |
|---|---|
| SDK + agent-server monorepo | https://github.com/OpenHands/software-agent-sdk (tag `v1.41.0`, commit `ca46719d5e9a0b0af79f7de2da37067a5b94563c`) |
| TypeScript client | https://github.com/OpenHands/typescript-client (tag `v1.37.0`) |
| Agent Server OpenAPI | `openhands-agent-server/openhands/agent_server/openapi.py`, exported by `.github/scripts/export_agent_server_openapi.py`, contract-tested by `tests/agent_server/test_openapi_contract.py` |

## Re-verification procedure

Run at each phase gate and record the result in `BUILD_LOG.md`.

```bash
# Python packages
for p in openhands-sdk openhands-tools openhands-workspace openhands-agent-server; do
  printf '%-28s %s\n' "$p" "$(curl -sf https://pypi.org/pypi/$p/json | python3 -c 'import json,sys;print(json.load(sys.stdin)["info"]["version"])')"
done

# Frontend client
curl -sf https://registry.npmjs.org/@openhands/typescript-client \
  | python3 -c 'import json,sys;print("@openhands/typescript-client", json.load(sys.stdin)["dist-tags"]["latest"])'

# Image digest for a given upstream tag (replace TAG)
TAG=ca46719-python
TOK=$(curl -sf "https://ghcr.io/token?scope=repository%3Aopenhands%2Fagent-server%3Apull&service=ghcr.io" \
      | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
curl -sfI -H "Authorization: Bearer $TOK" \
  -H "Accept: application/vnd.oci.image.index.v1+json" \
  "https://ghcr.io/v2/openhands/agent-server/manifests/$TAG" | grep -i docker-content-digest
```

A version bump is a deliberate act: update this file, re-run the anti-corruption layer's contract
checks, and log the bump in `BUILD_LOG.md`. Never float a tag.
