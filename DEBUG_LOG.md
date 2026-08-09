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

## 2026-08-08 09:56 EDT — `Error: Timed out waiting 60000ms from config.webServer` on Colossus

- **Symptom.** `npm run verify` on Colossus: lint, 25 unit tests, `tsc -b` and `vite build` all
  clean, then Playwright aborted with `Error: Timed out waiting 60000ms from config.webServer.`
  and **no other output**. The same command passed in the authoring sandbox.
- **Stage/port:** Phase 0, `apps/gui` e2e harness (ADR-007). No ports touched.
- **Root cause (two defects, one symptom).**
  1. `playwright.config.ts` ran `npm run dev` with no `--host`. Vite's default host is `localhost`.
     On a dual-stack machine that resolves to `::1` first, so Vite binds only the IPv6 loopback
     while the config polls `http://127.0.0.1:5173`, which never answers. The sandbox is
     IPv4-only, which is why it passed there and only there. **Measured on Colossus 2026-08-08
     09:58 EDT**: with the default host, `ss -lntp | grep 5173` reports exactly one listener,
     `LISTEN [::1]:5173`, and no `127.0.0.1:5173`. Confirmed, not inferred. It could not be
     confirmed from the original failure output, because —
  2. Playwright's `webServer` discards the child's stdout/stderr unless told otherwise. Whatever
     Vite said about the failure was thrown away, leaving a bare timeout. The absence of a
     diagnosable error is itself the more serious defect: it is what made cause 1 unfalsifiable.
- **Fix.** Bind explicitly to the address being polled — `--host 127.0.0.1 --port 5173
  --strictPort` — so name resolution order cannot participate. Add `stdout: 'pipe'` and
  `stderr: 'pipe'` so a startup failure prints its reason.
- **Verified by probe, both directions.** Appending a `throw` to `vite.config.ts` now surfaces
  `[WebServer] Error: DELIBERATE_STARTUP_FAILURE_PROBE` instead of a bare timeout; with the probe
  removed, all 8 tests pass.
- **Third defect found while probing.** `reuseExistingServer: true` trusts *anything* answering on
  the port. Parking a `python -m http.server` on 5173 caused Playwright to adopt it and every
  assertion failed as though the UI were broken. Added a title assertion in `gotoStep` so a foreign
  server fails as "something other than OH-GUI is serving the dev port". Probed: it does.
- Files: `apps/gui/playwright.config.ts`, `apps/gui/e2e/wizard.spec.ts`.
- Also switched the reporter to `list` + `html` so `npx playwright show-report` has a report to
  open; `playwright-report/` and `test-results/` were already gitignored.

### Confirmation addendum — 2026-08-08 09:58 EDT

The binding fix and the logging fix shipped in one commit, so the green re-run alone could not
attribute the repair. Measured separately afterwards: `npm run dev` with Vite's default host binds
`[::1]:5173` only. The IPv4 poll target therefore never had a listener, which is the whole failure.
Root cause is now measured rather than reasoned, and ADR-007's amendment was updated to match.

Unrelated observation from the same command: `pkill -f vite` reported
`killing pid 16688 failed: Operation not permitted` — a non-owned process whose command line
matches `vite`. Harmless here (the dev server, pid 2433892, did exit), but `pkill -f` is broader
than it looks; prefer `--strictPort`'s own failure or an explicit pid.

## 2026-08-08 10:19 EDT — Baseline harness would have recorded a silent baseline of zeros

**Symptom:** No error. t01 started cleanly — cold gate passed at 32 °C, `/server_info` recorded,
task card displayed, recorder waiting for marks. The defect was that the run would have completed
successfully and produced `lines_accepted: 0` for every task.

**Affected:** Phase 0 exit item 3, `bench/baseline/` (harness only; no port or adapter).

**Root cause:** `mark.py` measures `git diff --numstat` inside the fixture at
`~/.oh-gui/baseline/fixture`. The stock app's agent-server does not work there. Read from the donor
at pinned SHA 4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364: `dev-safe.mjs:672` resolves
`workingDir = env.VITE_WORKING_DIR || <stateDir>/workspaces`, and `dev-with-automation.mjs:442`
bakes that into the frontend as `VITE_WORKING_DIR` at launch. With the variable unset the agent
works in `~/.openhands/agent-canvas/workspaces`, and the fixture is never touched.

This is the harness's worst failure mode, not its most obvious one: nothing errors, the report
generates, and the numbers are self-consistent zeros that read as a finding about the stock app
rather than a defect in the measurement. It was caught by asking where the agent's cwd comes from
before the first turn was sent, not by anything the harness reported.

**Fix applied:**
1. `VITE_WORKING_DIR=$HOME/.oh-gui/baseline/fixture` is now required in the documented launch
   command, with the reason and the source line recorded in `bench/baseline/README.md`.
2. `mark.py` shouts on any accept that changes no files, names the fixture path, states that every
   line count in the run is meaningless, and tells the operator to abandon and relaunch. A guard
   that only lives in documentation is not a guard.

**Files:** `bench/baseline/mark.py`, `bench/baseline/README.md`,
`bench/baseline/tests/test_baseline_harness.py` (13 tests; the new one asserts the warning fires
and names the variable).

**Note:** the first t01 attempt was abandoned for this reason. It is a harness fault, not stock-app
data, and must be excluded from the report.

## 2026-08-08 10:25 EDT — Probe failed twice before running: module resolution, then a shadowed global

**Symptom 1:** `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright' imported from
/home/rmholston/dev/oh-gui/bench/baseline/ui/probe.mjs`, despite being invoked from `apps/gui`
where Playwright is installed.

**Root cause 1:** ESM resolves bare specifiers from the importing FILE's directory, not the cwd.
`bench/baseline/ui/` has no `node_modules`. Running from `apps/gui` changes nothing.

**Fix 1:** `createRequire(new URL("../../../apps/gui/package.json", import.meta.url))` and
`require("@playwright/test")`, resolving against the workspace that owns the dependency.

**Symptom 2:** `ReferenceError: Cannot access 'URL' before initialization` at the createRequire line.

**Root cause 2:** the script declared `const URL = <ingress>` further down. A `const` shadows the
global for the ENTIRE module scope, so the earlier `new URL(...)` hit the temporal dead zone. The
error points at the createRequire line while the actual defect is twenty lines below it.

**Fix 2:** renamed to `INGRESS`, which is what it always meant.

**Affected:** `bench/baseline/ui/probe.mjs` only. No app or port code.

