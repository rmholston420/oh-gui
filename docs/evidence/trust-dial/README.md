# Trust-dial policy truth table — upstream-derived

`policy-truth-table.json` is written by `scripts/capture-trust-dial.sh` from the pinned
agent-server image. **A file in here that was hand-edited is not evidence.** Regenerate.

## Why it exists

`apps/gui/src/features/first-run/trust-dial.ts` is a hand-written mirror of upstream
confirmation-policy semantics. `trust-dial.test.ts` pins it to `docs/specs/04-authorization.md`
§4.1 — to a table a human typed. That catches drift between the mirror and our prose. It cannot
catch our prose being wrong, which is exactly how `AuthorizeRequest` carried four wrong fields
out of eight.

So the mirror is now also pinned to upstream. The harness extracts
`openhands.sdk.security.{risk,confirmation_policy,analyzer,ensemble}` from the image's
PyInstaller bundle, proves each matches the pinned sdist, and executes the real
`AlwaysConfirm` / `NeverConfirm` / `ConfirmRisky` / `EnsembleSecurityAnalyzer` objects across all
192 combinations of stop × threshold × confirm_unknown × risk × location.

## Result

The mirror was correct — all 192 cells agree. Two facts ADR-006 depended on are now executed
rather than argued: `SecurityRisk.is_riskier` is reflexive, and `EnsembleSecurityAnalyzer`
defaults to `propagate_unknown=False` (filter UNKNOWN, return `max(concrete)`).

## Limits

- **Static and point-in-time.** `trust-dial.upstream.test.ts` fails if the fixture's digest stops
  matching `docs/UPSTREAM_PINS.md`, so a pin bump forces a re-capture rather than silently
  invalidating the check.
- **Decision function only.** Nothing here pins the `mapsTo` strings, the stop labels, or the
  existence of the ADR-006 analyzer in the middleware.
- **`DiscriminatedUnionMixin` was stubbed** with `pydantic.BaseModel`; `rich.Text`, the SDK
  logger and `ActionEvent` were stubbed inert, to avoid installing the SDK and executing
  pip-resolved code instead of the image's. Logic living in the base class is therefore not
  covered. See the `caveat` field and the docstring of `scripts/verify_trust_dial.py`.
- A verified mirror is still a mirror. Phase 1 owes driving this from the middleware.
