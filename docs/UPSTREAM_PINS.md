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
>
> **UPDATE 2026-08-08:** the frontend is now scaffolded, so
> **`apps/gui/package-lock.json` exists and pins `@openhands/typescript-client@1.37.0`** — as a
> **`devDependency`, imported for types only** (ADR-001 Amendment #3). The middleware Python
> project is still unscaffolded, so the four `openhands-*` pins remain recorded here only.

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

### sdist digests (verification inputs, not runtime dependencies)

ADR-015 clause 1 verification reads the shipped image's bytecode and diffs it against source
compiled from an sdist. Those sdists are pinned here so the verification is reproducible.

| Package | sdist `sha256` | URL |
|---|---|---|
| `openhands-sdk` 1.41.0 | `b12bb6f5a69bfee476a4ae8700b0bf33c478f67ea708c8d4a5f75a95d6f4045f` | https://files.pythonhosted.org/packages/2f/ee/a938c78fdd310022c9081445195047207f06fabb2650abb9c1c04e44f66d/openhands_sdk-1.41.0.tar.gz |
| `openhands-tools` 1.41.0 | `93bbfe1b6b289a379e656b84167ba4b163f5f2778d48cc2cce1f2507bf21ac9a` | https://files.pythonhosted.org/packages/65/dc/d39fa6f6471ad9c5ccf81ca17a905f9d4212bdd21fdf8cd4299eaf320ef6/openhands_tools-1.41.0.tar.gz |
| `openhands-workspace` 1.41.0 | `c01b65556436d0ff412c9987274e59bc85030aee1fb955494f5fb436bf59b705` | https://files.pythonhosted.org/packages/7d/78/54b91952dee13da7877f83de13d64e074f82d07fa9c54329eb619e034280/openhands_workspace-1.41.0.tar.gz |
| `openhands-agent-server` 1.41.0 | `a4c6456af759a43a92f9f0e9a620835519c0061763cc8e70d19aff2fb128eb6e` | https://files.pythonhosted.org/packages/19/4f/acd96372260788dae84b1cf3fb3414d259ba2c5be1a555d02cfd25229075/openhands_agent_server-1.41.0.tar.gz |

All four were added 2026-08-08 for `scripts/verify_tool_actions.py`, which establishes the native
basis for blast radius (ADR-023). The SDK pin alone was insufficient: `Action` classes are spread
across `openhands-sdk` (7 modules) and `openhands-tools` (17). `openhands-workspace` and
`openhands-agent-server` are pinned so that "no `Action` class here" is a **verified** statement
rather than an unexamined one — the script fails closed on any `openhands.*` module it cannot map
to a pinned sdist, so an unpinned distribution cannot be silently skipped.

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

### Reference-app dev backend pins 1.40.1, not 1.41.0

Distinct from the container image above, and easy to conflate. The image pinned by digest in
section 1 is what **OH-GUI** will run. When the **reference app** (Agent Canvas v1.12.0) is started
in dev mode via `npm run dev`, it launches its own backend through `uvx` and pins it from its own
config:

| Source | Value |
|---|---|
| `config/defaults.json` (v1.12.0) | `"versions": { "agentServer": "1.40.1" }` |
| Consumed by | `scripts/dev-safe.mjs:50` -> `DEFAULT_AGENT_SERVER_VERSION` |
| Applied at | `dev-safe.mjs:483-500`, pinning `openhands-agent-server`, `openhands-sdk`,
  `openhands-tools`, `openhands-workspace` to the same version, plus `AGENT_CLIENT_PROTOCOL_CONSTRAINT` |
| Observed at runtime | `/server_info` on both 8010 and 18000 reports `1.40.1` for version,
  sdk_version, tools_version and workspace_version |

So the reference app running 1.40.1 is **upstream's intent, not drift**. `uvx` did not resolve
"latest"; v1.12.0 asks for 1.40.1 by name. Any baseline measured through `npm run dev` is measuring
the 1.12.0 + 1.40.1 pair.

Overrides, all of which keep the four packages in lockstep (verified by reading
`buildAgentServerCommand`, not assumed):

- `OH_AGENT_SERVER_VERSION=<x>` — PyPI, pins all four to `<x>`
- `OH_AGENT_SERVER_GIT_REF=<ref>` — git, all four from the same ref, with `--reinstall` because a
  branch can carry the same version string as the released wheel and uv would otherwise silently
  reuse the cache
- `OH_AGENT_SERVER_LOCAL_PATH=<abs>` — editable installs from a monorepo checkout

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

## 3a. Agent Canvas — primary donor, reused at source level (see ADR-025)

> **Reclassified 2026-08-09 (ADR-025).** This section previously read "reference only, not
> consumed". That understated canvas's role: OH-GUI is a restructuring and extension of it, so
> canvas is the **first place to look** for any new component. Reuse is at *source* level —
> `@openhands/agent-canvas` is never a runtime dependency. The tarball below ships no `.tsx`, but
> every sampled sourcemap carries `sourcesContent`, so the full original source (745 files,
> ~2.84 M chars) is recoverable from this hash-pinned artifact.

Recorded because canvas is the reference consumer of the same agent-server, so a divergence between
its choices and ours is a fact worth keeping visible. **No canvas code is vendored or installed**
(ADR-001). Verified from npm metadata 2026-08-09.

| Field | Value |
|---|---|
| Package | `@openhands/agent-canvas` |
| Latest version | **1.12.0**, published 2026-08-07 |
| `gitHead` | `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364` |
| Tarball sha256 | `fa110b20f400efe74d8888122e9db1c91e4b892776d2e248c40074113acf39ab` |
| npm shasum | `8060968d801175b5b58e12781241aa0bd5981c40` |
| License | MIT |
| `config/defaults.json` → `versions.agentServer` | 1.40.1 |
| `compatibility.minimumAgentServer` | 1.28.0 |
| Canvas-shipped `@openhands/typescript-client` | **1.36.1** |
| Canvas-shipped `@openhands/extensions` | 0.16.0 |
| `versions.automation` | 1.6.0 |

**Two deliberate divergences from canvas**, both ratified in
[ADR-024](../adrs/ADR-024-canvas-alignment-client-pin-and-extensions.md):

1. We pin the client at **1.37.0**, canvas ships **1.36.1**. 1.37.0 is a strict superset for
   everything we consume, and its additions describe the 1.41.0 server we actually pinned.
2. We pin the server image at **1.41.0**, canvas declares **1.40.1**. The action surface is
   identical across those two versions (37 classes, zero field changes), and canvas 1.12.0 uses
   none of the three symbols 1.41.0 removed — so this divergence is inert for our purposes.

> **"Archived" refers to a repository, never to the package.** `OpenHands/agent-canvas` on GitHub
> was archived 2026-07-27 as a README-only stub; the package is published from the
> `OpenHands/OpenHands` monorepo and is actively maintained (ADR-001).

---

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