**Note on method:** both defects were mine, and the first one reached the operator's terminal
because the script was shipped `node --check`-clean but never executed. Syntax checking proves
nothing about resolution or runtime scope. The fix was verified by running the probe against a
throwaway local page exercising every branch — inventory, the no-editable-field path, the
new-conversation click, working-dir detection, and the file writes — before asking the operator to
run it again.

**Second note:** while testing, `pkill -f "http.server 8791"` killed the tool shell itself
(exit 143). Same family as the pid 16688 incident already in this log: `pkill -f` matches the
command line of any process containing the string, including the one issuing the kill. Use a
recorded PID file instead, which is what the retest did.

## 2026-08-08 12:58 EDT — Conversation creation blocked by CORS: localhost vs 127.0.0.1

**Symptom:** `Access to fetch at 'http://127.0.0.1:8010/api/conversations' from origin
'http://localhost:8010' has been blocked by CORS policy: No 'Access-Control-Allow-Origin'` plus
`Failed to load resource: net::ERR_FAILED`. The probe sat on the say-hello onboarding slide for
265 s and then reported the onboarding screen's contents as if they were a conversation view.

**Root cause:** the page was loaded at `http://localhost:8010` while the frontend's own client
issues API calls to `http://127.0.0.1:8010`. Same host, same port, but `localhost` and `127.0.0.1`
are DIFFERENT ORIGINS to a browser, so every API call is cross-origin and the ingress does not
send an allow header for it.

**Fix:** load the app at `http://127.0.0.1:8010` so the page origin matches the origin its client
calls. Probe default changed; no app code touched.

**Affected:** `bench/baseline/ui/probe2.mjs`. Potentially also the manual harness — if the operator
browses to `localhost:8010` by hand they hit the same wall, and a manual baseline run would record
zeros for reasons that have nothing to do with the agent. Manual runs must use `127.0.0.1:8010`.
This is the second silent-zeros trap found in this harness, after the unset `VITE_WORKING_DIR`.

**Method note — a wrong conclusion was nearly recorded.** The probe's output line
`accept/approve vocabulary present in the UI: NONE` was, on its face, the answer to the question
stage 2 was built to answer, and it was WRONG: the run never reached a conversation view, so of
course an onboarding screen contains no accept buttons. Reported as a finding it would have been
used to amend mark.py and ADR-008 on the basis of a screen that was never under test. The
detector was sound; the precondition was not checked. Fix applied: the probe now checks for CORS
and ERR_FAILED errors BEFORE the wait loop, says outright that nothing below that point describes
a conversation view, and does not let a blocked API masquerade as a slow model for four minutes.
Generalisation: any detector that reports absence must first prove it was looking at the right
screen. Absence of evidence from the wrong page is not evidence of absence.

## 2026-08-08 13:02 EDT — Note on the limits of the local stand-in

Operator, on being shown a clean stand-in run: "this is why i always need to see what a test is
doing." Correct, and worth writing down rather than absorbing silently.

The stand-in page under `/tmp` was written by the same process that wrote the probe. It contains
the test ids the probe searches for, a planted "Accept changes" button, and a hardcoded fixture
path. Every detector "firing" therefore confirms that the probe matches my own expectations. It is
a mirror, not an oracle.

Worse, the specific fix it was run to verify — the `localhost` -> `127.0.0.1` origin change — is
the one thing the stand-in CANNOT verify. A static file server has no `/api/conversations` and
cannot produce a CORS failure. The clean run establishes only that the edit did not break the
script.

What the stand-in is legitimately good for, and did catch: crashes, ESM resolution, the temporal
dead zone bug, and steps that silently no-op. Mechanical faults.

Rule adopted: when reporting a stand-in run, state what it proves and what it does not, in the same
breath. A green result presented without its scope reads as stronger evidence than it is, which is
the same failure as the discarded `accept vocabulary: NONE` line earlier today — a true statement
about the wrong subject.

## 2026-08-08 13:08 EDT — VITE_WORKING_DIR is a PARENT dir: agent works in a per-conversation subdir

**Symptom:** agent-server log, during conversation creation:
`FileEditor initialized with cwd: /home/rmholston/.oh-gui/baseline/fixture/12e8256d4b6a4a5e8d9ec96a4f8e0950`
and the same path for `TerminalExecutor ... working_dir:`.

**Root cause:** `VITE_WORKING_DIR` is not the agent's working directory. It is the PARENT under
which the app creates one subdirectory per conversation, named by conversation id. The fixture
seeded at `~/.oh-gui/baseline/fixture` is therefore a sibling of the agent's cwd, not its contents.
The agent would open an empty directory.

**Consequence if unfixed:** every baseline task fails to find the fixture, produces no diffs, and
every line count records 0 — a self-consistent baseline of zeros caused entirely by harness setup.
This is the THIRD such trap in this harness, after the unset `VITE_WORKING_DIR` (10:15 EDT) and the
`localhost` vs `127.0.0.1` CORS block (12:58 EDT). Note that the earlier `VITE_WORKING_DIR` fix was
verified only by reading the vite process environ, which confirmed the variable was SET but proved
nothing about how the app INTERPRETS it. Verifying that a setting was applied is not the same as
verifying it means what you assumed.

**Found only because** the CORS failure forced a read of the agent-server log. Had the earlier run
succeeded, the run would have completed and produced zeros that looked like data.

**Fix:** NOT YET APPLIED — pending confirmation of whether the app copies fixture contents into the
per-conversation subdir or leaves it empty, and whether the subdir is created before or after the
agent starts. Do not guess; `ls` the directory.

**Status:** OPEN.

## 2026-08-08 13:09 EDT — POST /api/conversations 500, 'Server' object has no attribute 'list_tools'

**Symptom:** `{"detail":"Internal Server Error","exception":"'Server' object has no attribute
'list_tools'","error_id":"e8e3f1e84d724f80a85f61bcd8cfbf04"}` on conversation creation. Frontend
sits on the onboarding say-hello slide with no error surfaced to the user.

**What is established:** the failure is LATE in conversation setup. The log shows profile
activation, secrets, `TaskTrackerExecutor`, `FileEditor`, Chromium detection, `TmuxPanePool` and
`TerminalExecutor` all initializing successfully, and the exception immediately after. Everything
preceding MCP initialization succeeded.

**What is NOT established:** the traceback. `api.py:624` logs an error_id without a stack, and
uvicorn's `Exception in ASGI application` line at `h11_impl.py:421` is followed by nothing in
`~/.openhands/agent-canvas/logs/agent-canvas.2026-08-08.log`. Direct POST to the backend on 18000
returns `{"detail":"Unauthorized"}` — needs a session API key, so that path to the stack is closed.

