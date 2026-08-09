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


def provisional_types_not_wired() -> str | None:
    """A type marked `PROVISIONAL — UNVERIFIED` may not have a hook wired to it (ADR-021).

    The marker exists because `AuthorizeRequest` was written from the *documented* envelope,
    and ADR-015 says documentation is not verification. A hook installed against a wrong field
    shape fails in the direction of allowing what it meant to deny, so the marker is a hard
    interlock and not a comment: while any provisional type stands, no hook installation may
    appear anywhere in the middleware.
    """
    marked: list[str] = []
    for path in _sources(MW_SRC, PY):
        text = path.read_text(encoding="utf-8", errors="replace")
        if "PROVISIONAL — UNVERIFIED" in text or "PROVISIONAL - UNVERIFIED" in text:
            marked.append(str(path.relative_to(REPO_ROOT)))
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
}
