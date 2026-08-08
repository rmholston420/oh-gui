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

## 2026-08-08 08:22 EDT - LACT fan curve active but fans never spin

- **Symptom:** during a 41 s load reaching 82 C edge, `nvidia-smi --query-gpu=fan.speed`
  read `0 %` on every one of 36 samples. 12 samples were at or above the 78 C warn
  threshold. `lact cli stats` reports `Fan Control Mode: Curve` and the curve's 80 C point
  is `1.00`, so the fans should have been at 100%.
- **Affected:** host thermal management; `bench/lib/gpu.sh` reporting is correct (it
  faithfully recorded 0%).
- **Not yet diagnosed.** Candidate causes, in order of likelihood:
  1. LACT parses and accepts the NVIDIA fan curve but the NVML fan-control call fails
     silently, or requires a capability the daemon lacks.
  2. The fans ARE spinning and `nvidia-smi` misreports speed while an external controller
     owns the fan. Distinguishable: LACT reports RPM directly, nvidia-smi reports percent.
  3. The curve is stored but never applied because the config was appended while the
     daemon was stopped and something about load order skipped it.
- **Decisive next test** - static mode removes the curve from the equation entirely. If RPM
  moves, control works and the curve is the problem; if RPM stays 0, LACT cannot drive this
  card's fans at all:
  ```bash
  sudo systemctl stop lactd
  sudo python3 - <<'EOF'
  import re, pathlib
  p = pathlib.Path('/etc/lact/config.yaml'); s = p.read_text()
  s = s.replace('mode: curve', 'mode: static').replace('static_speed: 1.0', 'static_speed: 0.8')
  p.write_text(s)
  EOF
  sudo systemctl start lactd; sleep 6
  lact cli -g "$(lact cli list-gpus | awk -F'[ (]' '/NVIDIA/{print $2; exit}')" stats | grep -i fan
  ```
- **Note on the earlier '83 C cutout' language:** that event was this repo's own software
  guard firing at its 83 C ceiling, not the card throttling. The card's hardware slowdown
  is 88 C, confirmed from `T.Limit 57` at 33 C (= 90 C max operating) minus the -2 C
  slowdown spec. Earlier entries that implied a hardware cutout were imprecise.

## 2026-08-08 08:35 EDT - CORRECTION: fan speed is a REPORTING failure, not a control failure

- **Supersedes the 08:22 entry above.** That entry's framing was wrong and the wrong
  remediation was nearly applied.
- **Operator observation (decisive):** "the fans were never stopped, i can see them
  spinning." Physical inspection beats every readout in this investigation.
- **Actual fault:** driver 610.57.04 does not expose this 5090's fan tachometer through
  NVML. Both `nvidia-smi --query-gpu=fan.speed` and `lact cli stats` therefore report
  `0 %` / `0 RPM` while the fans are visibly running. Nothing is wrong with the cooling.
- **What I got wrong, and why it mattered:** I read `fan max 0%` at 82 C, inferred that
  LACT had seized fan control and pinned it at zero, and drafted a command to set
  `fan_control_enabled: false` to "give the fans back to the vBIOS." The fans were never
  taken away. The instrument was broken, not the machine. Both the static-80% test and the
  curve test returned 0 RPM for the same reason, which I misread as corroboration - two
  readings from the same broken sensor are one observation, not two.
- **Fix applied:** `bench/lib/gpu.sh` now treats an all-zero `fan_pct` series as
  "NOT REPORTED by this card" in the summary instead of printing `fan max 0%`, and
  `gpu_sample` carries a comment stating that 0 means unreported, not stopped. No guard may
  be built on this column.
- **Still genuinely unknown:** whether the LACT curve is being applied at all. It cannot be
  verified through any readout on this hardware; only audible or tachometer-free physical
  observation can settle it. Deliberately NOT pursued further - the bench runs at 435 W
  where the card peaks at 69-70 C, so fan tuning is not on the critical path.
- **Unaffected by this correction:** the 435 W decision (it rests on temperature and
  throttle counters, both of which report correctly), the hotspot record-only decision, and
  the flash-attention verdict.