**Versions:** running SDK/agent-server 1.40.1 (confirmed via `/server_info` on both 8010 and
18000). Latest SDK is 1.41.0 (2026-08-06), whose release notes are four Canvas Extensions PRs.
Frontend is Agent Canvas v1.12.0 (2026-08-07), which IS the latest release — checked at the
operator's suggestion; upstream is not ahead of our pin.

**Hypothesis, NOT a conclusion:** version skew between a v1.12.0 frontend and a 1.40.1 backend,
implicating ADR-008 decision 3 (use the app's own uvx-resolved backend rather than the pinned
ghcr agent-server v1.41.0 image). Competing explanation: an MCP server configured in the active
agent profile whose client object is the wrong type. These point at different fixes — pin the
image vs. disable MCP — so no change until the traceback or the profile contents discriminate.

## 2026-08-08 13:30 EDT — 500 on conversation create: agent-server 1.40.1 MCP list_tools

- **Symptom:** `POST /api/conversations` returned 500; agent-server logged
  `'Server' object has no attribute 'list_tools'`; UI stayed on onboarding with no conversation.
- **Stage/port:** Phase 0 baseline, reference Agent Canvas v1.12.0 dev stack.
- **Root cause:** bug in `openhands-agent-server` 1.40.1's MCP tool listing. v1.12.0 pins 1.40.1
  in `config/defaults.json`, so this is upstream's own shipped pairing, not local misconfiguration.
  Confirmed by the fix: on 1.41.0 the same code path logs `Processing request of type
  ListToolsRequest` -> `Created 21 MCP tools` and the conversation is created 201.
- **Fix:** launch with `OH_AGENT_SERVER_VERSION=1.41.0`, which pins agent-server, sdk, tools and
  workspace together (verified by reading `buildAgentServerCommand`, not assumed).
- **Wrong turns worth not repeating:** I first blamed version skew, which was backwards — the app
  was running exactly what it pins. I then discarded the MCP hypothesis because the agent profile
  had `mcp_server_refs: null`, but MCP is configured globally in
  `~/.openhands/settings.json -> agent_settings.mcp_config`, so the profile field proved nothing.
- **Files:** none in-repo; environment only.

## 2026-08-08 13:30 EDT — Serena MCP was indexing ~/dev/forge-oh during baseline runs

- **Symptom:** agent-server log showed `Starting language server typescript for
  /home/rmholston/dev/forge-oh` and `Workspace folders: ['/home/rmholston/dev/forge-oh']` while the
  conversation's working directory was the baseline fixture.
- **Root cause:** `~/.openhands/settings.json -> agent_settings.mcp_config.serena` is enabled
  globally with `--project /home/rmholston/dev/forge-oh`. Also `my-mcp` at `http://localhost:8080`.
- **Impact:** confound (21 extra tools, symbol index of an unrelated repo) and hazard (those tools
  can edit forge-oh).
- **Fix:** `bench/baseline/mcp_baseline.sh off` before baseline runs, `restore` after. Backs up
  settings.json first, since it is the operator's real shared config. Requires an app restart —
  `mcp_config` is read once at agent-server startup.

## 2026-08-08 13:30 EDT — Playwright click times out on an element that is present and visible

- **Symptom:** `locator.click: Timeout 30000ms exceeded` on `conversation-tab-files`; log says
  `element is visible, enabled and stable`, then alternates `element is outside of the viewport`
  and `<span data-aria-label="Show panel"> ... intercepts pointer events`.
- **Root cause:** the Files pane was ALREADY open (`files-tab` in the DOM). The tab control sits
  under the `right-panel-toggle` overlay and off-viewport, so the click could never land — and it
  was never needed.
- **Fix:** assert on the destination (`files-tab`), not the control. Only click the tab when the
  pane is absent, and bound the click with a short timeout plus a caught failure.
- **Rule:** when a click times out on an element Playwright reports as visible and stable, check
  whether the state it would produce already exists before fighting the overlay.

## 2026-08-08 13:33 EDT — Onboarding wizard reappears on every automated run

- **Symptom:** probe4 landed on `first-run-onboarding-screen` with 85 test ids immediately after
  probe3 had completed the wizard against the same app instance.
- **Root cause:** Agent Canvas stores onboarding completion **client-side**. Every Playwright
  context starts with empty localStorage, so every automated run is a first run. Nothing to do
  with the server, the profile, or the settings.json rewrite.
- **A guess of mine this corrects:** when probe3 unexpectedly hit onboarding I said the MCP toggle
  rewriting settings.json had probably reset the wizard. That was wrong, and it was a guess
  presented as a likely cause. The real reason is client-side state, which the very next run
  demonstrated.
- **Impact if unfixed:** all 16 baseline tasks would re-run the wizard, and its hello step spends
  a real model call each time — measurable pollution of both timing and VRAM state.
- **Fix:** `session.mjs` persists `storageState` to `~/.oh-gui/baseline/storage-state.json` after
  every run and reuses it on the next. `OH_GUI_FRESH_STATE=1` forces a clean profile.
  `ensureConfigured()` added as the single shared onboarding routine so probes and driver cannot
  drift apart.

## 2026-08-08 13:37 EDT — Fixture unreachable through the app's own workspace picker

- **Symptom:** the Add Workspace folder browser lists 36 sidebar shortcuts and every directory in
  `/home/rmholston`, but no dot-entries. `.oh-gui` appears nowhere on screen.
- **Confirmed by inventory, not inference:** the dialog's controls are `folder-browser-sidebar-*`,
  `folder-browser-entry-*`, `folder-browser-up`, `folder-browser-current-path`,
  `folder-browser-list`, `folder-browser-cancel`, `folder-browser-add-all-subdirs`,
  `folder-browser-use`. **Zero inputs inside the dialog** — it is navigation-only, so there is no
  typed-path escape hatch for a hidden directory.
- **Root cause:** the fixture was placed at `~/.oh-gui/baseline/fixture`, under the app's hidden
  state directory. Fine for a `VITE_WORKING_DIR` env var, unreachable for a picker that hides
  dotfiles.
- **Fix:** fixture moves to `~/oh-gui-baseline/fixture` — visible in `$HOME`, therefore selectable.
  The path is now `${OH_GUI_BASELINE_FIXTURE:-$HOME/oh-gui-baseline/fixture}` in shell and
  `process.env.OH_GUI_BASELINE_FIXTURE || ~/oh-gui-baseline/fixture` in JS, one override point
  instead of the literal baked into six files. Run artifacts stay under `~/.oh-gui/baseline/`;
  only the fixture the agent edits moves.
