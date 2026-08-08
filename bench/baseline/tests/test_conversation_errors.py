"""The harvester is the only thing that will tell us how much of the baseline was spent on the
model failing to emit valid tool-call JSON. If it undercounts, the report understates the problem;
if it returns 0 when it cannot read, it invents a clean run."""
import json
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from conversation_errors import harvest, enrich_summary  # noqa: E402

CID = "93b1aa1d-8b4e-4fce-b9d9-27665a1e0686"
UNDASHED = CID.replace("-", "")

REAL = {  # verbatim from matrix 3, event-00009
    "kind": "AgentErrorEvent", "tool_name": "file_editor",
    "error": ("Error validating tool 'file_editor': Extra data: line 1 column 88 (char 87). "
              "Arguments: unparseable JSON"),
    "classification": {"kind": "agent_action", "retryable": True, "user_action": "retry"},
}


def seed(root, events):
    d = root / UNDASHED / "events"
    d.mkdir(parents=True, exist_ok=True)
    for i, e in enumerate(events):
        (d / f"event-{i:05d}-x.json").write_text(json.dumps(e))
    return root


def test_counts_real_agent_error_shape(tmp_path):
    seed(tmp_path, [{"kind": "MessageEvent"}, REAL, REAL])
    h = harvest(CID, tmp_path)
    assert h["agent_errors"] == 2 and h["retryable"] == 2 and h["fatal"] == 0
    assert h["events_total"] == 3
    assert h["by_tool"] == {"file_editor": 2}
    assert "unparseable JSON" in h["samples"][0]


def test_non_retryable_counts_as_fatal(tmp_path):
    e = dict(REAL, classification={"retryable": False})
    seed(tmp_path, [e])
    h = harvest(CID, tmp_path)
    assert h["fatal"] == 1 and h["retryable"] == 0


def test_missing_conversation_is_none_not_zero(tmp_path):
    """A cell whose conversation we cannot find has UNKNOWN errors, not zero errors."""
    h = harvest(CID, tmp_path)
    assert h["agent_errors"] is None and "no conversation dir" in h["note"]


def test_no_conversation_id_is_none(tmp_path):
    assert harvest(None, tmp_path)["agent_errors"] is None


def test_clean_run_is_zero_not_none(tmp_path):
    """Distinct from the above: events exist and contain no errors. That IS zero."""
    seed(tmp_path, [{"kind": "MessageEvent"}])
    assert harvest(CID, tmp_path)["agent_errors"] == 0


def test_unparseable_event_file_does_not_abort(tmp_path):
    seed(tmp_path, [REAL])
    (tmp_path / UNDASHED / "events" / "event-00099-bad.json").write_text("{not json")
    assert harvest(CID, tmp_path)["agent_errors"] == 1


def test_enrich_is_idempotent(tmp_path):
    seed(tmp_path, [REAL])
    s = tmp_path / "t01.summary.json"
    s.write_text(json.dumps({"conversation_id": CID, "task": "t01"}))
    enrich_summary(s, tmp_path)
    first = json.loads(s.read_text())
    enrich_summary(s, tmp_path)
    assert json.loads(s.read_text()) == first
    assert first["agent_error_events"]["agent_errors"] == 1
    assert first["task"] == "t01"
