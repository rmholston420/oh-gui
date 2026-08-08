# OH-GUI Debug Log

Append-only, separate from `BUILD_LOG.md`. Newest entries at the bottom.
Never overwrite a prior entry.

**Search this file FIRST before investigating any new error.** If a matching or
similar symptom is already recorded, reuse the known fix instead of
re-diagnosing from scratch.

Entry format:

```
## YYYY-MM-DD HH:MM EDT - <short symptom title>
- Symptom (exact error text / observed behavior):
- Affected stage/plugin/port:
- Root cause:
- Fix applied:
- Files changed:
```

---

_No entries yet. First debugging action in this repo appends below._

## 2026-08-08 05:58 EDT - fa_probe.sh v1 crashed with KeyError: 'PROMPT'

- **Symptom:**
  ```
  Traceback (most recent call last):
   File "<stdin>", line 4, in <module>
   File "<frozen os>", line 709, in __getitem__
  KeyError: 'PROMPT'
  ```
  `bench/fa_probe.sh` produced no CSV and no measurement.
- **Affected:** Phase 0 bench tooling, `bench/fa_probe.sh` v1.
- **Root cause:** shell ordering defect of my own making. The script assigned `PROMPT=$(...)`,
  then ran a second heredoc that read `os.environ["PROMPT"]`, and only called
  `export PROMPT` on the line AFTER that heredoc. A plain assignment is not in the
  environment of a child process, so Python never saw the variable. The `set -euo pipefail`
  guard did not catch it because the failure was inside a command substitution.
- **Fix:** rewrote as v2. A single Python step now builds the prompt AND writes the complete
  request to a JSON file, which curl posts with `-d @file`. No shell variable crosses a
  process boundary, so the ordering hazard is gone.
- **Files changed:** `bench/fa_probe.sh` (v1 -> v2, replaced in place).
- **Process note:** the Space instructions require verifying that a multi-step sequence is
  executable and that dependencies precede their use. This script was shipped without that
  check. The v2 rewrite removes the class of bug rather than patching the line.