- **Generalisable lesson, second instance today:** when an instrument reports an extreme
  value (0% fans at 82 C), suspect the instrument before theorising about the system. The
  earlier throttle-parser bug was the same shape - every sample flagged as throttled, which
  was a parser reading `$NF` of "Not Active", not a card in permanent throttle.

## 2026-08-08 06:44 EDT — Reference solution scores 0/30 under its own scorer

**Symptom**
```
c99_perfect   0/30   0   123.4  FAILURES
              failed: code_tests
```
`bench/path_e/score_code.py` scored the *known-good* reference solution
(`bench/gold/reference/code_reference.py`, independently verified 30/30) at zero. The
failure name was the module `code_tests`, not any individual test method.

**Affected:** Phase 0 · `bench/path_e/score_code.py` · ADR-005 round 2 scoring.

**Root cause**
The suite was executed as `python3 -I -m unittest code_tests`. `-I` (isolated mode)
implies `-E` and `-s`, and *also removes the script/working directory from `sys.path`*.
The candidate module and the test module both live in the temp directory, so neither was
importable. `unittest` reports an import failure as a single `ERROR: code_tests`, which
the parser counted as one ordinary failure against 30 collected tests.

Had this shipped, every cell in round 2 would have scored 0 on the 60 machine points and
the coder verdict would have been decided entirely by the 40 judged points — while
looking like a legitimate result.

**Fix**
- Replaced `-I` with `-s` plus an explicitly constructed environment whose `PYTHONPATH`
  is exactly the temp directory. Isolation from user site-packages is retained; the
  inherited environment is still scrubbed rather than passed through.
- Added a distinct `IMPORT_ERROR` status: an `ERROR:` line naming `code_tests` or
  `candidate` rather than a test method is now reported as an import failure with the
  exception text, instead of being silently folded into the failure count.
- Added a source comment recording why `-I` must not be reintroduced.

**Detection**
Found by running the scorer against four fixtures before trusting it: the reference
solution (expect 60/60), a naive `endswith("Active")` implementation (expect partial), and
a prose-only answer (expect NO_CODE_BLOCK). Post-fix: 30/30, 13/30, 0/30 respectively —
and the naive version fails `test_not_active_is_false`, confirming the intended trap
discriminates. **A scorer that has not been run against a known-good input is not a
scorer.**

**Files:** `bench/path_e/score_code.py`

---

## 2026-08-08 06:45 EDT — Calibration test "failure" was a subshell counter, not a bash array bug

**Symptom**
`gpu_cold_calibrate` under a stubbed sensor returned `gate = first_sample + 3` in every
scenario. Against a falling sequence `70 66 62 58 54 50 47 45 44 44...` it reported
`settled at 70C` and set the gate to 73 C, apparently ignoring the 6-sample/30 s window.

**Affected:** Phase 0 · `bench/lib/gpu.sh` · cold-gate calibration.

**Root cause — TWO, and the first diagnosis was wrong**

*Incorrect diagnosis (recorded deliberately):* I concluded `local win=()` does not create
an array in bash, leaving a string `"()"` so that `${#win[@]}` is 1 and the window test
passes on the first reading — and patched `gpu.sh` with a comment asserting this. **This
is false.** `bash -c 'f() { local w=(); w+=(a); w+=(b); echo ${#w[@]}; }; f'` prints `2`
on bash 5.3.9. The comment was removed.

*Actual root cause:* the fault was in the test fixture, not in `gpu.sh`. The fixture kept
its sample index in a shell variable incremented inside `gpu_temp`, but the caller invokes
it as `t=$(gpu_temp)` — a command substitution, which runs in a **subshell**. The
increment never propagated to the parent, so every call returned `SEQ[0]`. The window
correctly saw six identical readings, correctly computed spread 0, and correctly declared
the curve settled. The function was right the whole time.

**Fix**
Fixture keeps its counter in a file (`/tmp/ci`) so it survives the subshell. `local -a`
was kept in `gpu.sh` as an explicitness improvement, with a comment stating only that the
window test depends on `win` being an array — not the false claim about `local w=()`.

With the corrected fixture, all six scenarios pass: falling curve settles at the true
floor of 44 after 60 s (gate 47) rather than at the first reading; already-cold flat gives
44/41; 1 C jitter is tolerated; sawtooth warns "never settled" and uses lowest-seen + 3;
a preset `GPU_COLD_C` skips calibration; a dead sensor falls back to 45 C.