- **Still unverified, and it is the next thing to test:** whether selecting a workspace makes the
  conversation work *in* that directory, or still creates a per-conversation subdirectory beneath
  it as `VITE_WORKING_DIR` did. That difference decides how tasks get re-seeded between runs, so
  it gets a probe rather than an assumption.

## 2026-08-08 13:42 EDT — probe5 reported a control absent while the popover was shut

- **Symptom:** `PROBE5 FAILED: cannot launch into workspace`, with the popover's own controls
  (`add-workspaces-button`, `launch-no-workspace`) missing from the failure dump entirely.
- **Root cause: my probe, not the app.** After `folder-browser-use` the modal closed. The next
  line clicked `conversation-panel-new-thread-picker` to "reopen" the popover — but the popover
  was already closed, so the click **toggled it shut again**. Every absence reported afterwards
  was measured against the home screen.
- **This is the rule I had already written, applied only halfway.** After probe3 I adopted "any
  detector reporting absence must first prove it was looking at the right screen." I enforced it
  for screens and not for a popover's open/closed state. A toggle is not an opener.
- **Fix:** `openPicker()` checks the destination state — is a popover-only control present — and
  clicks only when genuinely closed, retrying up to three times and saying plainly when it cannot
  open, so nothing downstream is trusted.
- **Second fix:** ask the server whether the workspace registered instead of reading it off the
  UI, since the UI already misled me once here.
- **Still unknown, and NOT to be reported as a negative result:** whether `folder-browser-use`
  registered the fixture. The run does not answer that either way.

## 2026-08-08 13:58 EDT — t01 sat for six minutes with no LLM traffic, and the driver could not say why

- **Symptom:** `drive_task.mjs` printed `18.6s submitted t01` and then nothing. After ~6 min: GPU
  at 0% / 32 W with `qwen3.6:27b` resident (28 GB, `UNTIL Forever`), fixture untouched
  (`git status --porcelain` empty), no summary written.
- **App log:** only `GET /api/settings`, `GET /server_info` and
  `GET /api/conversations?ids=40a8a3b4-...` polling, every few seconds. **No run activity, no LLM
  traffic.** The conversation exists and is being polled; nothing is executing in it. The resident
  27b is consistent with a load for title generation followed by nothing.
- **Root cause: NOT YET ESTABLISHED.** Two candidates remain open — the submit never registered,
  or the run started and died silently. Recording this as unknown rather than picking one.
- **The real defect, which is mine:** the driver could not distinguish those two states. It polled
  for `agent-message` and idle status only, so an error or a dead run would have waited out the
  full 1800s and been reported as `timeout` — a symptom, labelled as a cause. It also printed
  nothing while polling, which is the same complaint the operator already made once.
- **Fixes applied:**
  - Assert the card actually landed in the chat input, and check the input cleared and a
    `user-message` bubble rendered after clicking submit. Distinguishes "never sent" directly.
  - Heartbeat every 15 s: status ids, whether `stop-button` is present, agent-message count.
  - Scan the screen for error text each second and abort with the error quoted.
  - Stall detector: 120 s with no new message and nothing running, abort rather than burn 30 min.
  - Dump url, relevant ids and the body tail on any non-completion.
  - `OH_GUI_KEEP_OPEN=1` holds the browser open 300 s on failure so the screen can be inspected.

## 2026-08-08 14:10 EDT — t01 completed and my driver called it a timeout (three false signals)

Run `20260808_1359_run`. The agent added the DELETE endpoint, wrote two tests, edited 3 files
(+18 lines) and finished with "Done". The driver recorded `outcome=timeout`, `tests=fail`. Every
one of those errors was mine.

**1. Conversation status ids are all present at all times.**
First heartbeat, 1 s in, before anything happened:
`conversation-status-active,conversation-status-error,conversation-status-check`.
`conversation-status-error` appeared in EVERY sample of a run that was working correctly. These
are rendered-but-hidden icons. Idle detection was built on `cur.includes(...)`, i.e. on presence.
**Presence is not state.** Fixed: `isVisible()` for both `stop-button` and each status icon, and
idle requires 8 consecutive not-running seconds so a gap between tool calls is not read as done.
*This is the "assert on the destination state, not the control" rule, broken again by me, in a
third place.*

