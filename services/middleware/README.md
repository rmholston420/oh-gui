# services/middleware - OH-GUI Python Middleware

The policy plane. This is where the substance of the spec lives.

**Not scaffolded yet.** Phase 0/1 work. This file records the contract so the shape is
fixed before any code exists.

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