**Lesson — third instance this session.** Twice before, an exotic explanation was reached
for ahead of the obvious one (LACT pinning fans at 0%; a foreign GPU client on :11434 that
turned out to be our own bench). Here the same reflex produced a *false statement written
into a source file*. Before diagnosing a component, verify the harness that is testing it,
and never commit an explanatory comment that has not been executed as a test.

**Files:** `bench/lib/gpu.sh`

## 2026-08-08 06:55 EDT — Stray user-unit ollama shadowed ollama.service for weeks; three runs void

**Symptom.** `journalctl -u ollama` showed `Error: listen tcp 0.0.0.0:11434: bind: address
already in use` with `restart counter is at 1260`. `systemctl status ollama` reported
`disabled` and `activating (auto-restart) (Result: exit-code)`. Meanwhile every bench request
succeeded and `/api/version` was healthy, so nothing in the harness noticed.

**Affected.** Path E bench (ADR-005) — runs `20260808_0555`, `20260808_0633`, `20260808_0644`.
Probably also ADR-004's VRAM sweep, since `restart counter is at 1` first appears **Jul 18**.

**Root cause.** A *user*-scope unit at `~/.config/systemd/user/ollama.service`
(`Restart=always`, `enabled`) started `ollama serve` as PID 3218 at 01:58:32 and held
127.0.0.1:11434. The system unit could therefore never bind and crash-looped. Confirmed from
`/proc/3218/environ`, which contained exactly one Ollama variable —
`OLLAMA_HOST=127.0.0.1:11434` — plus a cgroup path under
`user@1000.service/app.slice/ollama.service`. Its parent PID 2857 was `systemd --user`.
The drop-ins in `/etc/systemd/system/ollama.service.d/` were never in effect.

Two independent confirmations, neither requiring assumption:
- `override.conf` sets `OLLAMA_HOST=0.0.0.0:11434`, but the listener was on `127.0.0.1`.
- The stray's own startup config dump (Ollama 0.30.7) in the user journal.

**Config actually in effect vs intended:**

| Variable | Stray (actual) | Drop-in (intended) | Confound |
|---|---|---|---|
| `OLLAMA_FLASH_ATTENTION` | false | 0 | none — identical |
| `OLLAMA_NUM_PARALLEL` | 1 | 1 | none — identical |
| `OLLAMA_KV_CACHE_TYPE` | "" (default f16) | f16 | none — equivalent |
| `OLLAMA_GPU_OVERHEAD` | 0 | 1073741824 | **yes** — 1 GiB more VRAM was available |
| `OLLAMA_KEEP_ALIVE` | 5m | -1 | minor — harness unloads explicitly |
| `OLLAMA_MAX_LOADED_MODELS` | 0 (auto) | 2 | minor |
| `OLLAMA_MODELS` | `~/.ollama/models` | `/usr/share/ollama/.ollama/models` | **yes** — different store |

The two variables that would have destroyed throughput comparability (flash attention,
parallelism) were already at intended values by default, so round 1's *rankings* survive and
the `arch` prompt's `NUM_PARALLEL=1` premise holds. Runs 0633 and 0644 are void for the
separate reason that both were interrupted.

**Second defect found while fixing the first.** `User=ollama` on the system unit points it at
`/usr/share/ollama/.ollama/models` (48 GB, 6 models). The full matrix — `qwen3.6:27b`,
`35b`, `35b-a3b-mtp-q4_K_M`, devstral `UD-Q4_K_XL` — lives in `~/.ollama/models` (116 GB).
Recovering the service therefore made 4 of 5 required models unresolvable while `ollama list`
still returned six real models and looked healthy.

**Retracted hypotheses.** (1) I proposed `KEEP_ALIVE=5m` eviction as the cause of the
transient `c12_r1` HTTP 500. It does not fit: warmup completed 5 s before the request and
nothing was idle for 5 minutes. The 500 remains **unexplained**. (2) I claimed the capacity
data and the bench "described two different configurations"; with the Jul 18 evidence both
were likely measured under the same stray, making them mutually consistent but mislabelled.

