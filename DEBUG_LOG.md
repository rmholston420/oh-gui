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

## 2026-08-08 06:55 EDT - Three defects in my own instrumentation, found in one run

### 1. Thermal cutout fired but the run continued
- **Symptom:** `!! THERMAL CUTOUT: 83C >= 83C ceiling. Unloading models and stopping.`
  printed, the summary printed, `RUN ABORTED BY THERMAL CUTOUT` printed - and then the
  `fa=0` cell ran anyway and wrote a row to the CSV.
- **Root cause:** `trap 'gpu_watch_stop' EXIT INT TERM`. The watcher's `kill -TERM` was
  caught, the handler printed the summary, and **execution resumed at the next loop
  iteration** because the handler did not exit. A trap that only prints is not a cutout.
- **Fix:** split the traps. `EXIT` still summarises; `INT`/`TERM` now summarise then
  `exit 1`. Added `gpu_aborted()` and a between-cell check in `fa_probe.sh`, so a long
  matrix stops even if the signal is missed while curl holds the foreground.
- **Files:** `bench/lib/gpu.sh`, `bench/fa_probe.sh`.
- **Severity note:** this is the worst class of bug in this tooling - a safety mechanism
  that reports success while not acting. The card went on to run a second full cell at
  600 W after announcing it had stopped.

### 2. Every sample falsely reported as throttled
- **Symptom:** `throttled samples: 32` out of 32 - including idle samples at 33 C - and a
  spurious `WARNING: throttling occurred - tok/s NOT comparable`.
- **Root cause:** the parser took `$NF` of lines matching the throttle reasons. nvidia-smi
  prints `SW Power Cap : Not Active`, whose **last whitespace-delimited field is the word
  "Active"**. So "Not Active" was read as "Active" on every sample.
- **Fix:** parse the value after the colon with `-F':'`, strip whitespace, exact-match
  `"Active"`. Verified against captured nvidia-smi text in both directions: `Not Active`
  now yields no match, an injected `Active` line still matches.
- **Files:** `bench/lib/gpu.sh`, `bench/thermal_watch.sh`.
- **Consequence:** every throttle verdict emitted before this fix is meaningless and
  should be ignored. No conclusion in the log depended on one.

### 3. eval_count stuck at 2 - my v3 "fix" never applied
- **Symptom:** `INVALID(n=2)` at NPRED=256 in three consecutive runs, including after I
  reported the decode measurement as fixed.
- **Root cause:** two separate faults. (a) The v3 edit that was supposed to replace the
  instruction `"Reply with exactly one word: ack"` used a match string with four leading
  spaces of indentation that the file did not have, so the replacement silently no-oped -
  and I asserted only on shell syntax, never on file content, so I reported a fix that had
  not been made. The prompt was still asking for one word; the model correctly gave two
  tokens. (b) The filler was 900 verbatim copies of one sentence, a degenerate context that
  would have suppressed generation regardless.
- **Fix:** both. Filler is now 900 distinct generated rules (902 unique lines verified);
  the instruction asks for ~250 words of prose. The patch asserts on the old string and the
  result is content-verified, not syntax-verified: 0 occurrences of the old instruction,
  1 of the new, and the request JSON is built and inspected in the sandbox before shipping.
  The probe also now prints `done_reason`, `eval_count` and a content preview per cell.
- **Files:** `bench/fa_probe.sh`.
- **Process note:** "syntax ok" is not verification of an edit. Assert on content.

