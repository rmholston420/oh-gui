"""Count what actually went wrong inside a cell, from the app's own event log.

The driver's error detector reads the rendered page, which is a summary of the run, not the run.
The conversation's `events/` directory is the record. Matrix 3 turned up `AgentErrorEvent` on
nearly every cell:

    Error validating tool 'file_editor': Extra data: line 1 column 88 (char 87).
    Arguments: unparseable JSON

That is Qwen3.6 emitting malformed tool-call JSON through Ollama. It is retryable and the agent
recovers, but it consumes turns and sometimes ends a run early — t01 finished in 2 turns with a
failing test on one run and 4 turns accepted on another. This is a real property of the
model-plus-runtime under test, so it belongs in the report as a measured number, not as noise.
"""
from __future__ import annotations

import json
import os
import re
from collections import Counter
from pathlib import Path

CONV_ROOT = Path(os.environ.get(
    "OH_GUI_CONV_ROOT", Path.home() / ".openhands" / "agent-canvas" / "dev_conversations"))

# The URL carries a dashed uuid; the directory on disk has no dashes.
_undash = lambda cid: re.sub(r"-", "", cid or "")


def conversation_dir(cid: str, root: Path | None = None) -> Path | None:
    if not cid:
        return None
    d = Path(root or CONV_ROOT) / _undash(cid)
    return d if d.is_dir() else None


def harvest(cid: str, root: Path | None = None) -> dict:
    """Returns counts and samples. Every count is None when unreadable, never 0 — absence of a
    record is not evidence that nothing went wrong."""
    out = {"conversation_id": cid, "events_total": None, "agent_errors": None,
           "retryable": None, "fatal": None, "by_tool": {}, "samples": [], "note": None}
    d = conversation_dir(cid, root)
    if d is None:
        out["note"] = f"no conversation dir for {cid!r}"
        return out
    ev = d / "events"
    if not ev.is_dir():
        out["note"] = "conversation has no events/ dir"
        return out

    files = sorted(ev.glob("event-*.json"))
    total = errs = retry = fatal = 0
    by_tool: Counter = Counter()
    samples: list[str] = []
    for f in files:
        total += 1
        try:
            e = json.loads(f.read_text())
        except Exception:
            continue
        if e.get("kind") != "AgentErrorEvent":
            continue
        errs += 1
        cls = e.get("classification") or {}
        if cls.get("retryable") is True:
            retry += 1
        else:
            fatal += 1
        by_tool[e.get("tool_name") or "-"] += 1
        msg = (e.get("error") or "").strip()
        if msg and msg not in samples and len(samples) < 3:
            samples.append(msg[:300])

    out.update(events_total=total, agent_errors=errs, retryable=retry, fatal=fatal,
               by_tool=dict(by_tool), samples=samples)
    return out


def enrich_summary(path: Path, root: Path | None = None) -> dict | None:
    """Read a cell summary, harvest its conversation, write the counts back. Idempotent."""
    s = json.loads(Path(path).read_text())
    h = harvest(s.get("conversation_id"), root)
    s["agent_error_events"] = h
    Path(path).write_text(json.dumps(s, indent=2))
    return h


if __name__ == "__main__":
    import sys
    for p in sys.argv[1:]:
        h = enrich_summary(Path(p))
        n = h["agent_errors"]
        print(f"{Path(p).name}: agent_errors={'?' if n is None else n} "
              f"retryable={h['retryable']} fatal={h['fatal']} {h['note'] or ''}")
        for s in h["samples"]:
            print(f"    {s}")
