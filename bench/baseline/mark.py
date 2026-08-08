#!/usr/bin/env python3
"""Event recorder for the Phase 0 baseline metrics report.

`docs/specs/02-repo-setup.md` item 5 asks for time-to-first-review, turns-to-acceptance,
lines-accepted-without-inspection, "lost track" incidents, and GPU temperature/power, gathered
from 5-10 representative coding tasks run through the unmodified app. Item 6 adds turns-elapsed
before the operator articulates a corrective instruction, and whether it was ever encoded durably.

Most of those are judgements only the human at the keyboard can make. "Lost track" is a subjective
state; "accepted without inspection" is a fact about whether a person read a diff, which no
instrumentation can observe. So this is not an automated benchmark. It is a stopwatch and a
notebook that timestamps the operator's own observations while they drive the stock app, and
measures the one thing that can be measured objectively - lines changed - from git rather than
from memory.

Line counts come from the fixture repository. On each accept the working tree is committed, so the
next accept's diff is measured against the previous one. The operator is asked one question per
accept: did you actually read it. That single judgement, times an objective line count, is the
metric the spec names.

Usage (normally invoked by run_baseline.sh, not directly):
    mark.py --task t01 --outdir DIR --fixture PATH
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

HELP = """
  r  first review presented     the agent's first proposal is on screen and reviewable
  t  turn                       you just sent the agent an instruction
  a  accept                     you accepted a change (asks: did you read the diff?)
  l  lost track                 you no longer know what the agent is doing or why
  c  corrective instruction     you told it to change how it works, not what to do
  x  tool failure               malformed tool call, abandonment, or circular retry
  n  note                       free-text observation
  d  done                       task complete and accepted
  q  abandon                    give up on this task (records why)
  ?  this help
