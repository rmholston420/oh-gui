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
                   "quality_failure": None, "unmeasurable_reason": None, "tool_name": "terminal",
                   "command_exact": None}


def test_native_object_arguments_pass():
    got = grade_message(EDITOR_TASK, message("file_editor", {
        "command": "create", "path": "/workspace/a.txt", "file_text": "hello"}))
    assert got["resolved"] is True


def test_describing_the_call_instead_of_making_it_is_a_measured_failure():
    # Amended 2026-08-09 (ADR-016, second amendment). Prose in place of a tool call is the failure
    # mode the benchmark exists to measure, not an outcome that could not be observed.
    got = grade_message(TERMINAL_TASK, {"content": "I would run pwd."})
    assert got["resolved"] is False
    assert got["quality_failure"] == "missing_tool_call"
    assert got["tool_call_failure"] is None


def test_malformed_argument_json_is_a_measured_failure():
    got = grade_message(TERMINAL_TASK, message("terminal", '{"command":'))
    assert got["resolved"] is False
    assert got["quality_failure"] == "arguments_not_json"


def test_wrong_valid_tool_is_measured_quality_failure():
    got = grade_message(TERMINAL_TASK, message("file_editor", '{"command":"view","path":"/x"}'))
    assert got["resolved"] is False
    assert got["quality_failure"] == "wrong_tool"
    assert got["tool_call_failure"] is None


def test_missing_task_required_argument_is_a_measured_quality_failure():
    # Amended 2026-08-09 (ADR-016). A call that arrived and parsed is an observation. Folding it to
    # None deleted the model's own error from its own denominator.
    got = grade_message(EDITOR_TASK, message("file_editor", '{"command":"create","path":"/x"}'))
    assert got["resolved"] is False
    assert got["quality_failure"] == "missing_required_arg:file_text"
    assert got["tool_call_failure"] is None


def test_invalid_argument_shape_is_a_measured_quality_failure():
    got = grade_message(EDITOR_TASK, message("file_editor", '{"command":"create","path":"relative","file_text":"x"}'))
    assert got["resolved"] is False
    assert got["quality_failure"] == "invalid_arg:path"
    assert got["tool_call_failure"] is None


def test_only_an_absent_response_is_unmeasurable():
    # The boundary the amendment turns on. Exactly one thing is unobservable at this layer: no
    # assistant message. Transport failures are caught upstream in the harness.
    got = grade_message(EDITOR_TASK, None)
    assert got["resolved"] is None
    assert got["tool_call_failure"] == "missing_assistant_message"


def test_everything_the_model_emitted_is_measured():
    # A refusal is an answer. lfm2.5:8b ranked first on 4 of 40 tasks because 36 no-tool-call
    # replies were dropped instead of counted; if a future edit folds any of these back to None,
    # that survivorship artifact comes back and this goes red.
    for msg, expected in (
        ({"tool_calls": []}, "missing_tool_call"),
        ({"tool_calls": None}, "missing_tool_call"),
        ({"tool_calls": "nope"}, "tool_calls_not_list"),
        ({"tool_calls": ["not-an-object"]}, "tool_call_not_object"),
        ({"tool_calls": [{"function": "not-an-object"}]}, "missing_function_object"),
        (message("file_editor", "not json at all"), "arguments_not_json"),
        (message("file_editor", '"a string, not an object"'), "arguments_not_object"),
    ):
        got = grade_message(EDITOR_TASK, msg)
        assert got["resolved"] is False, expected
        assert got["quality_failure"] == expected
        assert got["tool_call_failure"] is None


EXACT_TERMINAL_TASK = {
    "id": "t-exact",
    "expected_outcome": {
        "tool": "terminal",
        "required_args": ["command"],
        "arg_constraints": {"command": {"type": "string", "equals": "git branch --show-current"}},
    },
}


def test_a_different_but_correct_shell_command_still_passes():
    # ADR-016 amendment 3. `git rev-parse --abbrev-ref HEAD` names the active branch just as well
    # as `git branch --show-current`. Failing it measured whether the model guessed the author's
    # phrasing. The exactness check survives as a secondary signal.
    got = grade_message(EXACT_TERMINAL_TASK,
                        message("terminal", '{"command":"git rev-parse --abbrev-ref HEAD"}'))
    assert got["resolved"] is True
    assert got["command_exact"] is False


def test_the_authored_phrasing_is_recorded_as_exact():
    got = grade_message(EXACT_TERMINAL_TASK,
                        message("terminal", '{"command":"git branch --show-current"}'))
    assert got["resolved"] is True
    assert got["command_exact"] is True


def test_demoting_exactness_does_not_disable_structural_checks():
    # The whole argument for the demotion is that shell text has many correct forms -- not that
    # `command` stops being checked. A non-string is still a hard failure.
    got = grade_message(EXACT_TERMINAL_TASK, message("terminal", '{"command":123}'))
    assert got["resolved"] is False
    assert got["quality_failure"] == "invalid_arg:command"


def test_file_editor_command_enum_stays_a_hard_failure():
    # `command` on file_editor is a native enum, not free-form text, so exactness is the correct
    # predicate there. If a future edit demotes it too, this goes red.
    got = grade_message(EDITOR_TASK, message("file_editor", '{"command":"replace","path":"/x","file_text":"y"}'))
    assert got["resolved"] is False
    assert got["quality_failure"] == "invalid_arg:command"
