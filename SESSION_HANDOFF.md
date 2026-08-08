# Session Handoff

**Updated:** 2026-08-08 09:30 EDT
**Stage:** Phase 0 / R1 - quality bench (Path E). Blocks Phase 0 exit.

## State: ready to run the bench

All instrumentation questions are closed. The harness is written and statically validated
but has never been executed against a model.

## Completed this session

- **LACT NVML fixed** - a Flatpak unit at `/etc/systemd/system/lactd.service` was shadowing
  the deb unit and could not see host NVIDIA libraries. Disabled and renamed `.flatpak.bak`.
- **435 W ratified** with a throttle-free run: 71 C peak, 0 s above warn. 600 W rejected
  (81-82 C, thermal throttling) for ~13% prefill.
- **LACT owns the power cap** via `power_cap: 435.0` in `/etc/lact/config.yaml`. Survives
  reboot. Do NOT also set it with `gpu_pin.sh` - one owner per setting.
- **Fan telemetry is a dead instrument on this card.** Operator confirmed visually that the
  fans spin; driver 610.57.04 does not expose the tachometer, so every readout says 0%.
  Never build a guard on `fan_pct`. My earlier "LACT seized the fans" diagnosis was wrong
  and is retracted in DEBUG_LOG 08:35.
- **Flash attention: confirmed no-op** on VRAM, prefill and decode, across three runs.
- **Hotspot: record-only**, measured within +/-1 C of the edge sensor.
- **ADR-004 Amendment #5** - production context ceiling is 131,072, not 262,144.
- **ADR-005 filed OPEN** with criteria and falsifier fixed before results exist.
- **Written:** `bench/path_e/{bench_path_e.py,run_path_e.sh,dump_for_scoring.sh}`.
- **Cold-start gate** (`gpu_cool_wait`, `GPU_COLD_C=45`) - 45 C balances the cooldown wait
  actually reaches between cells with the desktop running; cells wait for it instead
  of a guessed `sleep 20`.
  Prevents matrix ordering from becoming a confound in its own results.

## Remaining before Definition of Done

1. Run the matrix: `bash bench/path_e/run_path_e.sh` (~7 cells).
2. `bash bench/path_e/dump_for_scoring.sh <run_dir>`, paste the dump back for scoring
   against `bench/gold/{debug,arch,plan}.md`.
3. Fill in ADR-005 Decision / Rationale / Consequences; flip status to Ratified.
4. Remaining Phase 0 exit items: upstream artifact pins, read-only stock Agent Canvas
   checkout, first-run wizard stating the `ConfirmRisky()` trust-dial stop.

## Open question awaiting the operator

None blocking. ADR-004 A#3 reopened the planner comparison (27b vs 35b); the Path E matrix
answers it empirically, so no separate decision is needed first.

## Exact next action

```bash
cd ~/dev/oh-gui && git pull && bash bench/path_e/run_path_e.sh
```

Re-apply nothing first - LACT sets the 435 W cap on boot. The driver verifies it and
refuses to start if the cap is not exactly 435 W.
