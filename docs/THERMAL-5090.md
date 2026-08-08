# RTX 5090 Thermal Reference (Colossus)

Researched 2026-08-08. Governs `bench/lib/gpu.sh` thresholds and any future telemetry
adapter work (`docs/specs/08-telemetry.md`).

Card: ASUS RTX 5090, PCI id `10DE:2B85-1043:89E3-0000:01:00.0`, driver 610.57.04,
435 W cap owned by LACT.

## Sensor availability on THIS host — measured, not assumed

| Sensor | Exposed? | How verified |
|---|---|---|
| GPU core (edge) | **Yes** | `nvidia-smi --query-gpu=temperature.gpu`, `lact cli stats` |
| GPU hotspot / junction | **No** — reading is a duplicate of core | See below |
| VRAM / memory temperature | **No** | `nvidia-smi -q -d TEMPERATURE` → `Memory Current Temp: N/A`; NVML field 82 → `NVML_ERROR_NOT_SUPPORTED` (`bench/probe_memtemp.py`) |
| Fan RPM / duty | **No** | Reports 0%/0 RPM while fans are visibly spinning; tachometer not exposed via NVML |

Only **one** of the four thermal signals on this card is real. Two are absent and one is
a duplicate. No guard may be built on hotspot, VRAM temp, or fan speed.

### Hotspot is not a sensor on RTX 50

NVIDIA removed the hotspot sensor from GeForce RTX 50 cards; tools that still show a
"hotspot" are echoing the core temperature
([LibreHardwareMonitor #1686](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/issues/1686)).
Our own measurements corroborate this independently: LACT reported hotspot within ±1 C of
edge on every sample across every run, including 48 C / 48 C at idle.

This **corrects the stated reason** for the record-only hotspot decision in
`adrs/README.md`. The decision stands; the original justification ("no hidden margin")
implied a working sensor that found nothing. The truth is there is no sensor.

### VRAM temperature is unobservable — and is the sensor we most want

Published RTX 5090 measurements put memory well above core under load. TechPowerUp's
review table shows memory hotter than core on every 5090 variant tested, with the
Founders Edition at **77 C core / 94 C memory**
([TechPowerUp](https://www.techpowerup.com/review/nvidia-geforce-rtx-5090-founders-edition/41.html)).
Owners report 90–95 C VRAM as typical, with one card at 100 C before fans ramped
([r/nvidia GDDR7 temps](https://www.reddit.com/r/nvidia/comments/1l2iec4/gddr7_rtx_50xx_memory_temps_safe_limits/)).
GDDR7 maximum is cited at ~105 C
([GGFix limits table](https://ggfix.dk/blog/nvidia-rtx-temperature-limits-by-model)).

LLM inference saturates memory bandwidth continuously — decode is memory-bound by
definition — so this workload plausibly stresses VRAM harder than gaming does, which is
the load those figures come from.

**Standing caveat:** a run reporting "77 C peak, 0 throttled" describes the core only.
It is not evidence of VRAM headroom. Do not describe the card as thermally comfortable
on the strength of the core sensor alone.

## Core temperature limits

| Value | Figure | Source |
|---|---|---|
| NVIDIA thermal setpoint (boost ceiling) | 83 C | [GGFix](https://ggfix.dk/blog/nvidia-rtx-temperature-limits-by-model) |
| Core max / throttle | ~90 C | Same; **confirmed on this card**: `GPU Current Temp 48` + `T.Limit 42` ⇒ limit 90 C |
| Vendor-published max operating temp | 88 C | [RTX 5090 specifications](https://swifttechy.in/wiki/nvidia-geforce-rtx-5090-specifications) |

Below 83 C the card boosts freely; above it the fan curve ramps hard and throttling
begins as temperature climbs further. Our `GPU_MAX_C=83` abort therefore sits exactly at
the boundary where the card stops boosting — the right place for a benchmark guard,
since past that point timings stop being comparable.

## Power limit vs performance

An RTX 5090 compute benchmark run headless under LACT measured 600 W → 36 s,
475 W → 42 s (−16.7%), 400 W → 48 s (−33.3%)
([r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/comments/1tolp1m/small_comparison_on_full_compute_performance/)).
Multiple undervolt reports place the efficiency knee at 400–450 W, with gains above that
described as marginal ([r/nvidia FE undervolt](https://www.reddit.com/r/nvidia/comments/1isi8ir/rtx_5090_fe_undervolt_results/)).

Our own measurements at 435 W vs 600 W are consistent and show why the penalty is smaller
for us than for that diffusion workload:

| Metric | 600 W | 435 W | Delta |
|---|---:|---:|---:|
| Prefill (compute-bound) | ~3300 tok/s | ~2900 tok/s | −12% |
| Decode (memory-bound) | 69.6 tok/s | 68.2 tok/s | −2% |
| Peak core | 81 C | 71 C | −10 C |
| Throttled samples | 1 | 0 | — |

Decode barely moves because it is bandwidth-limited, not compute-limited. 435 W is
ratified.

## Fan control

The BIOS/automatic curve is working — it held 77 C peak with zero throttled samples
across the full matrix at 435 W. **Do not raise fan aggression at this time.** With no
fan tachometer and no VRAM sensor, tuning the curve means adjusting an unmeasurable input
against an unmeasurable output, judged only by a core temperature that already has 6 C of
margin to the guard.

Conditions that would justify revisiting: a run reports throttled samples, core peak
exceeds 80 C, or a future driver exposes VRAM temperature and it reads above 90 C under
sustained load. Ambient/case airflow is the higher-leverage lever if cooling is ever
needed, since it lowers the whole curve rather than trading noise for a few degrees.

## Idle floor caveat

Measured idle at 06:02 EDT: **48 C** core, 23 W, 683 MiB VRAM. TechPowerUp lists 5090
idle temperatures of 35–51 C depending on cooler. If the sustained idle floor on this
host sits near 48 C, a `GPU_COLD_C` target below it can never be met and each cell will
burn the full `GPU_COOL_TIMEOUT_S` before continuing. Verify the true floor before
tightening the cold-start gate.

## Current thresholds (`bench/lib/gpu.sh`)

| Constant | Value | Basis |
|---|---:|---|
| `GPU_REDLINE_C` | 88 | Vendor max operating temp; documentation only |
| `GPU_MAX_C` | 83 | NVIDIA boost setpoint; hard abort + unload |
| `GPU_WARN_C` | 80 | Report-only |
| `GPU_COLD_C` | 45 | Comparability backstop, not a true equaliser — see idle floor caveat |
| `GPU_START_C` | 80 | Refuse to begin above this |
| `GPU_MAX_HOTSPOT_C` | unset | No hotspot sensor exists on RTX 50 |
| VRAM temp guard | none possible | Not exposed by driver 610.57.04 |
