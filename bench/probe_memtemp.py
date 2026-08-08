#!/usr/bin/env python3
"""Probe whether this GPU exposes a VRAM temperature through NVML field values.

`nvidia-smi -q -d TEMPERATURE` reports `Memory Current Temp: N/A` on driver 610.57.04,
and LACT shows no VRAM sensor either. But nvidia-smi only prints a curated subset of
NVML; the field-value API (`nvmlDeviceGetFieldValues`) sometimes returns memory
temperature on cards where the summary query does not.

This matters because published RTX 5090 measurements put memory 15-20 C ABOVE core under
load - TechPowerUp measured 77 C core / 94 C memory on the FE - and LLM inference
saturates memory bandwidth continuously. Every thermal decision in this repo so far rests
on the core sensor alone.

Uses ctypes against libnvidia-ml.so.1 directly: no pip, no venv, no PEP 668.

  python3 bench/probe_memtemp.py
"""
import ctypes
import sys

# From nvml.h. Only the temperature-adjacent fields are probed.
FIELDS = {
    82:  "NVML_FI_DEV_MEMORY_TEMP",
    83:  "NVML_FI_DEV_TOTAL_ENERGY_CONSUMPTION (sanity check - should work)",
}

VALUE_TYPES = {0: "double", 1: "uint", 2: "ulong", 3: "ulonglong", 4: "slonglong"}


class Value(ctypes.Union):
    _fields_ = [("dVal", ctypes.c_double), ("uiVal", ctypes.c_uint),
                ("ulVal", ctypes.c_ulong), ("ullVal", ctypes.c_ulonglong),
                ("sllVal", ctypes.c_longlong)]


class FieldValue(ctypes.Structure):
    _fields_ = [("fieldId", ctypes.c_uint), ("scopeId", ctypes.c_uint),
                ("timestamp", ctypes.c_longlong), ("latencyUsec", ctypes.c_longlong),
                ("valueType", ctypes.c_uint), ("nvmlReturn", ctypes.c_uint),
                ("value", Value)]


def main() -> int:
    try:
        nvml = ctypes.CDLL("libnvidia-ml.so.1")
    except OSError as e:
        print(f"cannot load NVML: {e}")
        return 1

    if nvml.nvmlInit_v2() != 0:
        print("nvmlInit failed")
        return 1

    handle = ctypes.c_void_p()
    if nvml.nvmlDeviceGetHandleByIndex_v2(0, ctypes.byref(handle)) != 0:
        print("cannot get device handle")
        return 1

    print(f"{'field':60s} {'ret':>4s}  value")
    found = False
    for fid, name in FIELDS.items():
        fv = FieldValue()
        fv.fieldId = fid
        fv.scopeId = 0
        nvml.nvmlDeviceGetFieldValues(handle, 1, ctypes.byref(fv))
        ret = fv.nvmlReturn
        if ret != 0:
            # 3 = NVML_ERROR_NOT_SUPPORTED, 999 = unknown
            print(f"{name:60s} {ret:4d}  NOT SUPPORTED")
            continue
        vt = fv.valueType
        raw = {0: fv.value.dVal, 1: fv.value.uiVal, 2: fv.value.ulVal,
               3: fv.value.ullVal, 4: fv.value.sllVal}.get(vt)
        print(f"{name:60s} {ret:4d}  {raw}  ({VALUE_TYPES.get(vt, vt)})")
        if fid == 82:
            found = True

    print()
    if found:
        print("RESULT: memory temperature IS available. Wire it into bench/lib/gpu.sh.")
    else:
        print("RESULT: memory temperature is NOT exposed by this driver.")
        print("  VRAM thermals cannot be monitored on this host. Record the gap; do not")
        print("  claim thermal headroom on the basis of the core sensor alone.")
    nvml.nvmlShutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
