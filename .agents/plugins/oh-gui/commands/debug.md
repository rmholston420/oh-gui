---
description: Diagnose an error, searching DEBUG_LOG.md before investigating.
argument-hint: "<error text or symptom>"
---

Before investigating anything:

```bash
grep -in "<symptom keywords>" DEBUG_LOG.md
```

A hit means this was already diagnosed. Reuse the recorded fix. Re-diagnosing a solved bug is the
most expensive avoidable mistake in this repo.

If there is no hit:

1. Capture the error verbatim. Do not paraphrase it.
2. Reproduce it minimally.
3. Hypothesize exactly one cause and test that one.
4. When fixed, append a DEBUG_LOG entry: symptom, affected stage/port, root cause, fix, files.

Never try several fixes at once to see what sticks.
