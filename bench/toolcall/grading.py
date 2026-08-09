"""Pure grading for the pre-registered tool-call microbenchmark.

The grader deliberately scores only the declared predicate: exactly one selected
OpenHands tool, JSON-object arguments, and task-required argument constraints.
It performs no I/O and never assigns a numeric zero to an unmeasured response.
"""
from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any


class _MalformedCall(Exception):
    """Internal marker for a response that cannot be treated as an outcome."""


def _arguments_as_object(raw: Any) -> dict[str, Any]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, TypeError) as exc:
            raise _MalformedCall("arguments_not_json") from exc
    if not isinstance(raw, dict):
        raise _MalformedCall("arguments_not_object")
    return raw


def _constraint_matches(value: Any, constraint: Mapping[str, Any]) -> bool:
    kind = constraint.get("type")
    if kind == "string" and not isinstance(value, str):
        return False
    if kind == "integer" and (not isinstance(value, int) or isinstance(value, bool)):
        return False
    if kind == "array" and not isinstance(value, list):
        return False
    if constraint.get("nonempty") and not value:
        return False
    if constraint.get("absolute_path") and (not isinstance(value, str) or not value.startswith("/")):
        return False
    if "equals" in constraint and value != constraint["equals"]:
        return False
    if "enum" in constraint and value not in constraint["enum"]:
        return False
    if constraint.get("items") == "integer" and (
        not isinstance(value, list) or any(not isinstance(item, int) or isinstance(item, bool) for item in value)
    ):
        return False
    if "length" in constraint and (not isinstance(value, list) or len(value) != constraint["length"]):
        return False
    if "minimum" in constraint and (not isinstance(value, (int, float)) or value < constraint["minimum"]):
        return False
    return True


def _result(*, resolved: bool | None, tool_call_failure: str | None = None,
            quality_failure: str | None = None, tool_name: str | None = None) -> dict[str, Any]:
    return {
        "resolved": resolved,
        "accepted": resolved is True,
        "tool_call_failure": tool_call_failure,
        "quality_failure": quality_failure,
        "unmeasurable_reason": tool_call_failure if resolved is None else None,
        "tool_name": tool_name,
    }


def grade_message(task: Mapping[str, Any], message: Mapping[str, Any] | None) -> dict[str, Any]:
    """Grade an assistant message against a task's declared predicate.

    ``resolved=None`` is reserved for structural tool-call failures: no call,
    malformed call envelope, or arguments that are not a JSON object. Missing or invalid required
    arguments are also malformed tool calls. A valid call that selects the
    wrong tool is a measured quality failure (``resolved=False``).
    """
    if not isinstance(message, Mapping):
        return _result(resolved=None, tool_call_failure="missing_assistant_message")
    calls = message.get("tool_calls")
    if calls is None or calls == []:
        return _result(resolved=None, tool_call_failure="missing_tool_call")
    if not isinstance(calls, list):
        return _result(resolved=None, tool_call_failure="tool_calls_not_list")
    if len(calls) != 1:
        return _result(resolved=False, quality_failure="expected_exactly_one_tool_call")
    call = calls[0]
    if not isinstance(call, Mapping):
        return _result(resolved=None, tool_call_failure="tool_call_not_object")
    function = call.get("function")
    if not isinstance(function, Mapping):
        return _result(resolved=None, tool_call_failure="missing_function_object")
    name = function.get("name")
    if not isinstance(name, str) or not name:
        return _result(resolved=None, tool_call_failure="missing_function_name")
    if "arguments" not in function:
        return _result(resolved=None, tool_call_failure="missing_arguments")
    try:
        arguments = _arguments_as_object(function["arguments"])
    except _MalformedCall as exc:
        return _result(resolved=None, tool_call_failure=str(exc), tool_name=name)

    expected = task["expected_outcome"]
    if name != expected["tool"]:
        return _result(resolved=False, quality_failure="wrong_tool", tool_name=name)
    for arg in expected["required_args"]:
        if arg not in arguments:
            return _result(resolved=None, tool_call_failure=f"missing_required_arg:{arg}", tool_name=name)
    for arg, constraint in expected.get("arg_constraints", {}).items():
        if arg in arguments and not _constraint_matches(arguments[arg], constraint):
            return _result(resolved=None, tool_call_failure=f"invalid_arg:{arg}", tool_name=name)
    return _result(resolved=True, tool_name=name)
