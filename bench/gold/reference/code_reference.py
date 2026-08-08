"""Reference solution for the `code` bench task."""
from __future__ import annotations

_BLOCK_HEADERS = ("Clocks Event Reasons", "Clocks Throttle Reasons")
_TRUE = {"Active"}
_FALSE = {"Not Active", "N/A"}


def parse_perf_flags(text: str) -> dict[str, bool]:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    header_idx: int | None = None
    header_indent = 0
    for i, line in enumerate(lines):
        if ":" in line:
            continue
        if line.strip() in _BLOCK_HEADERS:
            header_idx = i
            header_indent = len(line) - len(line.lstrip())
            break
    if header_idx is None:
        return {}

    out: dict[str, bool] = {}
    for line in lines[header_idx + 1:]:
        if not line.strip():
            continue
        if len(line) - len(line.lstrip()) <= header_indent:
            break
        if ":" not in line:
            continue
        label, _, value = line.partition(":")
        key = "_".join(label.split()).lower()
        v = value.strip()
        if v in _TRUE:
            out[key] = True
        elif v in _FALSE:
            out[key] = False
        else:
            raise ValueError(f"unparseable clock event reason value: {v!r} for {key!r}")
    return out


def decode_flag(field: str | None) -> tuple[bool, bool]:
    if field is None:
        return (False, False)
    f = field.strip()
    if not f:
        return (False, False)
    f = (f + "00")[:2]
    for ch in f:
        if ch not in ("0", "1"):
            raise ValueError(f"bad pcap_thermal field: {field!r}")
    return (f[0] == "1", f[1] == "1")
