"""Read-only task-fixture access for the tool-call benchmark."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

TASK_DIR = Path(__file__).resolve().parent / "tasks"


def load_task(path: Path) -> dict[str, Any]:
    task = json.loads(path.read_text())
    required = {"id", "goal", "tool_schemas", "expected_outcome"}
    missing = sorted(required - task.keys())
    if missing:
        raise ValueError(f"{path}: missing task fields {missing}")
    return task


def load_tasks() -> list[dict[str, Any]]:
    paths = sorted(
        TASK_DIR.glob("[0-9]*-*.json"),
        key=lambda path: int(path.name.split("-", 1)[0]),
    )
    return [load_task(path) for path in paths]
