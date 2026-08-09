---
name: oh-gui-log-discipline
description: The four OH-GUI operational logs and the discipline each one requires. Use after completing any build slice, decision, port, or bug fix, before diagnosing any new error, and at the end of every session. Enforces search-DEBUG_LOG-first, append-only on the two logs, overwrite-on-SESSION_HANDOFF, and the timestamp format.
license: MIT
triggers:
  - BUILD_LOG
  - DEBUG_LOG
  - SESSION_HANDOFF
  - KNOWN_ISSUES
---

# OH-GUI Log Discipline

Four files at the repo root. Each has a different write rule; mixing them up loses history.

| File | Discipline | When |
|---|---|---|
| `BUILD_LOG.md` | **Append-only** | After every completed slice, decision, or port |
| `DEBUG_LOG.md` | **Append-only — search FIRST** | On any non-trivial diagnosis + fix |
| `KNOWN_ISSUES.md` | Editable open list | On an unresolved blocker |
| `SESSION_HANDOFF.md` | **Overwrite** | Last action of every session, before compaction |

Timestamps are `America/Detroit`, format `YYYY-MM-DD HH:MM EDT` (`EST` in winter).
`scripts/check-log-timestamps.py` enforces this.

## Search before you diagnose

Before investigating **any** error:

```bash
grep -in "<symptom keywords>" DEBUG_LOG.md
```

A hit means the fix is already recorded. Reuse it. Re-diagnosing a solved bug is the single most
expensive avoidable mistake in this repo.

## BUILD_LOG entry shape

```markdown
## YYYY-MM-DD HH:MM EDT — one-line summary

- **Stage / plugin / port:**
- **What changed:**
- **Files touched:**
- **Ports / adapters affected:**
- **ADR / ledger updated:**
- **Stop-condition status:** met | in-progress | blocked (reason)
```

## DEBUG_LOG entry shape

```markdown
## YYYY-MM-DD HH:MM EDT — symptom summary

- **Symptom:** exact error text, copy-pasted
- **Affected stage / plugin / port:**
- **Root cause:**
- **Fix applied:**
- **Files changed:**
```

## Record your own wrong beliefs

When a carried assumption turns out to be false, log the correction, not just the fix. A stale
belief that survives in a handoff costs a future session more than the original bug did.

## Rules

- Never edit or delete a prior entry in either append-only log. A superseded fix gets a **new**
  entry naming what it supersedes.
- One entry per step. Never batch several completed steps into one entry.
- Log aborts too, with the reason.
- Read `SESSION_HANDOFF.md` before doing anything else at session start.
