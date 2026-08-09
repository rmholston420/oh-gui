---
description: Run every OH-GUI gate and report pass or fail for each.
---

Run these in order from the repo root and report each result explicitly as PASS or FAIL. Do not
summarize; a gate you did not run is not a gate that passed.

```bash
python3 scripts/check-hard-constraints.py --no-color
python3 scripts/check-log-timestamps.py
python3 -m pytest scripts/tests/ -q
python3 -m pytest bench/toolcall/tests/ -q
python3 bench/validate_harness.py
( cd apps/gui && npx vitest run )
```

If any gate is red, read its output before proposing a fix. Do not touch a gate's threshold to make
it green.
