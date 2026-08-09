"""Executable predicates for `STATIC`-tier gates (ADR-018).

Each function returns `None` when the gate holds, or a string explaining the violation.
Every predicate must be capable of failing against a plausible mistake — a check that
cannot go red is the inert control ADR-006 forbids, and `tests/test_runner.py` plants a
violation for each one.

Scope discipline: these check *the tree as it stands*. Where a gate describes a surface
that does not exist yet, it belongs in the `PHASE` tier, not here with a vacuous predicate.
A `STATIC` predicate that passes because its subject is absent is only acceptable when the
gate is prohibitive — "X must never appear" is meaningfully green when X does not appear.
"""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

from spec_coverage import evidence_problems, register_problems, requirement_id_problems

REPO_ROOT = Path(__file__).resolve().parents[2]

GUI_SRC = REPO_ROOT / "apps" / "gui" / "src"
GUI_PKG = REPO_ROOT / "apps" / "gui" / "package.json"
MW_SRC = REPO_ROOT / "services" / "middleware" / "src" / "ohgui_middleware"
MW_PYPROJECT = REPO_ROOT / "services" / "middleware" / "pyproject.toml"
PINS = REPO_ROOT / "docs" / "UPSTREAM_PINS.md"
LEDGER = REPO_ROOT / "PORTING_LEDGER.md"


# --------------------------------------------------------------------------- helpers


def _sources(root: Path, suffixes: tuple[str, ...]) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(
        p
        for p in root.rglob("*")
        if p.is_file() and p.suffix in suffixes and "node_modules" not in p.parts
    )


#: String literals and comments, for both TS and Python. Blanked rather than deleted so
#: line numbers survive.
_LITERAL_RE = re.compile(
    r"""(?P<s>'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)"""
    r"""|(?P<c>//[^\n]*|\#[^\n]*)"""
)
_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/|'''.*?'''|\"\"\".*?\"\"\"", re.DOTALL)
#: JSX text nodes — human-readable copy between tags. `<code>NeverConfirm()</code>` in an
#: explanatory paragraph is documentation, not an invocation, and must not trip a code gate.
_JSX_TEXT_RE = re.compile(r"(?<=>)[^<>{}]*(?=<)")


def _blank_noncode(text: str) -> str:
    """Blank comments and string literals, preserving line count.

    Without this, a gate that forbids *invoking* a primitive fires on a test whose name
    merely mentions it. A checker with false positives gets switched off, and a switched-off
    checker is the inert control again — one layer up.
    """

    def _keep_newlines(m: re.Match[str]) -> str:
        return "\n" * m.group(0).count("\n")

    text = _BLOCK_COMMENT_RE.sub(_keep_newlines, text)
    text = _LITERAL_RE.sub(lambda m: "" if m.group("c") else '""', text)
    return _JSX_TEXT_RE.sub(_keep_newlines, text)


def _grep(
    roots: list[Path],
    pattern: str,
    suffixes: tuple[str, ...],
    *,
    code_only: bool = False,
) -> list[str]:
    """Search source files. With `code_only`, comments and string literals are ignored."""
    rx = re.compile(pattern)
    hits: list[str] = []
    for root in roots:
        for path in _sources(root, suffixes):
            raw = path.read_text(encoding="utf-8", errors="replace")
            haystack = _blank_noncode(raw) if code_only else raw
            for lineno, (line, orig) in enumerate(
                zip(haystack.splitlines(), raw.splitlines()), start=1
            ):
                if rx.search(line):
                    rel = path.relative_to(REPO_ROOT)
                    hits.append(f"{rel}:{lineno}: {orig.strip()[:100]}")
    return hits


