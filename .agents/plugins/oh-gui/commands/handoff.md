---
description: Overwrite SESSION_HANDOFF.md with current state and push.
---

`SESSION_HANDOFF.md` is overwrite-only — it reflects current state, not history. Replace its whole
content with:

- current build-sequencing stage / plugin / port in progress
- what was completed this session (one line per BUILD_LOG entry appended)
- what remains before the current Definition of Done is met
- any open question awaiting the operator's answer
- the exact next action, as one command or one clearly stated task

Timestamp the heading `YYYY-MM-DD HH:MM EDT` in America/Detroit, and check it is not in the future —
`scripts/check-log-timestamps.py` fails on future-dated entries.

Then commit and push. Do this before context runs out, not after.