**Fix applied.** New `bench/lib/ollama.sh` providing `ollama_guard` (listener PID must equal
the unit's MainPID, checking user scope then system scope; every entry in
`OLLAMA_REQUIRED_ENV` present with the exact expected value; writes the serving process's
real `OLLAMA_*` environment to `<run>/ollama_provenance.txt`) and `ollama_require_models`
(every matrix model id resolves on the serving instance, exact match so
`35b-a3b-q4_K_M` is not accepted for `35b`). Both called in `run_path_e.sh` preflight before
any cell runs. Fails closed, no override flag. `OLLAMA_MODELS` is required to be set
*explicitly* because an Ollama default never appears in `/proc/environ` and is therefore
unverifiable — that unverifiability is what hid this.

**Files changed.** `bench/lib/ollama.sh` (new), `bench/tests/test_ollama_guard.sh` (new, 17
assertions), `bench/path_e/run_path_e.sh`, `bench/path_e/bench_path_e.py` (`models`
subcommand), `bench/validate_harness.py` (layer 5).

## 2026-08-08 06:58 EDT — Ctrl-C misreported as thermal cutout

**Symptom.** Interrupting a run printed `run terminated by thermal cutout` even with the card
at 72 C and zero samples above 80 C.

**Root cause.** `gpu.sh` INT/TERM trap asserted a thermal cause unconditionally.

**Fix.** Trap now consults the abort flag, the only authority on whether the card tripped,
and otherwise prints `run interrupted by signal (no thermal breach)`. A guard that cries wolf
gets ignored, which is how the 04:46 cutout-then-continue defect went unnoticed.

**Files changed.** `bench/lib/gpu.sh`.

## 2026-08-08 07:16 EDT — `local a=.. b="${a}".."` aborts under set -u on bash 5.3.9

**Symptom.** `bench/oneoff/embed_igpu_ab.sh: line 61: arm: unbound variable`, immediately on
the first `run_arm cpu 0` call, before the arm header printed.

**Affected.** `bench/oneoff/embed_igpu_ab.sh` (embedder CPU vs iGPU A/B). No bench data.

**Root cause.** The line was
`local arm="$1" igpu="$2" log="$OUT/${arm}_server.log" pid`. Bash declares **every** name in a
`local` list before performing **any** of the assignments, so `${arm}` in the third assignment
resolves to the freshly-declared, still-unset local `arm` rather than to `$1`. Under
`set -u` that aborts.

**Verified by execution, not inferred:**
```
$ bash --version | head -1
GNU bash, version 5.3.9(1)-release (x86_64-pc-linux-gnu)
$ OUT=/t bash -uc 'f(){ local a="$1" b="$OUT/${a}_x"; echo "b=$b"; }; f cpu'
bash: line 1: a: unbound variable
```

**Fix.** Split into one `local` per name. Repo swept with grep for the same pattern: this was
the only occurrence.

**Note.** This is the same *class* of error as the earlier `local win=()` episode, where I
asserted a bash behaviour without running it and wrote a false comment into `gpu.sh`. The
difference here is that the claim above was reproduced in a shell before being written down.

## 2026-08-08 07:22 EDT — embedder iGPU arm ran on the RTX 5090; hiding CUDA does not hide Vulkan

**Symptom.** The iGPU arm of `bench/oneoff/embed_igpu_ab.sh` reported 1.52s vs the CPU arm's
59.62s — a 39x "iGPU win" that is physically implausible for a 2-CU RDNA2 iGPU. The run's own
assertion caught it and aborted:
`FATAL: arm igpu selected the DISCRETE GPU - this measurement is invalid.`

**Affected.** `bench/oneoff/embed_igpu_ab.sh` (one-off, outside the Path E matrix). No Path E
data and no ADR conclusion was touched.

**Root cause.** `CUDA_VISIBLE_DEVICES=""` constrains only the CUDA backend. With
`OLLAMA_VULKAN=1` the Vulkan loader independently enumerated **both** ICDs, and ollama logged:

```
inference compute id=0 library=Vulkan name=Vulkan0 description="NVIDIA GeForce RTX 5090" type=discrete
inference compute id=1 library=Vulkan name=Vulkan1 description="AMD Ryzen 9 7900X ... (RADV RAPHAEL_MENDOCINO)" type=iGPU
selecting single GPU for llama-server model main_gpu=0 id=0 library=Vulkan name=Vulkan0 ... RTX 5090
load_tensors: offloaded 37/37 layers to GPU
```

