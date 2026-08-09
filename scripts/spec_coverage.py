#!/usr/bin/env python3
"""Generate and validate ``docs/specs/COVERAGE.md`` (ADR-028).

Requirement IDs are permanent. This script never assigns, renumbers, or removes one; it
only reads the explicit IDs the specs declare and reconciles those declarations with the
register. An ID that disappears is a red condition, not an opportunity to silently rewrite
history.

Usage:
    spec_coverage.py            # validate; non-zero exit on drift
    spec_coverage.py --write    # rewrite COVERAGE.md, preserving recorded statuses
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Iterable

REPO = Path(__file__).resolve().parent.parent
SPECS = REPO / "docs" / "specs"
REGISTER = SPECS / "COVERAGE.md"

#: ADR-028 Phase 1 pass. `02` remains deliberately outside this enrollment: it is a closed
#: Phase 0 setup record, while the 11 un-enrolled live files are now visible here.
ENROLLED = (
    "00", "01", "03", "04", "04a", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "16"
)
PHASE1_PASS_PREFIXES = frozenset(
    {"03", "06", "07", "08", "09", "10", "11", "12", "13", "14", "16"}
)

ID_RE = re.compile(r"\[(REQ-[0-9a-z]+-\d{3})\]")
ANY_REQ_MARKER_RE = re.compile(r"\[REQ-([^\]]+)\]")
EXACT_ID_RE = re.compile(r"REQ-([0-9]+[a-z]?)-(\d{3})\Z")
ROW_RE = re.compile(
    r"^\|\s*(REQ-[0-9a-z]+-\d{3})\s*\|\s*(\w+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$"
)
STATUSES = {"SPECCED", "IMPLEMENTED", "DEFERRED", "DROPPED"}
PATH_LINE_RE = re.compile(r"(?P<path>[A-Za-z0-9_./-]+):(?P<line>\d+)\Z")
TEST_NAME_RE = re.compile(r"\b(test_[A-Za-z0-9_]+)\b")
ADR_RE = re.compile(r"\bADR-(\d{3})\b")


def paths(repo: Path = REPO) -> tuple[Path, Path]:
    specs = repo / "docs" / "specs"
    return specs, specs / "COVERAGE.md"


def spec_files(repo: Path = REPO) -> list[Path]:
    specs, _ = paths(repo)
    return [p for p in sorted(specs.glob("*.md")) if p.name.split("-", 1)[0] in ENROLLED]


def _is_table_data(line: str) -> bool:
    if not line.startswith("|"):
        return False
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if not cells or all(re.fullmatch(r"-+", c) for c in cells):
        return False
    return cells[0] not in {"Sub-problem", "Component", "Status"}


def normative_lines(path: Path) -> Iterable[tuple[int, str]]:
    """Curated Markdown forms used for live requirement declarations.

    ADR-028 expressly rejects guessing from headings and prose. Live specs declare their
    normative statements as list items, numbered clauses, component-register rows, and the
    checklist. Prose requirements carry an explicit ID too, but are not inferred by this gate.
    """
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if "~~" in line:
            # Historical/retracted prose has its ADR record and is not a live requirement.
            continue
        if path.name == "13-hard-constraints.md" and re.match(r"^- \[[ xX]\] ", line):
            yield lineno, line
        elif re.match(r"^- ", line) or re.match(r"^\d+\. ", line) or _is_table_data(line):
            yield lineno, line


def _statement_text(lines: list[str], line_index: int, marker_start: int) -> str:
    """Return nearby human-readable statement text for coverage-register notes."""
    same_line = lines[line_index][:marker_start].strip()
    same_line = re.sub(r"^(?:- \[[ xX]\]|[-*]|\d+\.)\s*", "", same_line).strip()
    if same_line and same_line != "<!--":
        return same_line
    # Checklist markers intentionally sit alone to avoid changing a gate's identity hash.
    for prior in range(line_index - 1, -1, -1):
        text = lines[prior].strip()
        if text and not text.startswith("<!--"):
            return re.sub(r"^(?:- \[[ xX]\]|[-*]|\d+\.)\s*", "", text).strip()
    return ""


def declared(repo: Path = REPO) -> dict[str, tuple[str, int, str]]:
    """Return ``id -> (spec filename, line number, requirement text)``.

    The function is deliberately data-only so the hard-constraint predicates can execute it
    against a mutation-test copy of the repository.
    """
    found: dict[str, tuple[str, int, str]] = {}
    dupes: list[str] = []
    for p in spec_files(repo):
        lines = p.read_text(encoding="utf-8").splitlines()
        for lineno, line in enumerate(lines, 1):
            for m in ID_RE.finditer(line):
                rid = m.group(1)
                if rid in found:
                    dupes.append(f"{rid} at {p.name}:{lineno} and {found[rid][0]}:{found[rid][1]}")
                    continue
                found[rid] = (p.name, lineno, _statement_text(lines, lineno - 1, m.start()))
    if dupes:
        raise ValueError("duplicate requirement ids: " + "; ".join(dupes))
    return found


def requirement_id_problems(repo: Path = REPO) -> list[str]:
    """Validate permanent IDs and the curated live declaration forms."""
    problems: list[str] = []
    by_prefix: dict[str, list[int]] = {prefix: [] for prefix in ENROLLED}
    seen: dict[str, tuple[str, int]] = {}

    for p in spec_files(repo):
        prefix = p.name.split("-", 1)[0]
        lines = p.read_text(encoding="utf-8").splitlines()
        for lineno, line in enumerate(lines, 1):
            for raw in ANY_REQ_MARKER_RE.findall(line):
                full = f"REQ-{raw}"
                match = EXACT_ID_RE.fullmatch(full)
                if not match:
                    problems.append(f"{p.name}:{lineno} has malformed requirement id [{full}]")
                    continue
                actual_prefix, ordinal_text = match.groups()
                if actual_prefix != prefix:
                    problems.append(
                        f"{p.name}:{lineno} uses {full}; its spec prefix must be REQ-{prefix}-nnn"
                    )
                if full in seen:
                    previous = seen[full]
                    problems.append(f"{full} is duplicated at {previous[0]}:{previous[1]} and {p.name}:{lineno}")
                else:
                    seen[full] = (p.name, lineno)
                by_prefix.setdefault(actual_prefix, []).append(int(ordinal_text))

        if prefix not in PHASE1_PASS_PREFIXES:
            continue
        for lineno, line in normative_lines(p):
            # In checklists a marker lives on the first following non-empty line; elsewhere it
            # remains on the statement itself. Either form is visibly adjacent in Markdown.
            marker_here = bool(ID_RE.search(line))
            marker_next = False
            if p.name == "13-hard-constraints.md":
                for candidate in lines[lineno : lineno + 5]:
                    if re.match(r"^- \[[ xX]\] ", candidate) or candidate.startswith("## "):
                        break
                    if ID_RE.search(candidate):
                        marker_next = True
                        break
            if not marker_here and not marker_next:
                problems.append(f"{p.name}:{lineno} is a live normative statement without a requirement id")

    for prefix in ENROLLED:
        ordinals = by_prefix.get(prefix, [])
        if not ordinals:
            problems.append(f"enrolled spec {prefix} declares no requirement ids")
            continue
        expected = list(range(1, len(ordinals) + 1))
        if sorted(ordinals) != expected:
            problems.append(
                f"REQ-{prefix} ids are not contiguous in first-appearance order: "
                f"found {sorted(ordinals)}, expected {expected}"
            )
    return problems


def _recorded_rows(repo: Path = REPO) -> list[tuple[str, str, str, str]]:
    """Return every syntactically valid register row, preserving duplicates."""
    _, register = paths(repo)
    if not register.is_file():
        return []
    out: list[tuple[str, str, str, str]] = []
    for line in register.read_text(encoding="utf-8").splitlines():
        m = ROW_RE.match(line.strip())
        if m and m.group(2) in STATUSES:
            out.append((m.group(1), m.group(2), m.group(3), m.group(4)))
    return out


def recorded(repo: Path = REPO) -> dict[str, tuple[str, str, str]]:
    """Return ``id -> (status, evidence, note)`` from the generated register."""
    return {rid: (status, evidence, note) for rid, status, evidence, note in _recorded_rows(repo)}


def register_problems(repo: Path = REPO) -> list[str]:
    """Validate exact coverage parity plus status-specific required evidence."""
    try:
        decl = declared(repo)
    except ValueError as exc:
        return [str(exc)]
    rec = recorded(repo)
    rows = _recorded_rows(repo)
    problems: list[str] = []
    row_counts: dict[str, int] = {}
    for rid, _, _, _ in rows:
        row_counts[rid] = row_counts.get(rid, 0) + 1
    duplicates = sorted(rid for rid, count in row_counts.items() if count > 1)
    if duplicates:
        problems.append(f"coverage register duplicates {len(duplicates)} id(s), first: {duplicates[0]}")
    missing = sorted(set(decl) - set(rec))
    stale = sorted(set(rec) - set(decl))
    if missing:
        problems.append(f"coverage register is missing {len(missing)} id(s), first: {missing[0]}")
    if stale:
        problems.append(f"coverage register has {len(stale)} stale id(s), first: {stale[0]}")
    for rid, (status, evidence, _) in sorted(rec.items()):
        if status == "IMPLEMENTED" and not evidence.strip():
            problems.append(f"{rid} is IMPLEMENTED with no evidence")
        elif status == "DEFERRED" and not re.fullmatch(r"Phase\s+\S+(?:\s+\S+)*", evidence.strip()):
            problems.append(f"{rid} is DEFERRED without a named phase")
        elif status == "DROPPED" and not ADR_RE.search(evidence):
            problems.append(f"{rid} is DROPPED without an ADR reference")
    return problems


def _evidence_path_resolves(repo: Path, evidence: str) -> str | None:
    evidence = evidence.strip()
    path_line = PATH_LINE_RE.fullmatch(evidence)
    if path_line:
        rel = Path(path_line.group("path"))
        if rel.is_absolute() or ".." in rel.parts:
            return f"evidence path {evidence!r} is not a repo-relative path"
        target = repo / rel
        if not target.is_file():
            return f"evidence path {evidence!r} does not exist"
        if int(path_line.group("line")) > len(target.read_text(encoding="utf-8", errors="replace").splitlines()):
            return f"evidence path {evidence!r} cites a line beyond end of file"
        return None

    name = TEST_NAME_RE.fullmatch(evidence)
    if name:
        target = f"def {name.group(1)}"
        for candidate in repo.rglob("*.py"):
            if ".git" not in candidate.parts and target in candidate.read_text(encoding="utf-8", errors="replace"):
                return None
        return f"test evidence {evidence!r} does not resolve"
    return f"IMPLEMENTED evidence {evidence!r} is neither path:line nor a resolvable test name"


def evidence_problems(repo: Path = REPO) -> list[str]:
    """Validate evidence objects without silently treating prose as proof."""
    problems: list[str] = []
    for rid, (status, evidence, _) in sorted(recorded(repo).items()):
        if status == "IMPLEMENTED":
            error = _evidence_path_resolves(repo, evidence)
            if error:
                problems.append(f"{rid}: {error}")
        elif status == "DROPPED":
            match = ADR_RE.search(evidence)
            if not match:
                problems.append(f"{rid}: DROPPED evidence names no ADR")
            elif not list((repo / "adrs").glob(f"ADR-{match.group(1)}-*.md")):
                problems.append(f"{rid}: DROPPED evidence names missing ADR-{match.group(1)}")
    return problems


def render(decl: dict[str, tuple[str, int, str]], rec: dict[str, tuple[str, str, str]]) -> str:
    body = [
        "# Spec Coverage Register",
        "",
        "**Generated by `scripts/spec_coverage.py`. Do not hand-edit the tables** - edit a status",
        "or evidence cell, then re-run with `--write` to reconcile. Requirement ids are permanent",
        "and are never reused, including after a requirement is dropped (ADR-028).",
        "",
        f"**Enrolled specs:** {', '.join(ENROLLED)}. This is ADR-028's completed Phase 1 pass; `02`",
        "remains excluded because it is the closed Phase 0 setup record. `SPECCED` is the explicit",
        "uncovered default: it makes no implementation claim without named repository evidence.",
        "",
        "| Status | Meaning | Evidence required |",
        "|---|---|---|",
        "| `SPECCED` | Stated, not yet built or not evidenced | - |",
        "| `IMPLEMENTED` | Built | a repo-relative `path:line` or test name that resolves |",
        "| `DEFERRED` | Postponed to a named phase | the phase name |",
        "| `DROPPED` | No longer a requirement | an ADR reference |",
        "",
    ]
    by_spec: dict[str, list[str]] = {}
    for rid in sorted(decl):
        by_spec.setdefault(decl[rid][0], []).append(rid)
    for spec in sorted(by_spec):
        body += [f"## {spec}", "", "| id | status | evidence | note |", "|---|---|---|---|"]
        for rid in by_spec[spec]:
            status, evidence, note = rec.get(rid, ("SPECCED", "", ""))
            text = decl[rid][2]
            note = note or (text[:90] + ("..." if len(text) > 90 else ""))
            body.append(f"| {rid} | {status} | {evidence} | {note} |")
        body.append("")
    counts = {s: 0 for s in STATUSES}
    for rid in decl:
        counts[rec.get(rid, ("SPECCED", "", ""))[0]] += 1
    body += [
        "## Totals",
        "",
        f"{len(decl)} requirements across {len(by_spec)} enrolled specs - "
        + " · ".join(f"{v} {k.lower()}" for k, v in sorted(counts.items()) if v),
        "",
    ]
    return "\n".join(body)


def main() -> int:
    write = "--write" in sys.argv
    try:
        decl = declared()
    except ValueError as exc:
        print(f"  {exc}")
        return 1
    rec = recorded()
    if write:
        _, register = paths()
        register.write_text(render(decl, rec), encoding="utf-8")
        print(f"wrote {register.relative_to(REPO)}: {len(decl)} requirements")
    problems = requirement_id_problems() + register_problems() + evidence_problems()
    for problem in problems:
        print(f"  {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
