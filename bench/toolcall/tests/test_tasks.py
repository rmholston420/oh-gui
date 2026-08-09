"""Task-set integrity tests: disk prompts must preserve the pinned SDK schemas."""
from __future__ import annotations

import json
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
from bench.toolcall.grading import grade_message  # noqa: E402
from bench.toolcall.tasks import load_tasks  # noqa: E402


def _fixture_arguments(task):
    """Build a valid declared outcome solely from its objective predicate."""
    expected = task["expected_outcome"]
    arguments = {}
    for arg in expected["required_args"]:
        constraint = expected.get("arg_constraints", {}).get(arg, {})
        if "equals" in constraint:
            arguments[arg] = constraint["equals"]
        elif arg == "path":
            arguments[arg] = "/workspace/fixture.txt"
        elif constraint.get("type") == "integer":
            arguments[arg] = constraint.get("minimum", 0)
        elif constraint.get("type") == "array":
            arguments[arg] = [1, 2]
        else:
            arguments[arg] = "fixture"
    return arguments


def test_exactly_one_hundred_twenty_disk_backed_tasks_with_declared_predicates():
    tasks = load_tasks()
    assert len(tasks) == 120
    assert [int(task["id"].split("-", 1)[0]) for task in tasks] == list(range(1, 121))
    assert all(task["goal"] and task["expected_outcome"]["required_args"] for task in tasks)
    assert len({task["id"] for task in tasks}) == 120


def test_every_task_carries_the_two_pinned_openhands_schemas():
    for task in load_tasks():
        schemas = {item["function"]["name"]: item["function"]["parameters"] for item in task["tool_schemas"]}
        assert set(schemas) == {"terminal", "file_editor"}
        assert schemas["terminal"]["required"] == ["command"]
        assert set(schemas["terminal"]["properties"]) == {"command", "is_input", "timeout", "reset"}
        assert schemas["file_editor"]["required"] == ["command", "path"]
        assert set(schemas["file_editor"]["properties"]) == {
            "command", "path", "file_text", "old_str", "new_str", "insert_line", "view_range"}
        assert task["schema_basis"]["sdk_version"] == "openhands-tools 1.41.0"
        assert task["schema_basis"]["terminal_definition"].endswith("terminal/definition.py, TerminalAction")
        assert task["schema_basis"]["file_editor_definition"].endswith("file_editor/definition.py, FileEditorAction")
        assert "_sdk" + "_src" not in json.dumps(task)


def test_every_task_predicate_is_accepted_by_the_existing_pure_grader():
    for task in load_tasks():
        message = {"tool_calls": [{"function": {
            "name": task["expected_outcome"]["tool"],
            "arguments": json.dumps(_fixture_arguments(task)),
        }}]}
        result = grade_message(task, message)
        assert result["resolved"] is True, task["id"]
