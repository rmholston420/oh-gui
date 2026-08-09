"""Hand-written objective fixtures for the pure tool-call grader."""
from __future__ import annotations

from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
from bench.toolcall.grading import grade_message  # noqa: E402

TERMINAL_TASK = {
    "expected_outcome": {
        "tool": "terminal", "required_args": ["command"],
        "arg_constraints": {"command": {"type": "string", "nonempty": True}},
    }
}
EDITOR_TASK = {
    "expected_outcome": {
        "tool": "file_editor", "required_args": ["command", "path", "file_text"],
        "arg_constraints": {
            "command": {"type": "string", "equals": "create"},
            "path": {"type": "string", "absolute_path": True},
            "file_text": {"type": "string", "nonempty": True},
        },
    }
}


def message(name, arguments):
    return {"content": "", "tool_calls": [{"function": {"name": name, "arguments": arguments}}]}


def test_valid_json_string_arguments_pass():
    got = grade_message(TERMINAL_TASK, message("terminal", '{"command":"pwd"}'))
    assert got == {"resolved": True, "accepted": True, "tool_call_failure": None,
                   "quality_failure": None, "unmeasurable_reason": None, "tool_name": "terminal"}


def test_native_object_arguments_pass():
    got = grade_message(EDITOR_TASK, message("file_editor", {
        "command": "create", "path": "/workspace/a.txt", "file_text": "hello"}))
    assert got["resolved"] is True


def test_no_tool_call_is_unmeasurable_not_quality_zero():
    got = grade_message(TERMINAL_TASK, {"content": "I would run pwd."})
    assert got["resolved"] is None
    assert got["tool_call_failure"] == "missing_tool_call"
    assert got["quality_failure"] is None


def test_malformed_argument_json_is_unmeasurable():
    got = grade_message(TERMINAL_TASK, message("terminal", '{"command":'))
    assert got["resolved"] is None
    assert got["tool_call_failure"] == "arguments_not_json"


def test_wrong_valid_tool_is_measured_quality_failure():
    got = grade_message(TERMINAL_TASK, message("file_editor", '{"command":"view","path":"/x"}'))
    assert got["resolved"] is False
    assert got["quality_failure"] == "wrong_tool"
    assert got["tool_call_failure"] is None


def test_missing_task_required_argument_is_unmeasurable_tool_call_failure():
    got = grade_message(EDITOR_TASK, message("file_editor", '{"command":"create","path":"/x"}'))
    assert got["resolved"] is None
    assert got["tool_call_failure"] == "missing_required_arg:file_text"


def test_invalid_argument_shape_is_unmeasurable_tool_call_failure():
    got = grade_message(EDITOR_TASK, message("file_editor", '{"command":"create","path":"relative","file_text":"x"}'))
    assert got["resolved"] is None
    assert got["tool_call_failure"] == "invalid_arg:path"