def _pkg_deps() -> dict[str, str]:
    if not GUI_PKG.is_file():
        return {}
    data = json.loads(GUI_PKG.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for section in ("dependencies", "devDependencies", "peerDependencies"):
        out.update(data.get(section) or {})
    return out


TS = (".ts", ".tsx", ".js", ".jsx")
PY = (".py",)


# ------------------------------------------------------------------- v4.0 / v4.2 gates


def no_framer_motion() -> str | None:
    """`motion/react` for animation; `framer-motion` is never added as a dependency."""
    deps = _pkg_deps()
    if "framer-motion" in deps:
        return f"apps/gui/package.json declares framer-motion@{deps['framer-motion']}"
    hits = _grep([GUI_SRC], r"""from\s+['"]framer-motion['"]""", TS)
    return f"framer-motion imported at {hits[0]}" if hits else None


def no_copypaste_libs_as_deps() -> str | None:
    """Aceternity UI / Magic UI are vendored source, never npm dependencies."""
    banned = [n for n in _pkg_deps() if "aceternity" in n.lower() or "magicui" in n.lower()]
    if banned:
        return f"copy-paste libraries declared as npm dependencies: {', '.join(banned)}"
    return None


def upstream_source_not_vendored() -> str | None:
    """No OpenHands source file is modified, forked, or patched into this repo."""
    for marker in ("openhands", "agent-canvas"):
        for path in REPO_ROOT.rglob(marker):
            if not path.is_dir():
                continue
            rel = path.relative_to(REPO_ROOT)
            if rel.parts[0] in {".git", "node_modules", "docs", "bench", "adrs"}:
                continue
            # ADR-026 D1.3: `review/_sdk_src/` is evidence, not a dependency. Safe only
            # because three gates fence it - not-imported, matches-upstream, and
            # citations-resolve. Remove any one and this exemption becomes a fork.
            if rel.parts[:2] == ("review", "_sdk_src"):
                continue
            if "node_modules" in rel.parts or ".venv" in rel.parts:
                continue
            return f"upstream source tree present in repo at {rel}"
    return None


def upstream_pinned_by_digest() -> str | None:
    """agent-server pinned by digest; the four `openhands-*` wheels pinned with `==`."""
    if not PINS.is_file():
        return "docs/UPSTREAM_PINS.md is missing"
    pins = PINS.read_text(encoding="utf-8")
    if not re.search(r"ghcr\.io/openhands/agent-server@sha256:[0-9a-f]{64}", pins):
        return "no digest-pinned agent-server reference in docs/UPSTREAM_PINS.md"
    if not MW_PYPROJECT.is_file():
        return "services/middleware/pyproject.toml is missing"
    raw = MW_PYPROJECT.read_text(encoding="utf-8")
    missing = [
        pkg
        for pkg in (
            "openhands-sdk",
            "openhands-tools",
            "openhands-workspace",
            "openhands-agent-server",
        )
        if not re.search(rf"{re.escape(pkg)}\s*==\s*\d", raw)
    ]
    if missing:
        return f"not `==`-pinned in middleware pyproject.toml: {', '.join(missing)}"
    return None


def policy_logic_not_in_browser() -> str | None:
    """Policy-bearing logic lives in the Python middleware, never in the browser.

    Names checked are SDK policy primitives. Test files are in scope: a test that
    constructs a policy object in the browser has put policy in the browser.
    """
    banned = (
        r"\b(AlwaysConfirm|NeverConfirm|ConfirmRisky|SecurityAnalyzerBase"
        r"|EnsembleSecurityAnalyzer|StuckDetector|block_action|block_message"
        r"|set_confirmation_policy|reject_pending_actions|execute_tool)\s*\("
    )
    hits = _grep([GUI_SRC], banned, TS, code_only=True)
    if hits:
        return f"policy primitive invoked in the browser: {hits[0]}"
    return None


def ts_client_confined() -> str | None:
    """`@openhands/typescript-client` stays behind the anti-corruption layer.

    Concretely: it is a devDependency (types only, ADR-001 Amendment #3) and no runtime
    module imports it. A value import would put the Agent Server transport in the browser.
    """
    pkg = json.loads(GUI_PKG.read_text(encoding="utf-8")) if GUI_PKG.is_file() else {}
    if "@openhands/typescript-client" in (pkg.get("dependencies") or {}):
        return "@openhands/typescript-client is a runtime dependency; it must be devDependencies"
    hits = [
        h
        for h in _grep([GUI_SRC], r"""@openhands/typescript-client""", TS)
        if not re.search(r"\bimport\s+type\b|__tests__|\.test\.", h)
    ]
    if hits:
        return f"non-type import of the Agent Server client: {hits[0]}"
    return None


# ------------------------------------------------------------------------- v4.3 gates


def no_identity_fields() -> str | None:
    """No schema carries a user/owner/profile identity field (ADR-003)."""
    pattern = r"\b(created_by|createdBy|user_id|userId|owner_id|ownerId|profile_id|profileId)\b"
    hits = _grep([GUI_SRC, MW_SRC], pattern, TS + PY, code_only=True)
    if hits:
        return f"identity field present: {hits[0]}"
    return None


def no_household_surface() -> str | None:
    """No surface references profiles, proficiency tiers, delegates, assist mode, household."""
    pattern = r"\b(proficiency|delegate[ds]?|assistMode|assist_mode|household)\b"
    hits = _grep([GUI_SRC, MW_SRC], pattern, TS + PY, code_only=True)
    if hits:
        return f"removed household concept referenced: {hits[0]}"
    return None


# ------------------------------------------------------- v4.4 / ADR-015 / ADR-021 gates


def agent_server_dtos_generated() -> str | None:
    """No hand-written Agent Server DTO (ADR-021 class 1).

    A pydantic model under `upstream/` outside `_generated/` is a hand-written DTO. Passes
    today because none exists; goes red the moment one is added by hand.
    """
    if not MW_SRC.is_dir():
        return None
    upstream = MW_SRC / "upstream"
    for path in _sources(upstream, PY):
        if "_generated" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                bases = {
                    b.id if isinstance(b, ast.Name) else getattr(b, "attr", "")
                    for b in node.bases
                }
                if "BaseModel" in bases:
                    rel = path.relative_to(REPO_ROOT)
                    return (
                        f"hand-written Agent Server DTO {node.name} at {rel}:{node.lineno}; "
                        "ADR-021 requires generation into upstream/_generated/"
                    )
    return None


#: A declared provisionality flag, e.g. `AUTHORIZE_REQUEST_PROVISIONAL = True`.
_PROVISIONAL_FLAG_RE = re.compile(
    r"\s*([A-Z0-9_]*PROVISIONAL[A-Z0-9_]*)\s*=\s*(True|False)\s*$"
)


def provisional_types_not_wired() -> str | None:
    """A type marked `PROVISIONAL — UNVERIFIED` may not have a hook wired to it (ADR-021).

    The marker exists because `AuthorizeRequest` was written from the *documented* envelope,
    and ADR-015 says documentation is not verification. A hook installed against a wrong field
    shape fails in the direction of allowing what it meant to deny, so the marker is a hard
    interlock and not a comment: while any provisional type stands, no hook installation may
    appear anywhere in the middleware.

    Amended 2026-08-09. This originally keyed on the comment string "PROVISIONAL - UNVERIFIED".
    When AUTHORIZE_REQUEST_PROVISIONAL was legitimately cleared to False on 2026-08-08 the
    comment went with it and the gate became structurally incapable of firing - green forever,
    for the same reason a checked `- [x]` gate used to vanish from the registry. A gate keyed on
    prose is a gate that a reword disarms. It now reads the declared boolean, which is the state.
    """
    marked: list[str] = []
    for path in _sources(MW_SRC, PY):
        text = path.read_text(encoding="utf-8", errors="replace")
        for lineno, line in enumerate(text.splitlines(), 1):
            m = _PROVISIONAL_FLAG_RE.match(line)
            if m and m.group(2) == "True":
                marked.append(f"{path.relative_to(REPO_ROOT)}:{lineno} {m.group(1)}")
    if not marked:
        return None
    installs = _grep(
        [MW_SRC],
        r"\b(install_hook|add_hook|register_hook|HookType\.COMMAND|hooks\s*=)",
        PY,
        code_only=True,
    )
    if installs:
        return (
            f"hook installed at {installs[0]} while a PROVISIONAL type stands "
            f"({', '.join(marked)}); clear ADR-014 verification item 5 first"
        )
    return None


def no_nonexistent_stats_event() -> str | None:
    """`StatsConversationStateUpdateEvent` does not exist upstream; never reference it."""
    hits = _grep([GUI_SRC, MW_SRC], r"StatsConversationStateUpdateEvent", TS + PY, code_only=True)
    if hits:
        return f"reference to a non-existent upstream event: {hits[0]}"
    return None


def ledger_records_native_basis() -> str | None:
    """Every PORTING_LEDGER entry carrying OpenHands data records its Native basis."""
    if not LEDGER.is_file():
        return "PORTING_LEDGER.md is missing"
    text = LEDGER.read_text(encoding="utf-8")
    blocks = re.split(r"^#### ", text, flags=re.MULTILINE)[1:]
    offenders = []
    for block in blocks:
        title = block.splitlines()[0].strip()
        # A REJECTED entry adopted nothing, so it carries no OpenHands data and has no
        # native basis to record. Demanding one makes the ledger unable to record a
        # refusal, and the refusals are the entries most worth keeping.
        if re.search(r"[-\u2014]\s*REJECTED\b", title):
            continue
        carries_oh = re.search(r"openhands|agent-server|agent-canvas", block, re.IGNORECASE)
        if carries_oh and not re.search(r"\*\*Native basis", block, re.IGNORECASE):
            offenders.append(title)
    if offenders:
        return "ledger entries carrying OpenHands data with no Native basis: " + "; ".join(
            offenders
        )
    return None


# ---------------------------------------------------------------------- prohibitive gates


def no_execute_tool_ui_path() -> str | None:
    """No UI path calls `conversation.execute_tool()`."""
    hits = _grep([GUI_SRC], r"execute_tool|executeTool", TS, code_only=True)
    if hits:
        return f"execute_tool reachable from the browser: {hits[0]}"
    return None


def no_coauthored_by_trailer() -> str | None:
    """Agent authorship uses the `X-Agent-*` namespace, never `Co-authored-by`."""
    hits = _grep([GUI_SRC, MW_SRC], r"Co-authored-by", TS + PY)
    if hits:
        return f"Co-authored-by used for agent authorship: {hits[0]}"
    return None


def no_phase_6_surface() -> str | None:
    """No Compare-mode or speculative-execution spawn UI ships before Phase 6."""
    hits = _grep(
        [GUI_SRC],
        r"\b(CompareMode|speculativeSpawn|spawnSpeculative|SpeculativeWorktree)\b",
        TS,
        code_only=True,
    )
    if hits:
        return f"Phase 6 surface present: {hits[0]}"
    return None


def no_shared_visibility_toggle() -> str | None:
    """No global 'everyone can see everything' visibility toggle (ADR-003 relic gate)."""
    hits = _grep(
        [GUI_SRC, MW_SRC],
        r"\b(shareAll|share_all|globalVisibility|familyVisible)\b",
        TS + PY,
        code_only=True,
    )
    if hits:
        return f"global shared-visibility toggle present: {hits[0]}"
    return None


# ------------------------------------------------------- ADR-026: extension-only posture

#: Read-only upstream source, committed so ADR-015 citations resolve offline. Never built,
#: never imported, never edited.
EVIDENCE_ROOT = REPO_ROOT / "review" / "_sdk_src"

#: Roots that become running software. Documentation may discuss the snapshot freely; these
#: may not name it at all, because shipped code has no legitimate reason to name a path it is
#: forbidden to read.
BUILD_ROOTS = (REPO_ROOT / "apps", REPO_ROOT / "services", REPO_ROOT / "bench")


def evidence_snapshot_not_imported() -> str | None:
    """ADR-026 D5.1 - the build never reaches the evidence snapshot."""
    offenders: list[str] = []
    for root in BUILD_ROOTS:
        for path in _sources(root, (".ts", ".tsx", ".js", ".jsx", ".py", ".json", ".toml", ".sh")):
            if ".venv" in path.parts or "node_modules" in path.parts:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if "_sdk_src" in text:
                offenders.append(str(path.relative_to(REPO_ROOT)))
    if offenders:
        return "build sources referencing the evidence snapshot: " + "; ".join(sorted(offenders))
    return None


#: The three ways a fork arrives while still looking like a pin.
_FORK_PIN_RE = re.compile(
    r"git\+|git@|github\.com[:/]|\bfile:|\blink:|\bportal:|(?<![\w.])\.\./|^\s*path\s*=",
    re.IGNORECASE,
)


def openhands_not_pinned_to_fork() -> str | None:
    """ADR-026 D5.2 - OpenHands is consumed at a published version, never from a fork."""
    offenders: list[str] = []
    for manifest in (MW_PYPROJECT, GUI_PKG, MW_PYPROJECT.parent / "requirements.txt"):
        if not manifest.is_file():
            continue
        for lineno, line in enumerate(manifest.read_text(encoding="utf-8").splitlines(), 1):
            if "openhands" not in line.lower():
                continue
            if _FORK_PIN_RE.search(line):
                offenders.append(
                    f"{manifest.relative_to(REPO_ROOT)}:{lineno} {line.strip()}"
                )
    if offenders:
        return "OpenHands resolved from a fork or local path: " + "; ".join(offenders)
    return None


def evidence_snapshot_matches_upstream() -> str | None:
    """ADR-026 D5.3 - no file under `review/_sdk_src/` was edited since it was vendored."""
    if not EVIDENCE_ROOT.is_dir():
        return None
    import hashlib

    problems: list[str] = []
    for version_dir in sorted(x for x in EVIDENCE_ROOT.iterdir() if x.is_dir()):
        manifest = version_dir / "MANIFEST.sha256"
        if not manifest.is_file():
            problems.append(f"{version_dir.name}: no MANIFEST.sha256")
            continue
        recorded: dict[str, str] = {}
        for line in manifest.read_text(encoding="utf-8").splitlines():
            if line.strip():
                digest, _, name = line.partition("  ")
                recorded[name.strip()] = digest.strip()
        present = {
            "./" + str(f.relative_to(version_dir)).replace("\\", "/")
            for f in version_dir.rglob("*")
            if f.is_file() and f.name != "MANIFEST.sha256"
        }
        for missing in sorted(set(recorded) - present):
            problems.append(f"{version_dir.name}: {missing} recorded but absent")
        for extra in sorted(present - set(recorded)):
            problems.append(f"{version_dir.name}: {extra} present but unrecorded")
        for name in sorted(set(recorded) & present):
            if hashlib.sha256((version_dir / name[2:]).read_bytes()).hexdigest() != recorded[name]:
                problems.append(f"{version_dir.name}: {name} modified since vendoring")
    if problems:
        return "evidence snapshot drift: " + "; ".join(problems[:6]) + (
            f" (+{len(problems) - 6} more)" if len(problems) > 6 else ""
        )
    return None


#: A citation of vendored evidence: a snapshot path ending .py, plus a line or range.
_CITATION_RE = re.compile(r"(review/_sdk_src/[\w./+-]+\.py):(\d+)(?:[-,](\d+))?")


def cited_evidence_paths_resolve() -> str | None:
    """ADR-026 D5.4 - every cited snapshot path exists **at the cited line**.

    Stronger than existence on purpose. The defect this was written for was a whole tree that
    was never committed; the likelier future defect is quieter - the tree is re-vendored at a
    new version, every file still exists, and every line number now points somewhere else.
    """
    offenders: list[str] = []
    for root in (REPO_ROOT / "adrs", REPO_ROOT / "docs"):
        for md in _sources(root, (".md",)):
            for lineno, line in enumerate(md.read_text(encoding="utf-8").splitlines(), 1):
                for m in _CITATION_RE.finditer(line):
                    rel_path, start, end = m.group(1), int(m.group(2)), m.group(3)
                    target = REPO_ROOT / rel_path
                    where = f"{md.relative_to(REPO_ROOT)}:{lineno}"
                    if not target.is_file():
                        offenders.append(f"{where} cites missing {rel_path}")
                        continue
                    n = len(target.read_text(encoding="utf-8", errors="replace").splitlines())
                    cited = max(start, int(end) if end else start)
                    if cited > n:
                        offenders.append(f"{where} cites {rel_path}:{cited} but it has {n} lines")
    if offenders:
        return "unresolvable evidence citations: " + "; ".join(offenders[:6]) + (
            f" (+{len(offenders) - 6} more)" if len(offenders) > 6 else ""
        )
    return None


# --------------------------------- ADR-015 amendment 2: PRESENT-BUT-UNCONSUMED fields

#: Declared in the vendored upstream artifacts, read by nothing in them. Each entry is the
#: field and the evidence of its inertness. A field leaves this list only by re-verification
#: against a specific SDK version that finds a real consumer - never because someone needs it.
UNCONSUMED_NATIVE_FIELDS: dict[str, str] = {
    "allowed_tools": (
        "declared at skills/skill.py:271 and plugin/types.py:271; all 24 occurrences across "
        "the four 1.41.0 packages are declaration, parse, or re-serialization - no read site"
    ),
}


def unconsumed_native_fields_not_wired() -> str | None:
    """ADR-015 amendment 2 - a field upstream never reads is not a contract we may build on.

    Deliberately a substring match. The failure guarded against is someone reaching for a
    plausible-looking native field in a hurry, and that reach looks the same whether it is
    typed, stringly-keyed, or a comment promising to wire it up later.
    """
    offenders: list[str] = []
    for root in (GUI_SRC, MW_SRC):
        for path in _sources(root, (".ts", ".tsx", ".py")):
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for lineno, line in enumerate(text.splitlines(), 1):
                for field in UNCONSUMED_NATIVE_FIELDS:
                    if field in line:
                        offenders.append(
                            f"{path.relative_to(REPO_ROOT)}:{lineno} references `{field}`"
                        )
    if offenders:
        return "PRESENT-BUT-UNCONSUMED fields wired into OH-GUI: " + "; ".join(offenders[:6]) + (
            f" (+{len(offenders) - 6} more)" if len(offenders) > 6 else ""
        )
    return None


# ---------------------------------------------------------------- ADR-028: living-spec drift


def spec_requirements_have_ids() -> str | None:
    """Every curated live requirement declaration has one stable, valid, unique REQ id."""
    problems = requirement_id_problems(REPO_ROOT)
    return "requirement-id drift: " + "; ".join(problems[:6]) if problems else None


def spec_coverage_register_is_current() -> str | None:
    """The generated register has one current row for each declared REQ id."""
    problems = register_problems(REPO_ROOT)
    return "coverage-register drift: " + "; ".join(problems[:6]) if problems else None


def spec_coverage_evidence_resolves() -> str | None:
    """IMPLEMENTED evidence and DROPPED ADR citations resolve in the working tree."""
    problems = evidence_problems(REPO_ROOT)
    return "coverage-evidence drift: " + "; ".join(problems[:6]) if problems else None


_MD_LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\((?P<target>[^)\s]+)(?:\s+['\"][^)]*['\"])?\)")


def spec_cross_references_resolve() -> str | None:
    """Every local Markdown document link in the spec/ADR corpus resolves.

    Historical prose may name a former file in backticks; only a Markdown reference claims
    that the named document is available to open, so only that syntactic form is gated.
    """
    roots = (REPO_ROOT / "docs" / "specs", REPO_ROOT / "adrs")
    offenders: list[str] = []
    for root in roots:
        if not root.is_dir():
            continue
        # ADR-028 governs live specs. `docs/specs/archive/` is historical material whose
        # links intentionally retain their original relative locations; it is not a current
        # document contract.
        sources = (
            sorted(root.glob("*.md"))
            if root == REPO_ROOT / "docs" / "specs"
            else _sources(root, (".md",))
        )
        for source in sources:
            for lineno, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
                for match in _MD_LINK_RE.finditer(line):
                    target = match.group("target").strip("<>")
                    if target.startswith(("#", "http://", "https://", "mailto:", "data:")):
                        continue
                    target = target.split("#", 1)[0].split("?", 1)[0]
                    if not target.endswith(".md"):
                        continue
                    resolved = (source.parent / target).resolve()
                    if not resolved.is_file():
                        offenders.append(
                            f"{source.relative_to(REPO_ROOT)}:{lineno} links missing {target}"
                        )
    offenders.extend(_adr_citation_offenders())

    if offenders:
        return "unresolvable spec/ADR document references: " + "; ".join(offenders[:6]) + (
            f" (+{len(offenders) - 6} more)" if len(offenders) > 6 else ""
        )
    return None


_ADR_NUMBER_RE = re.compile(r"\bADR-(\d{3})\b")
_ADR_INDEX_ROW_RE = re.compile(r"^\|\s*\[?ADR-(\d{3})\b", re.MULTILINE)

# Other projects' documents carry other projects' ADR numbering. Forge-OH's ADR-074 is a real
# decision of Forge-OH's, not a dangling reference to one of ours.
_FOREIGN_ADR_DIRS = ("docs/donor-specs",)


def _donor_names() -> tuple[str, ...]:
    """Donor projects, read from the directories under `docs/donor-specs/` rather than a list.

    A hardcoded list rots the first time a donor is added; the directory names cannot.
    """
    root = REPO_ROOT / "docs" / "donor-specs"
    if not root.is_dir():
        return ()
    return tuple(d.name.replace("-", "").lower() for d in root.iterdir() if d.is_dir())


def _names_a_donor(line: str) -> bool:
    """Whether a line attributes its ADR number to a donor project by name.

    Our own logs discuss donor ADR numbers — "Forge-OH's ADR-074 is Forge-OH's, not a dangling
    reference to ours" is a true sentence that must not be a red. Exempting the donor *directory*
    is not enough for that, because the sentence lives in `BUILD_LOG.md`.

    The exemption is deliberately narrow: it requires the donor to be named on the same line as the
    number. An unattributed `ADR-074` in our prose still reads as ours, and still fails.
    """
    squashed = line.replace("-", "").replace("_", "").lower()
    return any(name in squashed for name in _donor_names())


def _adr_citation_offenders() -> list[str]:
    """Bare `ADR-###` citations, and the index that is supposed to list them all.

    The link half of this gate only sees Markdown links under `docs/specs/` and `adrs/`. Three
    things fall outside it, and all three were live defects when this was written:

    1. prose cites `ADR-###` far more often than it links one, and a citation to a number nobody
       ever wrote reads as provenance while carrying none;
    2. `BUILD_LOG.md`, `DEBUG_LOG.md` and `PORTING_LEDGER.md` cite ADRs constantly and sit in
       neither scanned directory;
    3. an ADR can be filed and never indexed, which is how it stops being findable.
    """
    offenders: list[str] = []
    adr_dir = REPO_ROOT / "adrs"
    if not adr_dir.is_dir():
        return offenders

    by_number = {p.name[4:7]: p.name for p in sorted(adr_dir.glob("ADR-*.md"))}

    scanned: list[Path] = sorted(adr_dir.rglob("*.md"))
    scanned += sorted((REPO_ROOT / "docs" / "specs").glob("*.md"))
    scanned += sorted(REPO_ROOT.glob("*.md"))
    scanned += sorted((REPO_ROOT / "bench").rglob("*.md")) if (REPO_ROOT / "bench").is_dir() else []

    for source in scanned:
        rel = source.relative_to(REPO_ROOT).as_posix()
        if rel.startswith(_FOREIGN_ADR_DIRS):
            continue
        text = source.read_text(encoding="utf-8", errors="replace")
        for line in text.splitlines():
            if _names_a_donor(line):
                continue
            for number in sorted(set(_ADR_NUMBER_RE.findall(line))):
                if number not in by_number:
                    offenders.append(f"{rel} cites ADR-{number}, which has no file")

    index = adr_dir / "README.md"
    if not index.is_file():
        return offenders + ["adrs/README.md is missing"]

    index_rows = _ADR_INDEX_ROW_RE.findall(index.read_text(encoding="utf-8"))
    indexed = set(index_rows)
    for number, name in by_number.items():
        if number not in indexed:
            offenders.append(f"adrs/README.md does not index {name}")
    for number in sorted(indexed - set(by_number)):
        offenders.append(f"adrs/README.md indexes ADR-{number}, which has no file")
    for number in sorted(indexed):
        if index_rows.count(number) > 1:
            offenders.append(f"adrs/README.md indexes ADR-{number} {index_rows.count(number)} times")
    return offenders


REGISTRY_CHECKS = {
    "no_framer_motion": no_framer_motion,
    "no_copypaste_libs_as_deps": no_copypaste_libs_as_deps,
    "upstream_source_not_vendored": upstream_source_not_vendored,
    "upstream_pinned_by_digest": upstream_pinned_by_digest,
    "policy_logic_not_in_browser": policy_logic_not_in_browser,
    "ts_client_confined": ts_client_confined,
    "no_identity_fields": no_identity_fields,
    "no_household_surface": no_household_surface,
    "agent_server_dtos_generated": agent_server_dtos_generated,
    "no_nonexistent_stats_event": no_nonexistent_stats_event,
    "ledger_records_native_basis": ledger_records_native_basis,
    "provisional_types_not_wired": provisional_types_not_wired,
    "no_execute_tool_ui_path": no_execute_tool_ui_path,
    "no_coauthored_by_trailer": no_coauthored_by_trailer,
    "no_phase_6_surface": no_phase_6_surface,
    "no_shared_visibility_toggle": no_shared_visibility_toggle,
    "evidence_snapshot_not_imported": evidence_snapshot_not_imported,
    "openhands_not_pinned_to_fork": openhands_not_pinned_to_fork,
    "evidence_snapshot_matches_upstream": evidence_snapshot_matches_upstream,
    "cited_evidence_paths_resolve": cited_evidence_paths_resolve,
    "unconsumed_native_fields_not_wired": unconsumed_native_fields_not_wired,
    "spec_requirements_have_ids": spec_requirements_have_ids,
    "spec_coverage_register_is_current": spec_coverage_register_is_current,
    "spec_coverage_evidence_resolves": spec_coverage_evidence_resolves,
    "spec_cross_references_resolve": spec_cross_references_resolve,
}
