"""Mutation tests for the ADR-018 hard-constraints runner.

The runner is a gate, and this project's standing rule is that a gate which has never been
seen to fail is not a gate. So every claim the runner makes is tested by *planting the
violation it is supposed to catch* and asserting it goes red. A test that only asserts the
current tree is green would pass just as happily against a runner that always returns 0.

Two layers:

* the four ADR-018 structural properties, exercised against synthetic checklists and
  registries, and
* each of the fifteen `STATIC` predicates, exercised against a throwaway copy of the real
  repository with a plausible mistake written into it.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
REPO = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

import check_hard_constraints_shim as runner
from hard_constraints import checks
from hard_constraints import parse as parse_mod
from hard_constraints import registry as reg
from hard_constraints.registry import Entry

# --------------------------------------------------------------------------- fixtures


@pytest.fixture
def spec(tmp_path: Path):
    """A minimal checklist file plus a helper to compute the ID of a gate line."""

    counter = iter(range(1000))

    def _write(*lines: str) -> Path:
        # A fresh filename each call. Reusing one path made an earlier version of
        # `test_rewording_a_gate_changes_its_id_and_goes_red` compare a file against itself,
        # so it passed vacuously.
        path = tmp_path / f"13-hard-constraints-{next(counter)}.md"
        path.write_text("# checklist\n\n" + "\n".join(lines) + "\n", encoding="utf-8")
        return path

    return _write


def gate_id_of(path: Path, index: int = 0) -> str:
    return parse_mod.parse(path)[index].gate_id


@pytest.fixture
def patched_registry(monkeypatch):
    """Swap the real registry for a synthetic one."""

    def _apply(entries: dict[str, Entry], closed: set[str] | None = None) -> None:
        monkeypatch.setattr(runner, "REGISTRY", entries, raising=True)
        monkeypatch.setattr(reg, "REGISTRY", entries, raising=True)
        monkeypatch.setattr(runner, "CLOSED_PHASES", frozenset(closed or {"Phase 0"}))

    return _apply


@pytest.fixture
def repo_copy(tmp_path: Path, monkeypatch) -> Path:
    """A throwaway copy of the repository, with every path constant repointed at it.

    Violations are planted here, never in the working tree.
    """
    dest = tmp_path / "repo"
    shutil.copytree(
        REPO,
        dest,
        ignore=shutil.ignore_patterns(".git", "node_modules", ".venv", "__pycache__"),
    )
    monkeypatch.setattr(checks, "REPO_ROOT", dest)
    monkeypatch.setattr(checks, "GUI_SRC", dest / "apps" / "gui" / "src")
    monkeypatch.setattr(checks, "GUI_PKG", dest / "apps" / "gui" / "package.json")
    monkeypatch.setattr(
        checks, "MW_SRC", dest / "services" / "middleware" / "src" / "ohgui_middleware"
    )
    monkeypatch.setattr(
        checks, "MW_PYPROJECT", dest / "services" / "middleware" / "pyproject.toml"
    )
    monkeypatch.setattr(checks, "PINS", dest / "docs" / "UPSTREAM_PINS.md")
    monkeypatch.setattr(checks, "LEDGER", dest / "PORTING_LEDGER.md")
    monkeypatch.setattr(checks, "EVIDENCE_ROOT", dest / "review" / "_sdk_src")
    monkeypatch.setattr(
        checks, "BUILD_ROOTS", (dest / "apps", dest / "services", dest / "bench")
    )
    return dest


# ------------------------------------------------------------ the tree as it stands


def test_real_tree_is_green():
    """Baseline. Meaningless alone — every test below is what gives it weight."""
    assert runner.run(colour=False, quiet=True) == 0


def test_every_registered_check_name_resolves():
    assert reg.validate_registry() == []


def test_registry_covers_the_spec_exactly():
    spec_ids = {g.gate_id for g in parse_mod.parse()}
    assert spec_ids == set(reg.REGISTRY), "spec and registry disagree"


# ------------------------------------------------ ADR-018 property 1: drift fails the build


def test_unregistered_gate_is_red(spec, patched_registry):
    path = spec("- [ ] A brand new requirement nobody has triaged.")
    patched_registry({})
    assert runner.run(path, colour=False, quiet=True) == 1


def test_orphaned_registry_entry_is_red(spec, patched_registry):
    path = spec("- [ ] A requirement.")
    patched_registry({gate_id_of(path): Entry("PHASE", owner="Phase 9"), "deadbeef01": Entry("PHASE", owner="Phase 9")})
    assert runner.run(path, colour=False, quiet=True) == 1


def test_rewording_a_gate_changes_its_id_and_goes_red(spec, patched_registry):
    original = spec("- [ ] Reject actions require a free-text reason.")
    entries = {gate_id_of(original): Entry("PHASE", owner="Phase 9")}
    patched_registry(entries)
    assert runner.run(original, colour=False, quiet=True) == 0

    reworded = spec("- [ ] Reject actions may omit a reason.")
    assert gate_id_of(reworded) != gate_id_of(original)
    assert runner.run(reworded, colour=False, quiet=True) == 1


def test_rewrapping_a_gate_does_not_change_its_id(spec, patched_registry):
    one_line = spec("- [ ] A requirement long enough that someone might rewrap it one day.")
    wrapped = spec(
        "- [ ] A requirement long enough that someone",
        "      might rewrap it one day.",
    )
    assert gate_id_of(one_line) == gate_id_of(wrapped)


# --------------------------------- ADR-018 property 2: a closed phase cannot leave a gate open


def test_gate_deferred_to_a_closed_phase_is_red(spec, patched_registry):
    path = spec("- [ ] Something Phase 0 was supposed to have done.")
    patched_registry({gate_id_of(path): Entry("PHASE", owner="Phase 0")}, closed={"Phase 0"})
    assert runner.run(path, colour=False, quiet=True) == 1


def test_the_same_gate_is_green_while_its_phase_is_open(spec, patched_registry):
    path = spec("- [ ] Something Phase 1 will do.")
    patched_registry({gate_id_of(path): Entry("PHASE", owner="Phase 1")}, closed={"Phase 0"})
    assert runner.run(path, colour=False, quiet=True) == 0


def test_closing_a_phase_turns_its_open_gates_red(spec, patched_registry):
    """The load-bearing case: closure is what converts deferral into a failure."""
    path = spec("- [ ] Something Phase 1 will do.")
    entry = {gate_id_of(path): Entry("PHASE", owner="Phase 1")}
    patched_registry(entry, closed={"Phase 0"})
    assert runner.run(path, colour=False, quiet=True) == 0
    patched_registry(entry, closed={"Phase 0", "Phase 1"})
    assert runner.run(path, colour=False, quiet=True) == 1


def test_phase_entry_without_an_owner_is_red(spec, patched_registry):
    path = spec("- [ ] A requirement.")
    patched_registry({gate_id_of(path): Entry("PHASE")})
    assert runner.run(path, colour=False, quiet=True) == 1


# ------------------------------------- ADR-018 property 3: a witness must name its artefact


def test_witness_without_an_artifact_is_red(spec, patched_registry):
    path = spec("- [ ] Something only a human can judge.")
    patched_registry({gate_id_of(path): Entry("WITNESS")})
    assert runner.run(path, colour=False, quiet=True) == 1


def test_witness_with_an_artifact_is_green(spec, patched_registry):
    path = spec("- [ ] Something only a human can judge.")
    patched_registry({gate_id_of(path): Entry("WITNESS", artifact="BUILD_LOG.md")})
    assert runner.run(path, colour=False, quiet=True) == 0


def test_static_entry_naming_an_unknown_check_is_red(spec, patched_registry):
    path = spec("- [ ] A requirement.")
    patched_registry({gate_id_of(path): Entry("STATIC", check="no_such_predicate")})
    assert runner.run(path, colour=False, quiet=True) == 1


# ---------------------------- ADR-018 property 4: retirement must be deliberate and attributed


def test_retired_entry_without_a_named_adr_is_red(spec, patched_registry):
    path = spec("- [ ] ~~An abandoned requirement.~~")
    patched_registry({gate_id_of(path): Entry("RETIRED")})
    assert runner.run(path, colour=False, quiet=True) == 1


def test_struck_gate_not_registered_retired_is_red(spec, patched_registry):
    path = spec("- [ ] ~~An abandoned requirement.~~")
    patched_registry({gate_id_of(path): Entry("PHASE", owner="Phase 9")})
    assert runner.run(path, colour=False, quiet=True) == 1


def test_live_gate_registered_retired_is_red(spec, patched_registry):
    """Guards the quiet failure mode: retiring a gate in code but not in the spec."""
    path = spec("- [ ] A requirement still in force.")
    patched_registry({gate_id_of(path): Entry("RETIRED", note="ADR-999")})
    assert runner.run(path, colour=False, quiet=True) == 1


def test_annotating_a_retirement_does_not_change_the_gate_id(spec):
    bare = spec("- [ ] ~~An abandoned requirement.~~")
    annotated = spec(
        "- [ ] ~~An abandoned requirement.~~ **RETIRED by ADR-999** because the",
        "      underlying field turned out not to be recoverable.",
    )
    assert gate_id_of(bare) == gate_id_of(annotated)


# ------------------------------------------------------------ the fifteen STATIC predicates


def _gui(repo: Path) -> Path:
    return repo / "apps" / "gui" / "src"


def _mw(repo: Path) -> Path:
    return repo / "services" / "middleware" / "src" / "ohgui_middleware"


def _edit_json(path: Path, mutate) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    mutate(data)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def test_no_framer_motion_catches_a_dependency(repo_copy):
    assert checks.no_framer_motion() is None
    _edit_json(
        repo_copy / "apps" / "gui" / "package.json",
        lambda d: d["dependencies"].update({"framer-motion": "^11.0.0"}),
    )
    assert checks.no_framer_motion() is not None


def test_no_framer_motion_catches_an_import(repo_copy):
    (_gui(repo_copy) / "Bad.tsx").write_text(
        "import { motion } from 'framer-motion'\nexport const X = motion.div\n", encoding="utf-8"
    )
    assert checks.no_framer_motion() is not None


def test_no_copypaste_libs_as_deps_catches_aceternity(repo_copy):
    assert checks.no_copypaste_libs_as_deps() is None
    _edit_json(
        repo_copy / "apps" / "gui" / "package.json",
        lambda d: d["dependencies"].update({"aceternity-ui": "^1.0.0"}),
    )
    assert checks.no_copypaste_libs_as_deps() is not None


def test_upstream_source_not_vendored_catches_a_forked_tree(repo_copy):
    assert checks.upstream_source_not_vendored() is None
    (repo_copy / "services" / "middleware" / "src" / "openhands").mkdir(parents=True)
    assert checks.upstream_source_not_vendored() is not None


def test_upstream_pinned_by_digest_catches_an_unpinned_image(repo_copy):
    assert checks.upstream_pinned_by_digest() is None
    pins = repo_copy / "docs" / "UPSTREAM_PINS.md"
    import re as _re

    pins.write_text(
        _re.sub(r"@sha256:[0-9a-f]{64}", ":latest", pins.read_text(encoding="utf-8")),
        encoding="utf-8",
    )
    assert checks.upstream_pinned_by_digest() is not None


def test_upstream_pinned_by_digest_catches_a_loosened_wheel(repo_copy):
    pyproject = repo_copy / "services" / "middleware" / "pyproject.toml"
    pyproject.write_text(
        pyproject.read_text(encoding="utf-8").replace("openhands-sdk==", "openhands-sdk>="),
        encoding="utf-8",
    )
    assert checks.upstream_pinned_by_digest() is not None


def test_policy_logic_not_in_browser_catches_an_invocation(repo_copy):
    assert checks.policy_logic_not_in_browser() is None
    (_gui(repo_copy) / "Bad.ts").write_text(
        "export const p = ConfirmRisky({ threshold: 'HIGH' })\n", encoding="utf-8"
    )
    assert checks.policy_logic_not_in_browser() is not None


def test_policy_logic_not_in_browser_ignores_prose(repo_copy):
    """The precision half. A checker with false positives gets switched off."""
    (_gui(repo_copy) / "Doc.tsx").write_text(
        "export const H = () => <p>Choosing <code>NeverConfirm()</code> disables prompts.</p>\n",
        encoding="utf-8",
    )
    assert checks.policy_logic_not_in_browser() is None


def test_ts_client_confined_catches_a_runtime_dependency(repo_copy):
    assert checks.ts_client_confined() is None
    _edit_json(
        repo_copy / "apps" / "gui" / "package.json",
        lambda d: d["dependencies"].update({"@openhands/typescript-client": "1.37.0"}),
    )
    assert checks.ts_client_confined() is not None


def test_ts_client_confined_catches_a_value_import(repo_copy):
    (_gui(repo_copy) / "Bad.ts").write_text(
        "import { Client } from '@openhands/typescript-client'\nexport const c = Client\n",
        encoding="utf-8",
    )
    assert checks.ts_client_confined() is not None


def test_no_identity_fields_catches_an_owner_column(repo_copy):
    assert checks.no_identity_fields() is None
    (_mw(repo_copy) / "bad.py").write_text("owner_id: str | None = None\n", encoding="utf-8")
    assert checks.no_identity_fields() is not None


def test_no_household_surface_catches_a_revived_concept(repo_copy):
    assert checks.no_household_surface() is None
    (_gui(repo_copy) / "Bad.ts").write_text("export const proficiency = 1\n", encoding="utf-8")
    assert checks.no_household_surface() is not None


def test_agent_server_dtos_generated_catches_a_hand_written_model(repo_copy):
    assert checks.agent_server_dtos_generated() is None
    (_mw(repo_copy) / "upstream" / "bad.py").write_text(
        "from pydantic import BaseModel\n\n\nclass ToolCall(BaseModel):\n    name: str\n",
        encoding="utf-8",
    )
    assert checks.agent_server_dtos_generated() is not None


def test_agent_server_dtos_generated_allows_generated_models(repo_copy):
    gen = _mw(repo_copy) / "upstream" / "_generated"
    gen.mkdir(parents=True, exist_ok=True)
    (gen / "models.py").write_text(
        "from pydantic import BaseModel\n\n\nclass ToolCall(BaseModel):\n    name: str\n",
        encoding="utf-8",
    )
    assert checks.agent_server_dtos_generated() is None


def test_no_nonexistent_stats_event_catches_a_reference(repo_copy):
    assert checks.no_nonexistent_stats_event() is None
    (_mw(repo_copy) / "bad.py").write_text(
        "handler = StatsConversationStateUpdateEvent\n", encoding="utf-8"
    )
    assert checks.no_nonexistent_stats_event() is not None


def test_ledger_records_native_basis_catches_a_missing_basis(repo_copy):
    assert checks.ledger_records_native_basis() is None
    ledger = repo_copy / "PORTING_LEDGER.md"
    ledger.write_text(
        ledger.read_text(encoding="utf-8")
        + "\n#### Some Adapter — VENDORED\n- **Source:** https://example.invalid\n"
        "- **Carries:** openhands event payloads\n",
        encoding="utf-8",
    )
    assert checks.ledger_records_native_basis() is not None


def _arm_provisional(repo: Path) -> None:
    """Set a provisionality flag back to True so the interlock has something to guard.

    `AUTHORIZE_REQUEST_PROVISIONAL` was legitimately cleared on 2026-08-08, which left this
    gate with nothing to fire on. The earlier version of this test asserted a red against the
    live tree and so began failing the moment the flag cleared - it was testing the tree's
    state, not the gate's behaviour. It now arms the condition itself.
    """
    (_mw(repo) / "provisional_mutant.py").write_text(
        "SOME_TYPE_PROVISIONAL = True\n", encoding="utf-8"
    )


def test_provisional_types_not_wired_catches_a_hook_install(repo_copy):
    """The interlock: while any type is provisional, no hook may be installable."""
    assert checks.provisional_types_not_wired() is None
    _arm_provisional(repo_copy)
    assert checks.provisional_types_not_wired() is None, "armed but no hook yet: still green"
    (_mw(repo_copy) / "bad.py").write_text(
        "def setup(conv):\n    conv.add_hook(HookType.COMMAND, cmd)\n", encoding="utf-8"
    )
    assert checks.provisional_types_not_wired() is not None


def test_provisional_types_not_wired_is_disarmed_only_by_the_flag(repo_copy):
    """A hook is fine once nothing is provisional - which is the tree's real state today.

    This is the half that proves the gate is not simply a ban on the word `add_hook`.
    """
    (_mw(repo_copy) / "bad.py").write_text(
        "def setup(conv):\n    conv.add_hook(HookType.COMMAND, cmd)\n", encoding="utf-8"
    )
    assert checks.provisional_types_not_wired() is None


def test_provisional_types_not_wired_ignores_a_cleared_flag(repo_copy):
    """`= False` must not arm it. The old prose-keyed version could not tell the difference."""
    (_mw(repo_copy) / "provisional_mutant.py").write_text(
        "SOME_TYPE_PROVISIONAL = False\n", encoding="utf-8"
    )
    (_mw(repo_copy) / "bad.py").write_text(
        "def setup(conv):\n    conv.add_hook(HookType.COMMAND, cmd)\n", encoding="utf-8"
    )
    assert checks.provisional_types_not_wired() is None


def test_provisional_types_not_wired_allows_a_hook_once_the_marker_clears(repo_copy):
    """The other half. A rule that can only ever say no is not a gate, it is a wall."""
    schema = _mw(repo_copy) / "ipc" / "schema.py"
    schema.write_text(
        schema.read_text(encoding="utf-8")
        .replace("PROVISIONAL \u2014 UNVERIFIED", "verified against agent-server 1.41.0")
        .replace("PROVISIONAL - UNVERIFIED", "verified against agent-server 1.41.0"),
        encoding="utf-8",
    )
    (_mw(repo_copy) / "bad.py").write_text(
        "def setup(conv):\n    conv.add_hook(HookType.COMMAND, cmd)\n", encoding="utf-8"
    )
    assert checks.provisional_types_not_wired() is None


def test_no_execute_tool_ui_path_catches_a_call(repo_copy):
    assert checks.no_execute_tool_ui_path() is None
    (_gui(repo_copy) / "Bad.ts").write_text(
        "export const go = () => conversation.executeTool(x)\n", encoding="utf-8"
    )
    assert checks.no_execute_tool_ui_path() is not None


def test_no_coauthored_by_trailer_catches_a_trailer(repo_copy):
    assert checks.no_coauthored_by_trailer() is None
    (_mw(repo_copy) / "bad.py").write_text(
        'TRAILER = "Co-authored-by: agent <agent@localhost>"\n', encoding="utf-8"
    )
    assert checks.no_coauthored_by_trailer() is not None


def test_no_phase_6_surface_catches_a_compare_mode(repo_copy):
    assert checks.no_phase_6_surface() is None
    (_gui(repo_copy) / "Bad.tsx").write_text(
        "export const CompareMode = () => null\n", encoding="utf-8"
    )
    assert checks.no_phase_6_surface() is not None


def test_no_shared_visibility_toggle_catches_a_relic(repo_copy):
    assert checks.no_shared_visibility_toggle() is None
    (_gui(repo_copy) / "Bad.ts").write_text("export const shareAll = true\n", encoding="utf-8")
    assert checks.no_shared_visibility_toggle() is not None


# ------------------------------------------------- ADR-026 extension-only posture (D5.1-D5.4)


def _evidence_pkg(repo: Path) -> Path:
    return repo / "review" / "_sdk_src" / "1.41.0" / "openhands_sdk-1.41.0"


def test_evidence_snapshot_not_imported_catches_a_build_source_reaching_for_it(repo_copy):
    """The snapshot is evidence. A build source that names it has started treating it as a dep."""
    assert checks.evidence_snapshot_not_imported() is None
    (_gui(repo_copy) / "Bad.ts").write_text(
        "import { HookDecision } from '../../../review/_sdk_src/1.41.0/x';\n", encoding="utf-8"
    )
    assert checks.evidence_snapshot_not_imported() is not None


def test_openhands_not_pinned_to_fork_catches_a_git_dependency(repo_copy):
    pyproject = repo_copy / "services" / "middleware" / "pyproject.toml"
    assert checks.openhands_not_pinned_to_fork() is None
    pyproject.write_text(
        pyproject.read_text(encoding="utf-8")
        + '\n[tool.mutant]\nopenhands-sdk = { git = "git+https://example.invalid/fork" }\n',
        encoding="utf-8",
    )
    assert checks.openhands_not_pinned_to_fork() is not None


def test_openhands_not_pinned_to_fork_catches_a_local_path(repo_copy):
    """The quieter half. A relative path is how a fork arrives without looking like one."""
    pyproject = repo_copy / "services" / "middleware" / "pyproject.toml"
    assert checks.openhands_not_pinned_to_fork() is None
    pyproject.write_text(
        pyproject.read_text(encoding="utf-8")
        + '\n[tool.mutant]\nopenhands-sdk = { path = "../../vendor/openhands-sdk" }\n',
        encoding="utf-8",
    )
    assert checks.openhands_not_pinned_to_fork() is not None


def test_evidence_snapshot_matches_upstream_catches_an_edited_file(repo_copy):
    target = _evidence_pkg(repo_copy) / "openhands" / "sdk" / "hooks" / "types.py"
    assert checks.evidence_snapshot_matches_upstream() is None
    target.write_text(target.read_text(encoding="utf-8") + "\n# helpfully clarified\n", "utf-8")
    assert checks.evidence_snapshot_matches_upstream() is not None


def test_evidence_snapshot_matches_upstream_catches_an_unrecorded_addition(repo_copy):
    """An added file passes a per-file hash loop. The manifest is a set, not just a checksum."""
    assert checks.evidence_snapshot_matches_upstream() is None
    (_evidence_pkg(repo_copy) / "helper.py").write_text("x = 1\n", encoding="utf-8")
    assert checks.evidence_snapshot_matches_upstream() is not None


def test_evidence_snapshot_matches_upstream_catches_a_deletion(repo_copy):
    assert checks.evidence_snapshot_matches_upstream() is None
    (_evidence_pkg(repo_copy) / "openhands" / "sdk" / "hooks" / "types.py").unlink()
    assert checks.evidence_snapshot_matches_upstream() is not None


def test_evidence_snapshot_matches_upstream_catches_a_missing_manifest(repo_copy):
    """Without this, deleting the manifest would be the cheapest way to silence the gate."""
    assert checks.evidence_snapshot_matches_upstream() is None
    (repo_copy / "review" / "_sdk_src" / "1.41.0" / "MANIFEST.sha256").unlink()
    assert checks.evidence_snapshot_matches_upstream() is not None


def test_cited_evidence_paths_resolve_catches_a_missing_file(repo_copy):
    assert checks.cited_evidence_paths_resolve() is None
    (repo_copy / "adrs" / "ADR-999-mutant.md").write_text(
        "See `review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/hooks/nope.py:12`.\n",
        encoding="utf-8",
    )
    assert checks.cited_evidence_paths_resolve() is not None


def test_cited_evidence_paths_resolve_catches_a_line_past_end_of_file(repo_copy):
    """The defect worth catching. Re-vendor at a new version and every path still exists."""
    assert checks.cited_evidence_paths_resolve() is None
    (repo_copy / "adrs" / "ADR-999-mutant.md").write_text(
        "See `review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/hooks/types.py:99999`.\n",
        encoding="utf-8",
    )
    assert checks.cited_evidence_paths_resolve() is not None


# ------------------------------------- ADR-015 amendment 2 (PRESENT-BUT-UNCONSUMED fields)


def test_unconsumed_native_fields_not_wired_catches_a_gui_reference(repo_copy):
    """`allowed_tools` exists upstream and nothing upstream reads it. Neither may we."""
    assert checks.unconsumed_native_fields_not_wired() is None
    (_gui(repo_copy) / "Bad.ts").write_text(
        "export const allowlist = skill.allowed_tools ?? [];\n", encoding="utf-8"
    )
    assert checks.unconsumed_native_fields_not_wired() is not None


def test_unconsumed_native_fields_not_wired_catches_a_middleware_reference(repo_copy):
    assert checks.unconsumed_native_fields_not_wired() is None
    (_mw(repo_copy) / "bad.py").write_text(
        "def gate(skill):\n    return skill.allowed_tools\n", encoding="utf-8"
    )
    assert checks.unconsumed_native_fields_not_wired() is not None


# -------------------------------------------------------------- ADR-028 living specs


def test_spec_requirements_have_ids_catches_a_removed_id(repo_copy):
    """A list requirement without its stable marker must turn the corpus gate red."""
    spec = repo_copy / "docs" / "specs" / "03-layout.md"
    spec.write_text(
        spec.read_text(encoding="utf-8").replace(" <!-- [REQ-03-001] -->", "", 1),
        encoding="utf-8",
    )
    assert checks.spec_requirements_have_ids() is not None


def test_spec_coverage_register_is_current_catches_a_missing_row(repo_copy):
    """A declared ID cannot be omitted from the generated coverage register."""
    register = repo_copy / "docs" / "specs" / "COVERAGE.md"
    lines = register.read_text(encoding="utf-8").splitlines()
    register.write_text(
        "\n".join(line for line in lines if not line.startswith("| REQ-03-001 |")) + "\n",
        encoding="utf-8",
    )
    assert checks.spec_coverage_register_is_current() is not None


def test_spec_coverage_evidence_resolves_catches_a_line_past_end(repo_copy):
    """An IMPLEMENTED claim cannot cite a plausible-looking but nonexistent source line."""
    register = repo_copy / "docs" / "specs" / "COVERAGE.md"
    text = register.read_text(encoding="utf-8")
    mutated, n = re.subn(
        r"scripts/hard_constraints/checks\.py:\d+",
        "scripts/hard_constraints/checks.py:999999",
        text,
        count=1,
    )
    assert n == 1
    register.write_text(mutated, encoding="utf-8")
    assert checks.spec_coverage_evidence_resolves() is not None


def test_spec_cross_references_resolve_catches_a_dangling_document(repo_copy):
    """A new relative Markdown document link must not point at a nonexistent file."""
    (repo_copy / "docs" / "specs" / "ADR-028-mutant.md").write_text(
        "[missing register](COVERAGE-forge-oh.md)\n", encoding="utf-8"
    )
    assert checks.spec_cross_references_resolve() is not None


def test_a_cited_adr_number_that_was_never_written_is_caught(repo_copy):
    """Prose cites ADR numbers far more often than it links them.

    Five ADR filenames were fabricated in one working session. A citation to a number nobody wrote
    reads as provenance and carries none, so the number itself is gated, not just the link.
    """
    (repo_copy / "BUILD_LOG.md").write_text(
        "## entry\n\n- ratified by ADR-099.\n", encoding="utf-8"
    )
    assert checks.spec_cross_references_resolve() is not None


def test_an_unindexed_adr_is_caught(repo_copy):
    """An ADR that is filed but not indexed stops being findable."""
    (repo_copy / "adrs" / "ADR-901-mutant.md").write_text("# ADR-901\n", encoding="utf-8")
    assert checks.spec_cross_references_resolve() is not None


def test_an_index_row_with_no_file_is_caught(repo_copy):
    index = repo_copy / "adrs" / "README.md"
    index.write_text(index.read_text(encoding="utf-8") + "| ADR-902 | phantom | Ratified |\n",
                     encoding="utf-8")
    assert checks.spec_cross_references_resolve() is not None


def test_an_adr_number_attributed_to_a_donor_by_name_is_exempt(repo_copy):
    """Our own logs discuss donor ADR numbers, and saying so truthfully is not a dangling ref."""
    donor = repo_copy / "docs" / "donor-specs" / "forge-oh"
    donor.mkdir(parents=True, exist_ok=True)
    (donor / "keep.md").write_text("x\n", encoding="utf-8")
    (repo_copy / "BUILD_LOG.md").write_text(
        "## entry\n\n- Forge-OH's ADR-074 is Forge-OH's, not ours.\n", encoding="utf-8"
    )
    assert checks.spec_cross_references_resolve() is None


def test_an_unattributed_number_is_still_caught_beside_a_donor_line(repo_copy):
    """The exemption is per-line, so it cannot launder a fabrication elsewhere in the file."""
    donor = repo_copy / "docs" / "donor-specs" / "forge-oh"
    donor.mkdir(parents=True, exist_ok=True)
    (donor / "keep.md").write_text("x\n", encoding="utf-8")
    (repo_copy / "BUILD_LOG.md").write_text(
        "## entry\n\n- Forge-OH's ADR-074 is theirs.\n- ratified by ADR-099.\n", encoding="utf-8"
    )
    assert checks.spec_cross_references_resolve() is not None


def test_a_backticked_number_in_a_log_is_a_mention_not_a_citation(repo_copy):
    """A BUILD_LOG entry describing this gate must be able to write down what the gate rejects."""
    (repo_copy / "BUILD_LOG.md").write_text(
        "## entry\n\n- a bogus `ADR-099` is now red.\n", encoding="utf-8"
    )
    assert checks.spec_cross_references_resolve() is None


def test_the_same_number_unquoted_in_a_log_is_still_a_citation(repo_copy):
    (repo_copy / "BUILD_LOG.md").write_text(
        "## entry\n\n- ratified by ADR-099.\n", encoding="utf-8"
    )
    assert checks.spec_cross_references_resolve() is not None


def test_specs_get_no_backtick_escape(repo_copy):
    """In a spec a citation is load-bearing whether or not someone put backticks around it."""
    (repo_copy / "docs" / "specs" / "77-mutant.md").write_text(
        "See `ADR-099` for the rationale.\n", encoding="utf-8"
    )
    assert checks.spec_cross_references_resolve() is not None


def test_donor_specs_keep_their_own_adr_numbering(repo_copy):
    """Forge-OH's ADR-074 is a real decision of Forge-OH's, not a dangling reference to ours.

    Without this exemption the gate fires on every donor document and gets switched off.
    """
    donor = repo_copy / "docs" / "donor-specs" / "forge-oh"
    donor.mkdir(parents=True, exist_ok=True)
    (donor / "mutant.md").write_text("Superseded by ADR-074.\n", encoding="utf-8")
    assert checks.spec_cross_references_resolve() is None


# ---------------------------------------------------------------------------- coverage


def test_every_static_check_has_a_mutation_test():
    """Stops a predicate being added without a test proving it can fail."""
    source = Path(__file__).read_text(encoding="utf-8")
    untested = [name for name in checks.REGISTRY_CHECKS if f"checks.{name}()" not in source]
    assert untested == [], f"STATIC predicates with no mutation test: {untested}"


def test_verify_local_does_not_hardcode_a_gate_count():
    """A verification banner must not state a count it cannot keep true.

    `verify-local.sh` said "all 71 gates" while the runner beneath it printed 72, because
    ADR-021 added one. Harmless in itself, but it is exactly the failure this gate exists to
    catch — a claim that has come unmoored from the thing it describes — printed at the top of
    the output that certifies the tree is honest. The count belongs to the runner.
    """
    text = (SCRIPTS / "verify-local.sh").read_text(encoding="utf-8")
    banner = [
        line
        for line in text.splitlines()
        if not line.lstrip().startswith("#") and re.search(r"\ball \d+ gates\b", line)
    ]
    assert banner == [], f"hardcoded gate count in verify-local.sh: {banner}"
