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

## 2026-08-08 07:28 EDT - LACT could not load NVML despite a healthy driver

- **Symptom:**
  ```
  ERROR lact_daemon::server::handler: could not load Nvidia management library:
    libnvidia-ml.so.1: cannot open shared object file: No such file or directory
  ERROR lact_daemon::server::gpu_controller: NVML is missing, Nvidia controls will not be available
  ```
  `lact cli info` defaulted to the Raphael integrated AMD GPU; the RTX 5090 had no controls.
- **Affected:** host tooling (GPU fan control), not the OH-GUI build.
- **Diagnosis:** the host driver was healthy and NVML was fully resolvable -
  `/usr/lib/x86_64-linux-gnu/libnvidia-ml.so.1 -> libnvidia-ml.so.610.57.04`, present in
  the ldconfig cache, owned by `libnvidia-compute`, driver 610.57.04 (open kernel module).
  So the library was not missing from the host; it was missing from the daemon's view.
  `systemctl cat lactd` showed `ExecStart=bash /var/lib/flatpak/app/io.github.ilya_zlobintsev.LACT/.../daemon.sh`.
- **Root cause:** a **Flatpak** LACT install from 2026-07-18 had placed a unit at
  `/etc/systemd/system/lactd.service`, which shadows the native package unit at
  `/usr/lib/systemd/system/lactd.service`. Installing the `.deb` did not take effect
  because the higher-precedence Flatpak unit kept winning. The Flatpak sandbox cannot see
  host NVIDIA libraries, and its bundled GL runtime no longer matched host driver 610.57.04
  (installed 2026-07-29) - which is why the same daemon logged NVML success on Jul 31 and
  Aug 1 and failed from Aug 8.
- **Fix:**
  ```bash
  sudo systemctl disable --now lactd
  sudo mv /etc/systemd/system/lactd.service /etc/systemd/system/lactd.service.flatpak.bak
  sudo systemctl daemon-reload
  sudo systemctl enable --now lactd
  ```
- **Verified:** `Nvidia management library loaded`, `initialized nvidia controller for GPU
  10DE:2B85`, and `lact cli list-gpus` now reports `1: ... (NVIDIA GeForce RTX 5090) [Dedicated]`.
- **Files changed:** none in-repo; host systemd only.
- **Generalisable lesson:** "library not found" from a service whose host copy resolves
  fine is a namespace problem, not a packaging problem. Check what the unit actually
  executes before reinstalling anything - the install had already succeeded and was inert.
- **Residual, benign:** `could not reset the clocks table` and `could not get current
  performance level` both come from the AMD controller for the Raphael iGPU, not the 5090.

## 2026-08-08 07:45 EDT - gpu.sh thermal summary crashed before printing its verdict

- **Symptom:** `NameError: name 'over_warn' is not defined` in the embedded Python of
  `gpu_watch_stop`. The summary printed samples/temp/power/sm-clock and then died, so the
  `time >= WARN` line, the VERDICT line, and the thermal-throttle warning never appeared.
- **Affected:** `bench/lib/gpu.sh`, therefore every bench script that sources it.
- **Root cause:** self-inflicted, introduced in the throttle-parser split commit
  (`0851974`..). The rewrite replaced a single `throttled` list with separate `pcap` and
  `thermal` lists and recomputed those, but `over_warn`/`over_max` were left as bare
  references with their assignments dropped.
- **Fix:** compute both from the sample list; at 1 Hz a sample count is a second count.
  ```python
  over_warn=sum(1 for x in t if x>=WARN)
  over_max =sum(1 for x in t if x>=MAX)
  ```
- **Verified:** extracted the heredoc body and byte-compiled it with `py_compile`, then
  asserted both assignment strings are present in the committed file.
- **Repeat of a known process failure.** DEBUG_LOG 06:55 already recorded: `bash -n` proves
  shell syntax and says nothing about an embedded interpreter's source. That lesson was
  recorded and then not applied to the very next edit of the same file. Standing rule for
  `bench/lib/gpu.sh`: every change must (1) `bash -n`, (2) byte-compile the embedded
  Python, (3) assert on file content.
- **Consequence:** the "VERDICT: thermally fine" lines quoted in earlier BUILD_LOG entries
  for runs after `0851974` were never actually emitted. The underlying CSVs are unaffected -
  sampling and the cutout both worked; only the summary renderer failed.

