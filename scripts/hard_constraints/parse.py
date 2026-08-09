"""Parse `docs/specs/13-hard-constraints.md` into gate records.

The spec file is the **source of truth** (ADR-018). This module never edits it and never
infers a gate from anywhere else. A gate is a markdown task-list item at the top level of
that file; everything else in the file is prose.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = REPO_ROOT / "docs" / "specs" / "13-hard-constraints.md"

#: A gate line. `- [x]` is matched as well as `- [ ]`: before 2026-08-09 only the unchecked
#: form was parsed, so marking a gate done **deleted it from enforcement** and orphaned its
#: registry entry. ADR-018 exists to stop deferral becoming disposal; completion must not be
#: a second disposal route. The mark is not part of gate identity, so recognising `[x]`
#: re-registers the affected gate at its original ID rather than minting a new one.
_ITEM_RE = re.compile(r"^- \[(?P<mark>[ xX])\] (?P<body>.*)$")
_CONT_RE = re.compile(r"^ {6}(?P<body>\S.*)$")
_RETIRED_RE = re.compile(r"~~(?P<struck>.*?)~~")


@dataclass(frozen=True)
class Gate:
    """One `- [ ]` line from the checklist."""

    gate_id: str
    text: str
    line: int
    retired: bool
    #: `True` when the spec line is `- [x]`. Satisfied gates still require a registry entry;
    #: the mark records that the requirement is met, not that it stopped being a requirement.
    checked: bool = False

    @property
    def short(self) -> str:
        return self.text if len(self.text) <= 88 else self.text[:85] + "..."


def _normalize(text: str) -> str:
    """Collapse whitespace so a re-wrap does not change a gate's identity.

    Wording changes *do* change it, deliberately: ADR-018 property 1 makes an edited gate
    fail until it is consciously re-registered. Re-wrapping a paragraph is not an edit to
    the requirement; rewording it is.
    """
    return re.sub(r"\s+", " ", text).strip()


def _identity_text(text: str) -> str:
    """The span that defines a gate's identity.

    For a live gate that is the whole item. For a retired one it is only the struck span:
    a retirement is normally annotated with the retiring ADR and its reasoning, and that
    annotation must not change the identity of the requirement being retired. The requirement
    itself is what is being tracked, and it did not change — it stopped applying.
    """
    struck = _RETIRED_RE.search(text)
    return _normalize(struck.group("struck")) if struck else _normalize(text)


def _gate_id(text: str) -> str:
    return hashlib.sha256(_identity_text(text).encode("utf-8")).hexdigest()[:10]


def parse(spec_path: Path | None = None) -> list[Gate]:
    path = spec_path or SPEC_PATH
    if not path.is_file():
        raise FileNotFoundError(f"checklist not found: {path}")

    gates: list[Gate] = []
    pending: list[str] | None = None
    pending_line = 0
    pending_checked = False

    def flush() -> None:
        nonlocal pending, pending_line, pending_checked
        if pending is None:
            return
        text = _normalize(" ".join(pending))
        gates.append(
            Gate(
                gate_id=_gate_id(text),
                text=text,
                line=pending_line,
                retired=bool(_RETIRED_RE.search(text)),
                checked=pending_checked,
            )
        )
        pending = None
        pending_checked = False

    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        item = _ITEM_RE.match(raw)
        if item:
            flush()
            pending = [item.group("body")]
            pending_line = lineno
            pending_checked = item.group("mark").lower() == "x"
            continue
        cont = _CONT_RE.match(raw)
        if cont and pending is not None:
            pending.append(cont.group("body"))
            continue
        flush()
    flush()

    return gates


if __name__ == "__main__":  # pragma: no cover - developer aid for registry authoring
    for g in parse():
        flag = "RETIRED" if g.retired else ("DONE   " if g.checked else "       ")
        print(f'    "{g.gate_id}": ,  # {flag} L{g.line} {g.short}')