The scheduler preferred the discrete card, so the "iGPU" arm was a 5090 arm with all 37 layers
resident. `OLLAMA_IGPU_ENABLE=1` enables iGPU *consideration*; it does not pin to it, and
ollama has no per-request device pinning.

**Fix.** The iGPU arm now restricts the Vulkan **loader** to the RADV ICD via
`VK_DRIVER_FILES` (+ deprecated alias `VK_ICD_FILENAMES`) resolved from
`/usr/share/vulkan/icd.d/radeon_icd*.json`, plus `GGML_VK_VISIBLE_DEVICES=0`. The ICD is
resolved by glob and the arm aborts if absent rather than falling back. The CPU arm keeps
`OLLAMA_VULKAN=0`, and its device was confirmed as `library=cpu` in the same run.

**Note.** The 07:16 CPU arm remains **valid** — `inference compute id=cpu library=cpu` — so
only the iGPU arm needs re-running.

**Incidental finding (not the question asked).** Embedding qwen3-embedding:4b on the 5090 via
Vulkan reached ~6849 tok/s vs ~175 tok/s on CPU. That quantifies the cost of ADR-004 A#2's
VRAM isolation at roughly 39x embedder throughput, and it is a Vulkan number, not CUDA.

---

## 2026-08-08 08:40 EDT — `SAMPLING=precise` silently ignored; three cells run at the wrong preset

**Symptom.** `REPS=3 SAMPLING=precise bash bench/path_e/run_path_e.sh c13_planner_arch_35bmtp`
completed normally, printed no warning, and produced three cells whose dump header read
`sampling={'temperature': 1.0, 'top_p': 0.95, ...}`. Temperature 1.0 is the `planner` preset;
`precise` is 0.6. The run consumed 280 s of GPU time and was nearly filed as the pre-registered
`precise`-preset test in ADR-005.

**Affected.** `bench/path_e/run_path_e.sh`, `bench/path_e/bench_path_e.py`, Path E cell c13.

**Root cause.** Sampling was derived exclusively from the cell's hardcoded role:
`bench_path_e.py:222` did `sampling = dict(SAMPLING[role])`, with `role` unpacked from the
`CELLS` tuple. No override path existed at any layer — not argparse, not the driver. `bash`
places an unrecognised leading assignment into the child environment without complaint, so
nothing in the stack was in a position to object. The deeper fault is procedural: ADR-005
pre-registered a follow-up test in prose without checking that a command existed which could
execute it.

**Fix applied.**
- `bench_path_e.py`: `--sampling` argument with `choices=sorted(SAMPLING)`, threaded through
  `run_cell` -> `run_task`. The effective preset is written to the result JSON as
  `sampling_preset`, and the override as `sampling_override`, so no future reader has to infer
  which preset a cell ran under. The banner line now prints `preset=` alongside `role=` and
  emits an explicit `SAMPLING OVERRIDE:` line when they differ.
