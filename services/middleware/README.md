# services/middleware - OH-GUI Python Middleware

The policy plane. This is where the substance of the spec lives.

**Scaffolded 2026-08-08 21:10 EDT** (Phase 1 slice 1). The list below is still the *target*
contract; almost none of it is implemented. What exists today is the seam and nothing else.

## What exists right now

```
src/ohgui_middleware/
  config.py            loopback-only settings; a non-loopback bind is a hard error
  upstream/sdk.py      anti-corruption layer (ADR-001 item 7) - the ONLY permitted
                       `openhands*` import site. Mirrors nothing yet, by design (ADR-015)
  ipc/schema.py        the pre_tool_use envelope, verbatim; Decision with its source attributed
  ipc/failclosed.py    the guard (ADR-014 clause 3) - everything that is not an affirmative
                       well-formed allow is a deny
  ipc/server.py        GET /healthz  GET /v1/upstream  POST /v1/authorize
```

**It is pre-enforcement and denies everything.** ADR-014 is *Proposed*; its lock-in clause
forbids writing enforcement before its four-item executable verification gate passes on
Colossus. `/healthz` says so in its own response body rather than looking like a working gate.

No hook is installed. No policy plane exists. No audit log yet.

## Run it

```bash
cd "$(git rev-parse --show-toplevel)"
./scripts/verify-local.sh --middleware-only     # creates .venv, installs, lints, tests, live-probes
```

The SDK extra is deliberately **not** installed by that gate: the fail-closed seam must be
provable on a machine without the 1.41.0 wheels, and the ACL reports their absence as a state
rather than crashing. Install it when ADR-014 ratification work begins:

```bash
services/middleware/.venv/bin/pip install -e 'services/middleware[sdk]'
```

## Why Python (ADR-001)

Confirmation policies, security analyzers, `StuckDetector`, `state.block_action()` /
`state.block_message()`, and `ask_agent()` are Python `openhands-sdk` objects. They run
here, in-process, not in the browser.

## Owns

- Trust dial -> `conversation.set_confirmation_policy()`, including the pending-action
  policy lock (`docs/specs/04-authorization.md` §4.1).
- The custom `SecurityAnalyzerBase` subclass implementing the "writes outside worktree"
  stop, composed into `EnsembleSecurityAnalyzer`. **Never** a `ConfirmationPolicyBase`
  subclass - architecturally impossible, see `docs/specs/99-appendix-superseded.md`.
- Untrusted-content structural quarantine: a short-lived, tool-less SDK Conversation that
  summarizes third-party-untrusted content before it reaches the privileged planning
  context (`docs/specs/04a-prompt-injection.md` §4.9.1). No exception path for the
  vision-based browser fallback.
- Authorization audit log, including `created_by` attribution, assist-mode dual identity,
  delegated-review outcomes, and quarantine invocations.
- Household profiles, per-user inbox scoping, per-user budget ledgers (ADR-002, Phase 1).
- Durable Plan/Goal/Task/Attempt objects and their persistence
  (`docs/specs/05-plan-model.md`).
- Versioned telemetry adapter abstracting `nvidia-smi` / `rocm-smi` / `powermetrics` /
  `/sys/class/thermal`. Never a hardcoded `StatsConversationStateUpdateEvent` reference -
  that type does not exist.
- **Anti-corruption layer** (ADR-001 item 7): all upstream SDK and Agent Server surface is
  confined to one module so an upstream API change touches one place.

## Upstream pins

- `agent-server` container: pinned **by digest**. Tags are commit SHAs, not semver.
- `openhands-sdk`, `openhands-tools`, `openhands-workspace`, `openhands-agent-server`:
  pinned in the Python lockfile.
- Record every pin and its re-verification date in `BUILD_LOG.md` at each phase gate.

## Python environment

Colossus venv discipline applies. Never run `pip` against system Python.
