---
name: playwright-oh-gui
description: Playwright discipline for OH-GUI on Colossus. Use whenever writing a Playwright spec, running e2e tests, verifying a UI change, or debugging a Playwright failure. Enforces the live-workflow rule (no mocking unless necessary), the real-agent-server rule, and the role/aria selector discipline.
license: MIT
triggers:
  - playwright
  - "npx playwright"
  - e2e
  - "@live"
---

# Playwright for OH-GUI

## The rule that overrides the others

**Run the live workflow.** There is no point mocking anything unless mocking is necessary. A suite
that only ever exercises fixtures has not shown the product works.

```bash
cd apps/gui
npx playwright test --grep @live --headed --workers=1 --reporter=list
```

Live specs need the real stack up:

| Piece | Where |
|---|---|
| GUI dev server | `http://localhost:5173` |
| OpenHands agent-server | `http://127.0.0.1:8000` (container `ohg-verify`) |
| Ollama | `http://127.0.0.1:11434/v1` |

`--workers=1` for live specs: they share one real conversation and one real agent.

## Selectors

Query by role and accessible name. If an element cannot be reached that way, that is an
accessibility defect in the component — fix the component, do not reach for a CSS or test-id
selector to route around it.

## Reading failures

Playwright's terminal output truncates. When a failure is not obvious:

```bash
npx playwright test <spec> --reporter=json --output=/tmp/pw.json
```

The same applies to Vitest, whose failure detail is worse:

```bash
npx vitest run <file> --reporter=json --outputFile=/tmp/vt.json
```

## Mutation-testing your specs

A test that has never been seen to fail is not a test. After adding a gate-like assertion, break the
thing it guards and confirm red.

Apply the mutation in Python with an explicit membership assert, never a bare `sed`:

```python
s = path.read_text(); assert OLD in s; path.write_text(s.replace(OLD, NEW, 1))
```

A `sed` whose anchor silently fails to match produces a green run that looks exactly like a caught
mutant. That has happened here more than once. Grep to confirm the mutation actually landed before
believing any verdict.

## Anti-patterns

- ❌ Mocking the agent-server in a spec that claims to verify a workflow.
- ❌ `test-id` selectors used to skirt a missing accessible name.
- ❌ Asserting a disabled control is enabled without checking its other gates — `Reject` in the
  authorization card stays disabled at every width until a free-text reason is typed.
- ❌ Declaring a mutant caught without grepping that the mutation applied.