"""

SUBJECTIVE = {"l", "c", "x", "n"}


@dataclass
class Event:
    kind: str
    t_offset_s: float
    wall_utc: str
    detail: dict = field(default_factory=dict)


class Recorder:
    def __init__(self, task: str, outdir: Path, fixture: Path | None):
        self.task = task
        self.outdir = outdir
        self.fixture = fixture
        self.t0 = time.monotonic()
        self.events: list[Event] = []
        self.outdir.mkdir(parents=True, exist_ok=True)
        self.jsonl = outdir / f"{task}.events.jsonl"

    # -- plumbing ---------------------------------------------------------------
    def _git(self, *args: str) -> str:
        if self.fixture is None:
            return ""
        return subprocess.run(
            ["git", "-C", str(self.fixture), *args],
            capture_output=True, text=True, check=False,
        ).stdout.strip()

    def record(self, kind: str, **detail) -> Event:
        ev = Event(
            kind=kind,
            t_offset_s=round(time.monotonic() - self.t0, 2),
            wall_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            detail=detail,
        )
        self.events.append(ev)
        with self.jsonl.open("a") as fh:
            fh.write(json.dumps(asdict(ev)) + "\n")
        return ev

    def accept(self, inspected: bool) -> Event:
        """Commit the working tree and measure what was accepted, from git not from memory."""
        added = removed = 0
        files: list[str] = []
        if self.fixture is not None:
            self._git("add", "-A")
            numstat = self._git("diff", "--cached", "--numstat")
            for line in filter(None, numstat.splitlines()):
                parts = line.split("\t")
                if len(parts) != 3:
                    continue
                a, r, path = parts
                # Binary files report "-"; they are not lines and must not be counted as zero
                # silently, so they are listed but excluded from the totals.
                if a.isdigit():
                    added += int(a)
                if r.isdigit():
                    removed += int(r)
                files.append(path)
            if files:
                self._git(
                    "-c", "user.name=oh-gui-baseline", "-c", "user.email=baseline@localhost",
                    "commit", "-q", "-m", f"{self.task}: accept #{self._accept_count() + 1}",
                )
        return self.record(
            "accept",
            inspected=inspected,
            lines_added=added,
            lines_removed=removed,
            files=files,
        )

    def _accept_count(self) -> int:
        return sum(1 for e in self.events if e.kind == "accept")

    # -- derived metrics --------------------------------------------------------
    def summary(self, outcome: str) -> dict:
        turns = [e for e in self.events if e.kind == "turn"]
        accepts = [e for e in self.events if e.kind == "accept"]
        first_review = next((e for e in self.events if e.kind == "first_review"), None)
        first_corrective = next((e for e in self.events if e.kind == "corrective"), None)
        done = next((e for e in self.events if e.kind == "done"), None)

        def turns_before(ev: Event | None) -> int | None:
            if ev is None:
                return None
            return sum(1 for t in turns if t.t_offset_s <= ev.t_offset_s)

        return {
            "task": self.task,
            "outcome": outcome,
            "started_utc": self.events[0].wall_utc if self.events else None,
            "wall_seconds": round(time.monotonic() - self.t0, 1),
            # Spec item 5
            "time_to_first_review_s": first_review.t_offset_s if first_review else None,
            "turns_to_acceptance": turns_before(done),
            "total_turns": len(turns),
            "lines_accepted": sum(e.detail["lines_added"] for e in accepts),
            "lines_accepted_without_inspection": sum(
                e.detail["lines_added"] for e in accepts if not e.detail["inspected"]
            ),
            "accepts": len(accepts),
            "accepts_without_inspection": sum(1 for e in accepts if not e.detail["inspected"]),
            "lost_track_incidents": sum(1 for e in self.events if e.kind == "lost_track"),
            # Spec item 6
            "turns_before_first_corrective": turns_before(first_corrective),
            "corrective_encoded_durably": (
                first_corrective.detail.get("encoded_durably") if first_corrective else None
            ),
            "correctives": [
                e.detail for e in self.events if e.kind == "corrective"
            ],
            # 08-telemetry.md 8.6 failure-signature vocabulary
            "tool_failures": [e.detail for e in self.events if e.kind == "tool_failure"],
            "notes": [e.detail.get("text", "") for e in self.events if e.kind == "note"],
            "event_count": len(self.events),
        }


def ask(prompt: str) -> str:
    """Read a line, treating EOF as an empty answer so the recorder can be driven from a pipe."""
    try:
        return input(prompt)
    except EOFError:
        return ""


def yesno(prompt: str) -> bool:
    return ask(f"{prompt} [y/N] ").strip().lower().startswith("y")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", required=True)
    ap.add_argument("--outdir", required=True, type=Path)
    ap.add_argument("--fixture", type=Path, default=None)
    args = ap.parse_args()

    if args.fixture is not None and not (args.fixture / ".git").is_dir():
        print(f"FAIL: {args.fixture} is not a git repository. Run seed_fixture.sh first.",
              file=sys.stderr)
        return 2

    rec = Recorder(args.task, args.outdir, args.fixture)
    rec.record("start", task=args.task)
    print(f"recording {args.task} -> {rec.jsonl}")
    print(HELP)

    outcome = "abandoned"
    while True:
        cmd = ask("> ").strip().lower()
        if cmd in ("", "?"):
            print(HELP)
            if cmd == "":
                # EOF with nothing pending: stop rather than spin forever on a closed pipe.
                if sys.stdin.closed or not sys.stdin.isatty():
                    outcome = "interrupted"
                    break
            continue
        if cmd == "r":
            print(f"  first review at {rec.record('first_review').t_offset_s}s")
        elif cmd == "t":
            print(f"  turn {sum(1 for e in rec.events if e.kind == 'turn') + 1}")
            rec.record("turn")
        elif cmd == "a":
            ev = rec.accept(inspected=yesno("  did you read this diff before accepting?"))
            print(f"  +{ev.detail['lines_added']} -{ev.detail['lines_removed']} "
                  f"across {len(ev.detail['files'])} file(s), "
                  f"inspected={ev.detail['inspected']}")
            if not ev.detail["files"]:
                # An accept that changed nothing almost always means the agent is working in a
                # different directory than the one being measured — the stock app defaults to
                # ~/.openhands/agent-canvas/workspaces unless VITE_WORKING_DIR points elsewhere.
                # Silently recording 0 would produce a plausible-looking baseline of zeros.
                print("  !! ACCEPT CHANGED NOTHING IN THE FIXTURE.")
                print("  !! The agent is probably not working in "
                      f"{rec.fixture}.")
                print("  !! Every line count this run is meaningless. Abandon with 'q' and relaunch")
                print("  !! the app with VITE_WORKING_DIR set to the fixture path.")
        elif cmd == "l":
            rec.record("lost_track", text=ask("  what did you lose track of? "))
        elif cmd == "c":
            rec.record(
                "corrective",
                text=ask("  what corrective instruction? "),
                encoded_durably=yesno("  was it encoded durably (repo file, setting, memory)?"),
            )
        elif cmd == "x":
            rec.record(
                "tool_failure",
                signature=ask("  malformed / abandonment / circular / other: "),
                text=ask("  detail: "),
            )
        elif cmd == "n":
            rec.record("note", text=ask("  note: "))
        elif cmd == "d":
            rec.record("done")
            outcome = "completed"
            break
        elif cmd == "q":
            rec.record("abandoned", text=ask("  why abandon? "))
            outcome = "abandoned"
            break
        else:
            print(f"  unknown command {cmd!r}; ? for help")

    summary = rec.summary(outcome)
    (args.outdir / f"{args.task}.summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
