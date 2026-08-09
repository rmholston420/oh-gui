#!/usr/bin/env python3
"""Fail if any recorded timestamp is in the future, or carries the wrong UTC offset label.

Motivation: DEBUG_LOG.md 2026-08-09 03:12 EDT recorded ten timestamps written in UTC but
suffixed `EDT`, which put them up to 4 hours in the future and sorted two entries after work
that actually preceded them. Nothing checked for it. This does.

Two independent checks, because they fail differently:
  1. FUTURE  - a timestamp later than now. Always an error; a log records what happened.
  2. OFFSET  - the zone suffix disagrees with America/Detroit's actual offset on that date.
               EDT runs Mar->Nov; EST runs Nov->Mar. Writing `EDT` on a January date is the
               same class of mistake as writing UTC and labelling it EDT.
"""

from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

DETROIT = ZoneInfo("America/Detroit")
ROOT = Path(__file__).resolve().parent.parent

SCAN = [
    "BUILD_LOG.md",
    "DEBUG_LOG.md",
    "KNOWN_ISSUES.md",
    "SESSION_HANDOFF.md",
    "PORTING_LEDGER.md",
]
SCAN_GLOBS = ["adrs/*.md", "docs/specs/*.md"]

# 2026-08-09 03:45 EDT  |  2026-08-09T03:45 EST
STAMP = re.compile(r"(20\d\d-\d\d-\d\d)[ T](\d\d:\d\d)\s*(EDT|EST)\b")

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


def targets() -> list[Path]:
    out = [ROOT / n for n in SCAN]
    for g in SCAN_GLOBS:
        out.extend(sorted(ROOT.glob(g)))
    return [p for p in out if p.is_file()]


def expected_suffix(naive: datetime) -> str:
    """EDT or EST, decided by America/Detroit's real offset on that date."""
    return "EDT" if naive.replace(tzinfo=DETROIT).dst() != timedelta(0) else "EST"


def main() -> int:
    now = datetime.now(DETROIT)
    future: list[str] = []
    offset: list[str] = []
    checked = 0

    for path in targets():
        rel = path.relative_to(ROOT)
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for date_s, time_s, zone in STAMP.findall(line):
                try:
                    naive = datetime.strptime(f"{date_s} {time_s}", "%Y-%m-%d %H:%M")
                except ValueError:
                    continue
                checked += 1

                want = expected_suffix(naive)
                if zone != want:
                    offset.append(f"{rel}:{lineno}  {date_s} {time_s} {zone}  (should be {want})")

                if naive.replace(tzinfo=DETROIT) > now:
                    future.append(f"{rel}:{lineno}  {date_s} {time_s} {zone}")

    print(f"\n=== log timestamps: {checked} checked across {len(targets())} files ===\n")
    print(f"  {DIM}now: {now:%Y-%m-%d %H:%M} {now:%Z}{RESET}\n")

    for label, hits, why in (
        ("future-dated", future, "a log records what happened; it cannot record what has not"),
        ("wrong zone suffix", offset, "suffix disagrees with America/Detroit on that date"),
    ):
        if hits:
            print(f"  {RED}FAIL{RESET}  {len(hits)} {label} — {why}")
            for h in hits:
                print(f"          {RED}{h}{RESET}")
        else:
            print(f"  {GREEN}ok{RESET}    no {label} timestamps")

    if future or offset:
        print(f"\n{RED}=== FAILED ==={RESET}\n")
        return 1
    print(f"\n{GREEN}=== PASSED ==={RESET}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
