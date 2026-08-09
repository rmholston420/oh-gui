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
            quality_failure: str | None = None, tool_name: str | None = None,
            command_exact: bool | None = None) -> dict[str, Any]:
    return {
        "resolved": resolved,
        "accepted": resolved is True,
        "tool_call_failure": tool_call_failure,
        "quality_failure": quality_failure,
        "unmeasurable_reason": tool_call_failure if resolved is None else None,
        "tool_name": tool_name,
        # Secondary, reported separately and never folded into `resolved`. See
        # `_is_freeform_command` for why exact shell text is a different construct.
        "command_exact": command_exact,
    }


def _is_freeform_command(tool: str, arg: str, constraint: Mapping[str, Any]) -> bool:
    """Is this constraint pinning free-form shell text to one exact phrasing?

    The `file_editor` `command` argument is a native enum — `view`, `create`, `str_replace`,
    `insert`, `undo_edit` — so an exact match there is the correct predicate. A `terminal`
    `command` is free-form shell, where many distinct strings are equally correct: `git branch
    --show-current` and `git rev-parse --abbrev-ref HEAD` both name the active branch.

    Pinning those to one phrasing measures whether the model guessed the author's incantation, not
    whether it can call a tool. Four of the nine tasks that failed on all nine screening cells were
    exactly this, across a 44x parameter range, which is a predicate signature rather than a
    capability one. The check is kept and reported, but as a secondary metric.
    """
    return tool == "terminal" and arg == "command" and "equals" in constraint


def grade_message(task: Mapping[str, Any], message: Mapping[str, Any] | None) -> dict[str, Any]:
    """Grade an assistant message against a task's declared predicate.

    ``resolved=None`` is reserved for responses whose outcome could not be *observed at all*: the
    request never returned, or it returned without an assistant message. Those are instrument
    failures and nothing else is.

    Everything the model emitted is an observation, including a reply containing no tool call.
    Every task declares a required tool, so answering in prose is not an abstention to be excluded
    from scoring — it is the failure mode this benchmark exists to measure. Malformed envelopes,
    unparseable arguments and wrong argument values are the model's doing on the same principle,
    and are quality failures (``resolved=False``) exactly like selecting the wrong tool.

    **Second amendment, same session, same criterion.** Re-grading exposed the original bias in a
    second form: `lfm2.5:8b` emitted no tool call on 36 of 40 tasks, those 36 were dropped as
    unmeasurable, and it then ranked *first* on the four it chose to attempt. Excluding a refusal
    scores a model on a subset it selected for itself. The criterion is applied in full rather than
    in slices: observed, or not observed, with nothing in between.

    **Amended 2026-08-09 on screening evidence (ADR-016, MANIFEST "Protocol amendments").** The
    original predicate folded `missing_required_arg:*` and `invalid_arg:*` to ``None``. Because
    `pass_rate` is computed over accepted trials, that deleted a model's argument errors from its
    own denominator instead of counting them against it. Screening showed the effect is dominant:
    134 of 216 failures were observed model errors being discarded as instrument failures, which
    compressed every cell to 89-100% and flattened the ranking across a 44x parameter range. The
    amendment is made on the 40-task screening split and tested on the disjoint 80-task
    confirmatory split, which is precisely what the split exists for.
    """
    if not isinstance(message, Mapping):
        return _result(resolved=None, tool_call_failure="missing_assistant_message")
    calls = message.get("tool_calls")
    if calls is None or calls == []:
        return _result(resolved=False, quality_failure="missing_tool_call")
    if not isinstance(calls, list):
        return _result(resolved=False, quality_failure="tool_calls_not_list")
    if len(calls) != 1:
        return _result(resolved=False, quality_failure="expected_exactly_one_tool_call")
    call = calls[0]
    if not isinstance(call, Mapping):
        return _result(resolved=False, quality_failure="tool_call_not_object")
    function = call.get("function")
    if not isinstance(function, Mapping):
        return _result(resolved=False, quality_failure="missing_function_object")
    name = function.get("name")
    if not isinstance(name, str) or not name:
        return _result(resolved=False, quality_failure="missing_function_name")
    if "arguments" not in function:
        return _result(resolved=False, quality_failure="missing_arguments")
    try:
        arguments = _arguments_as_object(function["arguments"])
    except _MalformedCall as exc:
        return _result(resolved=False, quality_failure=str(exc), tool_name=name)

    expected = task["expected_outcome"]
    if name != expected["tool"]:
        return _result(resolved=False, quality_failure="wrong_tool", tool_name=name)
    for arg in expected["required_args"]:
        if arg not in arguments:
            return _result(resolved=False, quality_failure=f"missing_required_arg:{arg}", tool_name=name)
    command_exact: bool | None = None
    for arg, constraint in expected.get("arg_constraints", {}).items():
        if arg not in arguments:
            continue
        matches = _constraint_matches(arguments[arg], constraint)
        if _is_freeform_command(expected["tool"], arg, constraint):
            # Structural checks still apply to the same argument; only the exact-text comparison
            # is demoted, so an empty or non-string command is still a hard failure.
            command_exact = matches
            structural = {k: v for k, v in constraint.items() if k != "equals"}
            if structural and not _constraint_matches(arguments[arg], structural):
                return _result(resolved=False, quality_failure=f"invalid_arg:{arg}",
                               tool_name=name, command_exact=command_exact)
            continue
        if not matches:
            return _result(resolved=False, quality_failure=f"invalid_arg:{arg}", tool_name=name,
                           command_exact=command_exact)
    return _result(resolved=True, tool_name=name, command_exact=command_exact)