- `run_path_e.sh`: reads `SAMPLING`, validates it against `python3 $HARNESS presets` (the
  harness's own table, so the two cannot drift), and exits 1 with the known-preset list on a
  miss. A knob a caller can plausibly reach for must work or refuse loudly.
- `bench/path_e/bench_path_e.py presets` subcommand added for that validation.
- `bench/tests/test_sampling_override.sh` — 8 assertions, no GPU, no model. Includes a
  vacuousness check asserting `planner` and `precise` temperatures actually differ.

**Files changed.** `bench/path_e/bench_path_e.py`, `bench/path_e/run_path_e.sh`,
`bench/tests/test_sampling_override.sh` (new).

**Generalisation for future entries.** Any environment variable documented in a header comment
but not read by the code it appears to configure is this same bug. `NUM_CTX` in
`bench/oneoff/embed_query_latency.sh` was *also* set on its own line by the operator during this
session (`NUM_CTX=2048` then a separate command) and therefore never reached the script, which
ran at its 512 default. That one is shell semantics rather than a harness defect, but the
observable outcome — a requested parameter silently not applied — is identical.

## 2026-08-08 08:56 EDT — probe measured the wrong configuration: embedder on GPU, not CPU

- **Symptom:** `bench/oneoff/max_loaded_lru_probe.sh` step 1 reported
  `qwen3-embedding:4b  GPU  size_vram=2754 MiB`, and the verdict printed
  `RESULT: unexpected - inspect the ps_*.json files.`
- **Affected:** Phase 0 baseline, `bench/oneoff/max_loaded_lru_probe.sh` (v1), ADR-004 A#2
  placement invariant.
- **Root cause:** the `/api/embed` payload sent `{"num_ctx": 512}` with **no `"num_gpu": 0`**.
  Ollama defaults to GPU placement, so the probe silently measured a configuration the project
  does not use. The 05:50 EDT measurement that originally settled the slot question had used
  `num_gpu:0` and reported `size_vram: 0`; I did not carry that option across.
- **Why it mattered rather than being cosmetic:** the probe's whole discriminator is that a
  CPU-resident embedder holds 0 MiB, so evicting it frees nothing and can only be explained by the
  slot limit. A GPU-resident embedder frees 2,754 MiB, making slot eviction and VRAM eviction
  indistinguishable. The run could not have answered its question no matter what it printed.
- **Fix applied:** v2 sends `{"num_ctx": 512, "num_gpu": 0}` and adds a gate immediately after
  step 1 that aborts with an explicit explanation if `size_vram != 0`, instead of continuing to an
  uninterpretable verdict.
- **Second defect, same run:** the `WHY THIS EXISTS` block claimed `num_ctx=4096` lets both role
  models fit. Measured 20,364 + 25,578 = 45,942 MiB vs 32,607 MiB. Comment corrected in place and
  the false claim retained as a labelled retraction so the reasoning error stays visible.
- **Lesson for future probes:** when a probe's validity depends on a placement or option, assert
  that option in the probe itself. Both defects here were claims in comments that no line of code
  enforced.
- Files: `bench/oneoff/max_loaded_lru_probe.sh`.

## 2026-08-08 09:28 EDT — `tsc -b` fails on Colossus with TS2591 for `node:fs` / `node:path`

- **Symptom.** `npm run gate` passed lint and all 4 tests, then:
  `src/__tests__/import-boundary.test.ts:1:53 - error TS2591: Cannot find name 'node:fs'. Do you
  need to install type definitions for node?` and the same for `node:path`. Found 2 errors.
  Colossus Node v24.16.0, after `npm ci`.
- **Stage/port.** Phase 0, `apps/gui` scaffold. No port affected.
- **Root cause.** `@types/node` was **never declared** in `apps/gui/package.json`, but the same gate
  passed in the authoring sandbox. It passed there because an earlier `npm install` had left a
  transitively-hoisted `@types/node` in `node_modules`, which TypeScript picked up automatically
  (no `types` field pins existed to stop it). `npm ci` on Colossus built the tree strictly from the
  lockfile, the hoisted copy was absent, and the undeclared dependency surfaced. Classic
  works-on-my-machine: **the sandbox was passing on a package it had no right to see.**
- **Fix.** Declared `@types/node@24.13.3`, and — rather than adding `"node"` to a single global
  `types` array — **split the TypeScript project in two**, because letting browser code typecheck
  against `fs` and `process` would trade one defect for a worse one:
  - `tsconfig.app.json` — `src` minus tests, `types: ["vite/client"]`, **no Node types**.
  - `tsconfig.node.json` — `vite.config.ts`, `playwright.config.ts`, `src/__tests__`, `e2e`,
    `types: ["node", "vitest/globals"]`.
  - `tsconfig.json` is now a solution file referencing both; `tsconfig.base.json` holds shared
    options with `composite: true`.
- **Verified by execution, not assumption.** A `node:fs` import placed in browser source fails
  `tsc -b` with TS2591; the identical import in a test file passes; and the whole gate passes after
  `rm -rf node_modules && npm ci`, which reproduces the strict Colossus tree rather than the
  sandbox's lucky one.
- **Rule adopted.** Re-verify any Node-based gate with a clean `npm ci`, never with an incrementally
  grown `node_modules`. Hoisting hides missing dependencies.
- Files: `apps/gui/{package.json,package-lock.json,tsconfig.json,tsconfig.base.json,
  tsconfig.app.json,tsconfig.node.json}`.
