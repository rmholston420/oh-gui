# apps/gui - OH-GUI Frontend

Browser application. Vibe/Pro semantic-zoom lenses over one shared data model
(`docs/specs/03-layout.md`).

**Not scaffolded yet.** Phase 0/1 work. This file records the contract so the shape is
fixed before any code exists.

## Hard boundaries (ADR-001)

- Talks **only** to `services/middleware`. Never calls the OpenHands Agent Server
  directly for anything policy-bearing.
- Contains **no** policy logic. No confirmation policies, no risk scoring, no analyzer
  calls, no quarantine decisions. It renders what the middleware decides and posts user
  intent back.
- `@openhands/typescript-client`, if used at all here, is limited to non-policy transport
  and must be pinned. Prefer keeping it entirely middleware-side.

## Vendored donor code

Agent Canvas components land in `apps/gui/src/components/vendor/` with an SPDX header and
a source comment naming upstream repo, path, and commit SHA. Every port gets a
`PORTING_LEDGER.md` entry before it is wrapped.

Aceternity UI and Magic UI are copy-paste sources vendored into `components/ui/`, never
npm dependencies, and are subject to the same CI contrast gates as project code
(`docs/specs/07-visual-design.md` §7.2.1).

## Motion stack

`motion`, imported from `motion/react`. `framer-motion` must never be added.
