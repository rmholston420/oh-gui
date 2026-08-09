---
description: Vendor an upstream component instead of hand-building it.
argument-hint: "<component or capability>"
---

Hand-building something upstream already solved is the default failure mode. Before writing code:

1. **Restate scope** from `docs/specs/` — stage, component, ports touched, Definition of Done, and
   the exact stop condition.
2. **Inspect donor code first.** `docs/donor-specs/` for prior specs, `review/_sdk_src/` for SDK
   source. Read every match; never copy unread.
3. **Check the SDK first of all.** If OpenHands already does it, expose it — do not reimplement it.
   That is ADR-015, and SDK source beats SDK docs.
4. **License filter:** MIT, BSD-2/3, Apache-2.0, ISC, MPL-2.0. Refuse GPL/AGPL/BUSL/SSPL without an
   explicit operator override and an ADR.
5. **Log it in `PORTING_LEDGER.md` before the first commit** — source URL, commit SHA, SPDX license,
   modification notes, and the Native basis if it carries OpenHands data.
6. **Append a BUILD_LOG entry.**

Stop and ask if the license is not permissive, if no formal port fits, or if the spec is ambiguous.