**2. "Agent error" is a transient inline event, not a fatal one.** The agent hit one, recovered,
and completed the task. My error scan aborted the run and reported the symptom as the outcome.
Fixed: error text is COUNTED into `error_events_seen` and never terminates a run. Only idle and
the stall detector (now 180 s, and it distinguishes "never started" from "stalled after N
messages") end a run.

**3. `tests=fail` was fabricated.** pytest ran against system Python 3.14, which has no fastapi,
so it exited 2 on a collection ImportError — and my classifier treated any nonzero exit as the
agent's code failing. All 16 cells would have been stamped "tests failed" with the agent's code
fine. Fixed: `seed_fixture.sh` now builds a venv beside the fixture (not inside it — the agent
never sees it and `git clean -fdx` cannot delete it) with fastapi, pytest and httpx; exit codes
are distinguished (1=fail, 5=no-tests, 2/3/4=`harness-error`, missing venv=`no-venv`) so a broken
harness can never again be reported as a failing agent.

**4. Wrong model resident mid-cell — not my detector, a real ordering bug.** The sampler caught
`qwen3.6:35b-a3b-mtp-q4_K_M` resident 14:00:30-14:00:40 during a 27b cell, and the transcript
contains "Switched to profile qwen3.6-27b" INSIDE the conversation. `launch-workspace` creates the
conversation on whatever profile is already selected, so it was born on the 35b and its title
generation ran on the 35b before the switch landed. On a 2x8 matrix that corrupts VRAM state and
timings silently. Fixed: profile is selected on the home screen BEFORE the conversation is
created, then re-verified inside it.

**Genuinely measured this run (the harness was wrong, the agent was not):** 26.3s submit ->
61s first agent message -> 3 turns; 3 files, +18/-0. GPU peaked 66C, 0 samples >=80C, 0 thermal
throttling.

## 2026-08-08 15:10 EDT — First full matrix is INVALID. Five defects, four mine.

All 16 cells ran to `outcome=completed`; 15/16 `tests=pass`. None of it is usable as a baseline.

**1. The accept gate could not fail.** 27b/t04: `turns=1 files=0 +0/-0 tests=pass`. The agent did
nothing and passed, because the seeded fixture's own tests pass on untouched code. *A gate is not
trusted until proven to fail on a real defect* — I shipped one that cannot fail at all, and then
read 15 passes as signal. **Fixed:** `bench/baseline/verify/t01..t08.py`, one per task, testing the
requirement through the public surface; copied in after the agent stops and deleted after.
`tests/test_gates_fail_on_pristine.py` seeds a clean fixture and asserts every gate FAILS on it.
Proven in both directions before shipping: all 8 fail on pristine; t01 and t04 flip to pass when
implemented by hand. New field `accepted = gate passed AND no regression`; `tests=pass` alone is
now explicitly not acceptance.

**2. My fixture had a real bug that hijacked an uncontrolled subset of cells.** `store.py` defined
`def list(self) -> list[Note]`, binding `list` in the class namespace, so every LATER annotation
(`delete`, `search`) resolved `list` to the method: `TypeError: 'function' object is not
subscriptable`. 27b t02/t05/t08 and 35b t02 spent most of their turns diagnosing and repairing it
instead of the assigned task; 27b/t08 reported "Renamed to list_all()" as its accomplishment. Both
models hit it, so it is a fixture defect and not a model difference — but it contaminated an
uncontrolled subset, which is worse than contaminating all of them. **Fixed:** renamed to
`list_all()`.

**3. The gate and the agent ran different Pythons.** My venv is 3.14, where PEP 649 makes
annotations lazy, so the defect above is invisible; the agent's runtime is 3.12, which evaluates
eagerly and raises. That is why my own pytest run passed cleanly at t01 while the agent fought an
exception I could not reproduce. *Verifying in an environment the agent never sees is not
verification.* **Fixed:** `from __future__ import annotations` in the fixture makes it behave
identically on both, and `gate_python` is now recorded per cell so skew is visible instead of
inferred.

**4. A third model was in the loop on every cell.** `litellm.NotFoundError: model
'devstral-small-2:24b' not found` — `~/.openhands/profiles/default.json` points at devstral, which
was never pulled, and auxiliary machinery (title generation and friends) invokes it mid-run. This
is very likely the `Agent error` that appeared at 47-60s in nearly every cell. **Fixed:** the
driver repoints the default profile at the cell's own model for the duration and restores it on
exit (including via `process.on("exit")`).

**5. No reports were produced.** `report.py` crashed twice with
`sum(r["lines_accepted"]) -> int + NoneType`. I introduced null-not-zero in the driver and never
propagated it to the reporter, so the matrix ended with zero output. **Fixed:** null-safe sums, and
the report now states accepted-vs-total.

**Also mine:** the error detector matched any line containing "error", so it recorded the agent's
own prose ("Interesting - there's a TypeError in store.py") as error events. Narrowed to
machine-shaped failures.

**What the run DID establish, and is worth keeping:** the harness drives 16 cells unattended for
42 minutes without intervention; the profile is correct on every cell and no stray model loaded
after the ordering fix; thermals peaked 82C with 0 samples at the 83C ceiling and 0 throttling
across the whole matrix. The plumbing works. The measurement did not.

## 2026-08-08 15:14 EDT — ReferenceError in every cell, caught by pre-flight instead of by the matrix

Operator asked me to double-check before spending another 42 minutes. Found a defect that would
have thrown at the end of all 16 cells.

**Symptom (would have been):** `ReferenceError: gate is not defined` in the `finally` block of
drive_task.mjs, after each cell's agent run had already completed. Every cell would have run to
completion, cost its full wall time, and written no summary.

**Root cause:** my scripted edit inserted the gate block before `const rec = {`, but the variable
is `const summary = {`. Python `str.replace` on a non-matching pattern is a silent no-op, so the
block never landed — while a second replace that *references* `gate` and `gateDetail` matched and
did land. `node --check` passed because it validates SYNTAX, not resolution: an undefined
identifier is a runtime error, not a parse error. I had treated a clean `node --check` as
verification.

**Fix:** the grading logic is now `bench/baseline/ui/grade.mjs` — a module with no browser
dependency and a CLI entry point, so it can be executed directly against a fixture instead of only
through a 3-minute browser run. drive_task.mjs imports `gradeCell` and spreads its result. Verified
by running the grader for real against a seeded fixture, all five outcomes:

| scenario | fixture_tests | gate | accepted |
|---|---|---|---|
| pristine (agent did nothing) | pass | fail | false |
| task implemented correctly | pass | pass | **true** |
| task done, pre-existing test broken | fail | fail | false |
| venv missing | no-venv | no-venv | false |
| no gate for that task | pass | no-gate | false |

Also confirmed the gate leaves no residue — `git status` clean after grading.

**Second finding, same pass: the config mutation was not crash-safe.** The default-profile repoint
kept its backup in a JS variable restored on `process.on("exit")`. Ctrl-C during a 45-minute matrix
does not run exit handlers, so an interrupted run would have left the operator's default.json
rewritten with no record of the original. Now `ui/default_profile.mjs`: backup written to DISK
before the edit, restore bound to SIGINT/SIGTERM/SIGHUP/uncaughtException, and a stale backup found
at startup is restored first so a hard kill self-heals on the next run.

**Third: the report was going to be a page of dashes.** report.py's per-task table is built from
the item-5 human metrics, which are null by design on an automated run. It no longer crashed after
the null fix, but it also carried no information. Added a "What was actually measured" table
(accepted / gate / regression / turns / files / lines / timing / peak °C / errors), an explicit
call-out of any cell that changed zero files, and a check that all gates ran on one interpreter.

**Fourth: the error detector.** Tested the narrowed regex against 3 real failure lines from the
first matrix and 6 lines of ordinary agent prose containing the word "error". 3/3 caught, 0/6 false
positives.

**Prevention, so none of this depends on me looking:** `bench/baseline/preflight.sh` fails in
seconds on any condition that invalidated the last run — stale fixture seed still carrying
`def list`, missing `from __future__ import annotations`, venv missing deps, a task card with no
gate, missing profile, model not pulled, app not responding, node < 24, and the harness self-tests
failing. Verified it returns a real exit 1. New permanent tests: `tests/test_grade_module.py`
(6 tests, the table above) and `tests/test_report_nulls.py` (2). Suite is 31 passing, up from 13.

`run_matrix.sh` now writes each model block's report as soon as that block finishes, rather than
both at the end, and a failed cell no longer risks the remaining fifteen.

**Lesson, added to the standing list:** *a clean syntax check is not a clean reference check* — and
more generally, an automated edit that reports success only proves the tool ran, not that the
pattern matched.

## 2026-08-08 15:35 EDT — Nothing verified that the agent worked in the directory we grade

Operator ran preflight (PASS) and the app refused to start: ports already bound by a stack up for
two hours. Checking that stack turned up `VITE_WORKING_DIR=/home/rmholston/.oh-gui/baseline/fixture`
— a path that **does not exist** — while the harness grades `~/oh-gui-baseline/fixture`.

**Outcome: the last matrix DID grade the right directory.** `meta.json` for cell t01's conversation
records `workspace.working_dir = /home/rmholston/oh-gui-baseline/fixture`, and the agent's edits are
recorded against files beneath it. The app ignores `VITE_WORKING_DIR` and uses the workspace
registered in `~/.openhands/workspaces.json`, which contains exactly one entry: the graded fixture.
The five defects already logged stand; this is not a sixth.

**But nothing in the harness checked, and that is the defect.** The driver clicks `launch-workspace`
and inherits whatever workspace the app has configured. It matched by luck of prior configuration.
A wrong workspace and a model that does nothing are indistinguishable after the fact — both leave an
empty `git diff` — so all 16 cells would have reported zero accepted with no indication why.

**Fixed:** `ui/conversation_meta.mjs` reads `workspace.working_dir` from the conversation's own
meta.json immediately after creation and BEFORE the task card is submitted. Match → proceed.
Mismatch → the cell aborts with `WRONG WORKSPACE`, costing seconds instead of three minutes.
Unreadable → recorded as `workspace_verified: null` and called out in the log; **unknown is not a
pass**. Preflight additionally asserts the graded fixture is a registered workspace (verified both
ways against a synthetic workspaces.json).

**Two of my own detectors lied during this investigation, and both are the same mistake I have
already written a rule about.**
1. My probe printed `NO CONVERSATION DIR` for all 16 cells. The directory existed. I used a Python
   `for/else`, so a present file with an absent key fell through to the else branch and reported the
   directory missing. *Any detector reporting absence must first prove it was looking at the right
   screen* — I wrote that rule and then broke it in a throwaway loop.
2. I looked for `working_dir` at the top level of meta.json. It is nested under `workspace`. The
   conversation id is also dashed in the URL and undashed on disk, which made the first lookup miss
   entirely.

**Root-cause fix for the recurring ReferenceError class.** Adding the workspace check introduced an
undefined `ws`, exactly like `gate` earlier today — both in the finally block, both after the agent
work is complete and paid for, both invisible to `node --check`, which validates syntax only.
`apps/gui` already ships eslint; `ui/eslint.undef.config.mjs` runs `no-undef` over the harness and
`tests/test_no_undefined_identifiers.py` enforces it. It caught `ws` immediately.

Suite is 39 passing (was 31, was 13 this morning). New: `tests/test_workspace_check.py` (6),
`tests/test_no_undefined_identifiers.py` (2).

**Lesson:** *the harness must verify it is measuring the same thing the agent is acting on* — an
environment variable naming a directory is not evidence that anyone used it.

## 2026-08-08 15:44 EDT — The default-profile fix was never called; matrix run 2 killed at t02

Run 2 started clean: preflight PASS, `workspace confirmed: /home/rmholston/oh-gui-baseline/fixture`
on t01, ACCEPTED=yes, peak 73C. But the `default profile: ... -> ...` line never printed, and t01
logged the same non-fatal `Agent error` at 55s as run 1. Killed at t02, two minutes in.

**Cause:** `pointAtModel` was imported into `drive_task.mjs` and **never invoked**. The scripted
edit that was supposed to insert the call anchored on `await ensureConfigured(page);` while the real
call is `ensureConfigured(page, say, shot)`. `str.replace` on a miss is a silent no-op, so the call
never landed. A later edit removing the older `pointDefaultAtCellModel()` line also matched nothing,
which is why grepping for that name came back empty and I read it as "old code fully removed" when
the truth was "neither edit applied".

**Third instance of one bug today** — `gate`, `ws`, now `pointAtModel` — all from anchoring an
automated edit on text I had not re-read, all invisible to `node --check`. `no-undef` caught the
second; it cannot see an import that is merely unused.

**Fixed:**
- The call is in, before conversation creation (the app reads the default profile for title
  generation the moment the first message lands). Anchor asserted to match exactly once before
  editing — a no-op replace now raises instead of passing quietly.
- `no-unused-vars` added to the eslint gate. It found three more dead imports and, at line 166, an
  `await ids(page)` doing a full DOM scan every second whose result was discarded: 1800 wasted
  round-trips per cell, ~29k across a matrix. Removed.
- Removing it, I also cut `ids` from the import while it was still used twice elsewhere. The gate
  failed on the spot. It is working.

Lint clean, 39 tests passing.

**Lesson:** *an automated edit that reports success only proves the tool ran.* Every scripted edit
now asserts its anchor matches exactly once, and the harness lints for unused imports because
dead-but-present code reads exactly like working code in a diff.

## 2026-08-08 15:56 EDT — The recurring "Agent error" is real, and it is the model

Every cell of matrix 3 logs an `Agent error` ~36s after submit. The profile swap is confirmed
working (`openai/devstral-small-2:24b -> ollama_chat/qwen3.6:27b`, and `-error` has left the status
banner), so this was never devstral. The conversation event log gives the actual text:

    "error": "Error validating tool 'file_editor': Extra data: line 1 column 88 (char 87).
              Arguments: unparseable JSON"
    "classification": {"kind":"agent_action","retryable":true,"user_action":"retry"}

Qwen3.6 emitting malformed tool-call JSON through Ollama. Retryable; the agent recovers. Present on
10 of 11 conversations touched in the last 25 minutes, 1-5 occurrences each.

**This is data, not noise.** It is a property of the model on this runtime, which is precisely what
the baseline exists to measure. It also explains t01 differing between runs — 4 turns/+19/accepted
versus 2 turns/+17/tests fail on identical inputs. Retries consume turns and can end a run early, so
turn counts and timings carry this cost and the report must say so.

**Method note.** I asserted "the app didn't error, my detector did" off a diagnostic that had run
`ls -dt | head -1` — whichever conversation was newest at that second, not the one that logged the
error, and possibly one with no error yet. Wrong sample, confident conclusion. Withdrawn within the
minute, but it should not have been said. *A detector that reads the rendered page is reading the
author's summary of the run, not the run;* the event log is the record.

**Added:** `conversation_errors.py` harvests `AgentErrorEvent` counts per cell from the event log,
split retryable/fatal and grouped by tool, with three sample messages. Harvest happens at REPORT
time keyed by the conversation id each cell already records, so it applies retroactively to the run
now in flight — no interruption needed. Unreadable record yields `?`, never 0; a readable record
with no errors yields 0. `report.py` gains a `Tool errs` column and a caveat paragraph. 7 new tests,
suite at 46.

## 2026-08-08 16:32 EDT — Tool-error column read "?" on every cell: cid read from the wrong nesting level

**Symptom.** `compare_blocks.py` printed `?` in the Tool errors column for both blocks. Probing a
real summary: `s.get('conversation_id')` -> `None`.

**Affected.** Phase 0 item 3 — `bench/baseline/report.py`, `bench/baseline/compare_blocks.py`.

**Root cause.** The driver DOES record it, at `automated.conversation_id` (`drive_task.mjs`, inside
the `automated:` block). Both readers looked for it at the top level of the summary. The harvester
never received a cid on any real cell, so the feature shipped in e22f51d has never once worked.

Its unit tests passed throughout because they call `harvest(cid)` with a cid supplied directly —
they exercised everything except the one step that was broken, which was FINDING the cid.

This is the identical defect shape as the meta.json bug earlier today: `working_dir` is nested under
`workspace`, not top-level, and I read it top-level. Second time in one session.

**Fix.** Both readers now read `automated.conversation_id` with a top-level fallback.
`tests/test_summary_cid_wiring.py` (4) drives `report.py` and `compare_blocks.py` end to end over a
summary shaped the way the driver actually writes one, plus a source assertion that fails if the
driver ever moves the field. A missing cid must still render `?`, never `0` — absence of a count is
not a count of zero.

**Files.** `bench/baseline/report.py`, `bench/baseline/compare_blocks.py`,
`bench/baseline/tests/test_summary_cid_wiring.py`.

**Rule.** A unit test that hands the code the value it failed to find is not a test of the wiring.
Any accessor reading a nested field must be exercised against a realistically shaped record.


## 2026-08-08 18:35 EDT — Two Docker daemons on Colossus: unstoppable containers, a hidden 16-hour restart loop, and a false axiom-worker health failure

**Symptom.** Three distinct behaviours, all on the OH-GUI dev host, initially treated as unrelated:

1. `docker stop <name>` returned `Error response from daemon: cannot stop container: <name>: permission denied`
   for ten containers, even under `sudo`. Kernel log: `apparmor="DENIED" operation="signal"
   profile="docker-default" comm="dockerd" requested_mask="receive" peer="snap.docker.dockerd"`.
2. A uvicorn process bound to `--port 5055` respawned every ~2 s for 16 hours at ~200% CPU. Its
   cgroup mapped to `~/open-notebook-local`. Killing its supervisord parent (PID 6324) changed
   nothing; the process kept reappearing with a new parent.
3. `axiom-worker` reported `(unhealthy)`; its Redis check timed out container-to-container while
   `axiom-redis` answered PONG from the host and all three containers shared `axiom_default` with
   working DNS.

**Affected.** Colossus host environment (OH-GUI dev machine). No OH-GUI source involved.

**Root cause.** Two Docker daemons were running:

- PID 3529 — snap dockerd, `--data-root=/var/snap/docker/common/var-lib-docker`, `--exec-root=/run/snap.docker`
- PID 4715 — apt dockerd, `-H fd://`, `--containerd=/run/containerd/containerd.sock`, default data-root `/var/lib/docker`

`/var/run` is a symlink to `/run`, so both daemons bound the same socket path. The snap daemon's
bind **replaced the apt daemon's socket file**. The apt daemon kept its original inode open and
kept serving its ten containers, but no CLI could dial it — every `docker -H unix://...` variant
resolved to the snap daemon (`docker info` reported the snap data-root for all three candidate
paths). `ctr -a /run/containerd/containerd.sock -n moby containers ls` listed the ten hidden
containers and confirmed the split.

That single fault produced all three symptoms:

1. Containers created under one daemon's AppArmor context, signalled by the other → cross-profile
   denial.
2. The 5055 loop was **dockerd 4715 honouring a restart policy** on the open-notebook container.
   Supervisord was never the restarter; killing it was irrelevant. `docker ps` could not show the
   container because it belonged to the invisible daemon.
3. Two daemons managing iptables/bridge rules on the same host corrupted container-to-container
   routing on `axiom_default`.

**Fix applied.**

- `sudo systemctl disable --now docker.service docker.socket`, then `sudo systemctl mask
  docker.service docker.socket` so socket activation cannot resurrect it at boot. Snap daemon
  (3529) is now the only daemon.
- The 5055 loop stopped immediately. `axiom-worker` went `unhealthy` → `healthy` the moment the
  second daemon stopped, confirming cause 3.
- The AppArmor denial **survived** the fix — the `docker-default` profile is shipped by the apt
  docker package and outlives its daemon. Worked around without signalling through Docker:
  `docker update --restart=no <containers>` (metadata only, not blocked), then `sudo kill -TERM`
  against each container's `State.Pid` from unconfined root. All ten stopped.
- Result: load average 3.29 → 0.83; two Kosmos containers left running.

**Three predictions I made that were wrong, recorded because each was stated with more confidence
than the evidence supported:**

1. Called the `axiom-worker` health failure "likely a false alarm." It was a real failure with a
   real cause.
2. Predicted disabling the apt daemon would clear the AppArmor denial. It did not; the profile is
   package-shipped, not daemon-scoped.
3. Predicted it would fix `kosmos-dozerdb`. It did not — that container exits 3 on startup for
   unrelated reasons and is now a separate open issue.

**Consequence for the Forge-OH port.** `forge-oh-bff:latest` and Forge-OH's SearXNG image live in
`/var/lib/docker`, under the masked daemon. Reading donor source is unaffected; **running** the
Forge-OH stack for behavioural comparison now requires unmasking the apt daemon or rebuilding under
the snap daemon. Recorded in `docs/forge-oh-port-survey.md`.

**Files changed.** None in this repo — host configuration only.

**Related BUILD_LOG entry:** 2026-08-08 18:35 EDT

## 2026-08-08 19:40 EDT — Half the apt container stack was still running after the 18:35 daemon fix

- **Symptom:** `/var/lib/containerd` measured 94 GB on a host believed to have had its apt Docker
  stack fully disabled. `systemctl is-active containerd.service` returned `active`, `is-enabled`
  returned `enabled`, and `lsof +D` showed pid 2835 `/usr/bin/containerd` holding
  `io.containerd.metadata.v1.bolt/meta.db` and the overlayfs `metadata.db` open for write.
- **Affected stage / plugin / port:** Phase 0 · host / Docker · no port
- **Root cause:** The 2026-08-08 18:35 fix masked `docker.service` and `docker.socket` only.
  `containerd.service` is a **separate unit from the `containerd.io` package** and was left enabled,
  so the apt dockerd's containerd kept running and kept its 94 GB of snapshots and content live.
  Masking a daemon does not mask its runtime.
- **Fix applied:** `systemctl disable --now containerd.service` + `systemctl mask
  containerd.service`, then `rm -rf /var/lib/containerd`. Verified idle first: 0 containers and
  0 tasks in both the `moby` and `moby_history` namespaces via
  `ctr -a /run/containerd/containerd.sock`, and both live `containerd-shim` processes proved to
  belong to snap (cmdline contains `snap.docker`). Snap runs its own containerd (pid 3700,
  `--config /run/snap.docker/containerd/containerd.toml`) and has no `containerd` key in its
  `daemon.json`, so it never referenced `/var/lib/containerd`.
- **Two tooling defects found and fixed while writing the survey, worth not repeating:**
  1. `pgrep -af dockerd` **self-matches a pasted script**, because the pasting shell's own command
     line contains the string `dockerd`. A guard written that way aborts unconditionally. Proven in
     the sandbox: old form matched 2 phantom processes, `pgrep -x dockerd` matched 0. Use `-x`
     (exact process name) and read `/proc/<pid>/cmdline` to classify snap vs apt.
  2. `sudo du -sh /var/lib/containerd/*` prints **nothing** for a root-only directory: the glob is
     expanded by the unprivileged shell before `sudo` runs, fails to match, and the literal `*` error
     goes to the suppressed stderr. The empty output reads as "directory is empty" when it holds
     94 GB. Use `sudo sh -c 'du -sh /var/lib/containerd/*'` so the glob expands as root.
  3. `exit 1` inside a `while` loop fed by a pipeline runs in a subshell and does not abort the
     script. Use `mapfile -t` plus a `for` loop when a loop body must be able to abort.
- **Guard verification:** the abort path was proven against a real defect rather than assumed — a
  process named exactly `dockerd` with a non-snap cmdline was started in the sandbox, the guard
  aborted with exit 1, and passed once it was killed.
- **Files changed:** none in this repo — host configuration only.
- **Related BUILD_LOG entry:** 2026-08-08 19:40 EDT

## 2026-08-08 20:05 EDT — Trust-dial mirror let an out-of-worktree write proceed when confirm_unknown was off

- **Symptom:** No runtime error; a silent semantic divergence found by reading the SDK against the
  code. In `apps/gui/src/features/first-run/trust-dial.ts`, `shouldConfirm('ask-outside-worktree',
  { risk: 'UNKNOWN', writesOutsideWorktree: true }, { threshold: 'HIGH', confirmUnknown: false })`
  returned `false` ("Proceeds"). Native OpenHands pauses that action. The wizard's decision table
  would have told the operator an unclassifiable write landing outside the worktree proceeds, on
  the one stop whose entire purpose is to catch out-of-worktree writes.
- **Affected stage / plugin / port:** Phase 0 · first-run wizard · trust-dial display mirror
  (ADR-015 native-fidelity boundary)
- **Root cause:** The elevation was guarded by `action.risk !== 'UNKNOWN'`:
  `const elevated = action.writesOutsideWorktree && action.risk !== 'UNKNOWN' ? 'HIGH' : action.risk`.
  That guard has no counterpart in the SDK. Verified in
  `openhands/sdk/security/ensemble.py` at 1.41.0: `EnsembleSecurityAnalyzer.security_risk()`
  collects each child's assessment and, at the default `propagate_unknown=False`, computes
  `concrete = [r for r in results if r != UNKNOWN]` then `return max(concrete)`. The worktree
  analyzer contributes a concrete HIGH, so UNKNOWN is **filtered out and never reaches the
  policy** — `confirm_unknown` is not consulted at all. `ConfirmRisky.should_confirm(HIGH)` then
  returns True because `SecurityRisk.is_riskier` is reflexive (`risk.py`, `reflexive: bool = True`).
- **Why the gate missed it:** every existing assertion used `DEFAULT_CONFIRM_RISKY`
  (`confirmUnknown: true`), and at that value both spellings pause. The two implementations are
  observationally identical across the entire default-parameter surface. The "strictly stricter
  than ask-risky" property test also swept risks at default params only, so a property test that
  looked exhaustive was exhaustive on the wrong axis.
- **Fix applied:** elevation is now unconditional —
  `const elevated = action.writesOutsideWorktree ? 'HIGH' : action.risk` — with the ensemble
  filtering rule cited inline so the next reader does not "restore" the guard.
- **Verification (executed, not assumed):** the two new tests were run against the **old**
  predicate first and observed to fail (`2 failed | 14 passed`), then against the fixed predicate
  and observed to pass (27/27). The parameter sweep alone did **not** catch the bug; the explicit
  native-semantics assertions did. Both were kept.
- **Files changed:**
  - `apps/gui/src/features/first-run/trust-dial.ts`
  - `apps/gui/src/__tests__/trust-dial.test.ts`
- **Related BUILD_LOG entry:** 2026-08-08 20:05 EDT

## 2026-08-08 20:22 EDT — End-to-end test passed with the bounds clamp deleted

- **Symptom:** Deleting `Math.min(STEPS.length - 1, n + 1)` from the wizard's Next handler left the
  Playwright suite fully green. A button-mashing test written to cover exactly that case could not
  distinguish the mutant from the original.
- **Affected stage / plugin / port:** Phase 0 · first-run wizard · no port
- **Root cause:** Two redundant defenses guard the step bounds — the `disabled` attribute on the
  nav buttons, and the clamp inside the click handlers. `disabled` fires first and swallows the
  click, so the handler never runs at the boundary and the clamp is unreachable from the DOM.
  Confirmed the handler stays unreachable even after setting `el.disabled = false` and clicking,
  both via Playwright `click({ force: true })` and an in-page `el.click()`; the counter did not
  advance past 5 with the clamp removed. A UI-level test therefore cannot cover the clamp at all.
- **Fix applied:** Extracted the clamp to `clampStep(next, count)` in `wizard-nav.ts`, unit-tested
  it exhaustively over -20..40, and deleted the E2E test that proved nothing. Re-ran three
  mutations (upper clamp, lower clamp, off-by-one) — all three now fail.
- **Files changed:** `apps/gui/src/features/first-run/wizard-nav.ts`, `FirstRunWizard.tsx`,
  `apps/gui/src/__tests__/wizard-nav.test.ts`, `apps/gui/e2e/walkthrough.spec.ts`
- **Related BUILD_LOG entry:** 2026-08-08 20:22 EDT
