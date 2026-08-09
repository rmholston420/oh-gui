# ADR-006 — The out-of-worktree trust-dial stop elevates to HIGH

> **STATUS AMENDMENT (2026-08-08 22:20 EDT):** the decision below was reached by reasoning over
> the SDK's *documented* behavior. It has now been **executed against the pinned image** and is
> confirmed unchanged. `scripts/capture-trust-dial.sh` extracts
> `openhands.sdk.security.{risk,confirmation_policy,analyzer,ensemble}` from
> `agent-server@sha256:f0244fd7…`, proves each matches the pinned sdist, and runs the real policy
> objects across all 192 (stop × threshold × confirm_unknown × risk × location) combinations.
> Evidence: `docs/evidence/trust-dial/policy-truth-table.json`.
>
> Both load-bearing premises hold: `SecurityRisk.is_riskier` is reflexive (so threshold=HIGH
> pauses on HIGH), and `EnsembleSecurityAnalyzer` defaults to `propagate_unknown=False`, filtering
> UNKNOWN and returning `max(concrete)` — so the worktree analyzer's concrete HIGH reaches the
> policy even when the incoming assessment is UNKNOWN, and `confirm_unknown` is never consulted.
> The decision needed no change; what changed is that it is now checked rather than argued.

**Status:** Ratified · Amended 2026-08-08 (verified against upstream; decision unchanged)
**Lock-in phase:** Phase 0 (display mirror) · binding on Phase 1 (middleware)
**Supersedes:** —

## Context

`docs/specs/04-authorization.md` §4.1 defines four trust-dial stops. The third,
"Ask on writes outside worktree", was specified as a `SecurityAnalyzerBase` subclass composed into
`EnsembleSecurityAnalyzer` that elevates out-of-worktree writes **"to at least MEDIUM"**, and was
**"paired with standard `ConfirmRisky()`"**. Its behavior column reads:
*"Read-only and in-scope writes proceed; out-of-scope pauses."*

Writing that mapping as an executable predicate for the first-run wizard showed the specified
combination cannot produce the specified behavior. Standard `ConfirmRisky()` is `threshold=HIGH`.

| Elevation | Threshold | Result |
|---|---|---|
| MEDIUM | HIGH (as written) | MEDIUM is below the threshold. The elevation changes no decision. **The stop is inert.** |
| MEDIUM | MEDIUM | An in-scope MEDIUM edit now pauses, contradicting "in-scope writes proceed". |
| HIGH | HIGH (standard) | In-scope reads and edits proceed; any out-of-worktree write pauses. **Matches.** |

This surfaced from a failing test asserting the four stops are ordered strictest to loosest, not
from re-reading the prose. Under the MEDIUM/MEDIUM reading the third stop sorts *stricter* than the
second, which is how the contradiction became visible.

## Decision

The analyzer elevates out-of-worktree writes to **HIGH**, paired with unmodified
`ConfirmRisky(threshold=HIGH, confirm_unknown=True)`.

Binding on the Phase 1 middleware. The Phase 0 TypeScript display mirror already implements it.

## Rationale

It is the only one of the three readings that satisfies the stop's own behavior column, and it is
the smallest possible edit — one enum value — leaving every other element of §4.1 untouched.

It does not re-litigate §4.1's hard correction. That correction forbids subclassing
`ConfirmationPolicyBase` and requires path-scoping to live in a `SecurityAnalyzerBase` composed into
the ensemble. This decision keeps the analyzer, keeps `ConfirmRisky` standard, and changes only the
severity the analyzer assigns.

Alternatives rejected:

- **Leave as written (MEDIUM + HIGH).** Ships an authorization control that pauses on nothing.
  Worse than having no such stop, because the operator selects it believing they are protected.
  This is the failure mode Principle 8 warns about: display is not enforcement.
- **Lower the threshold (MEDIUM + MEDIUM).** Makes this stop stricter than "Ask on risky" for
  ordinary in-scope work, inverting the dial's ordering and breaking its own behavior column.
- **A custom policy pairing.** Would require touching `ConfirmationPolicyBase`, which §4.1's hard
  correction forbids outright.

## Consequences

- `docs/specs/04-authorization.md` §4.1: stop row amended; correction block updated from OPEN to
  ratified under this ADR.
- `KNOWN_ISSUES.md`: the 2026-08-08 entry closes.
- `apps/gui/src/features/first-run/trust-dial.ts` already encodes HIGH; `trust-dial.test.ts` pins it,
  including the strictest-to-loosest ordering assertion that exposed the defect.
- Phase 1 middleware must implement HIGH elevation. The ordering assertion should be re-expressed
  against the Python policy at that point, so the same defect cannot reappear server-side.

## Lock-in phase

Phase 0 for the display mirror; Phase 1 for enforcement.

## References

- `docs/specs/04-authorization.md` §4.1
- `KNOWN_ISSUES.md` 2026-08-08
- `apps/gui/src/features/first-run/trust-dial.ts`, `apps/gui/src/__tests__/trust-dial.test.ts`
- BUILD_LOG 2026-08-08 09:44 EDT
