"""Tier assignment for every gate in `docs/specs/13-hard-constraints.md` (ADR-018).

Keys are the ten-hex-digit gate IDs emitted by `parse.py` — a truncated SHA-256 of the
normalized gate text. Rewording a gate changes its ID and turns the runner red until the
gate is consciously re-registered. That is the intended behaviour, not a bug: a requirement
whose wording changed is a requirement someone should look at again.

Tiers
-----
`STATIC`   — a named predicate in `checks.py` runs against the tree now.
`PHASE`    — the surface does not exist yet; `owner` names the phase that must prove it.
`WITNESS`  — no mechanical test is possible; `artifact` names where the observation is recorded.
`RETIRED`  — struck in the spec; `note` names the ADR that retired it.
"""

from __future__ import annotations

from dataclasses import dataclass

from .checks import REGISTRY_CHECKS

#: Phases recorded as closed in `BUILD_LOG.md`. A `PHASE` gate owned by one of these is a
#: hard failure — ADR-018 property 2. This is the clause that stops deferral becoming
#: disposal, so it must be updated only when a phase genuinely closes.
CLOSED_PHASES: frozenset[str] = frozenset({"Phase 0"})


@dataclass(frozen=True)
class Entry:
    tier: str
    owner: str | None = None
    check: str | None = None
    artifact: str | None = None
    note: str | None = None


def _s(check: str) -> Entry:
    return Entry(tier="STATIC", check=check)


def _p(owner: str, note: str | None = None) -> Entry:
    return Entry(tier="PHASE", owner=owner, note=note)


def _w(artifact: str, owner: str | None = None, note: str | None = None) -> Entry:
    return Entry(tier="WITNESS", owner=owner, artifact=artifact, note=note)


WALKTHROUGH = "operator-witnessed headed Playwright walkthrough, recorded in BUILD_LOG.md"

REGISTRY: dict[str, Entry] = {
    # ---------------------------------------------------------------- base checklist
    "1862573123": _s("no_execute_tool_ui_path"),
    "5f29af6cd5": _p("Phase 1"),
    "38e004cd82": _p("Phase 1"),
    "6a378a67f8": _p("Phase 1", "ADR-006: elevates to HIGH, not MEDIUM"),
    "9d10fa8d8d": _p("Phase 1"),
    "ed3c7d3bdf": Entry(
        tier="RETIRED",
        note=(
            "ADR-015 Status amendment. Analyzer identity is not recoverable: "
            "SecurityAnalyzerBase.security_risk() returns a bare enum and "
            "EnsembleSecurityAnalyzer discards child attribution at the return boundary. "
            "Spec 04 §4.2 already removed it; this gate demanded what ADR-015 proved "
            "cannot be supplied."
        ),
    ),
    "9ebc53f8df": _p("Phase 1"),
    "e89b05b0d0": _p("Phase 1", "record side per ADR-020"),
    "6322950de5": _p("Phase 5"),
    "eb87b1a6d5": _s("no_nonexistent_stats_event"),
    "cb389cb3e2": _p("Phase 1", "§8.1 telemetry seed"),
    "276f436ed0": _w(
        "diff benchmark report (four gates) plus operator timing record for the fifth",
        owner="Phase 2",
        note="four perf gates are measurable; the comprehension gate is human-timed",
    ),
    "2d3c5da106": _w(WALKTHROUGH, owner="Phase 2", note="visual weight has no mechanical test"),
    "2f1a19477f": _p("Phase 2", "§6.5"),
    "1869907f75": _s("no_coauthored_by_trailer"),
    "dba76e1e84": _p("Phase 4"),
    "bd62cc12fd": _p("Phase 4"),
    "6a2b853892": _p("Phase 3"),
    "f0b98fdb94": _p("Phase 3"),
    "3e2cd19946": Entry(tier="RETIRED", note="ADR-001 — extend-in-place retired"),
    "31db934746": _p("Phase 1", "§4.11 / §8.3"),
    "84502c2ab7": _p("Phase 2", "§6.10"),
    "bff4ee6022": _p("Phase 1"),
    "f13df51d2b": _p("Phase 5", "Context Inspector half; see ADR-020"),
    "8f5e977eb2": _p("Phase 3"),
    "511048a366": _p("Phase 1", "§6.4.1"),
    "b897f98382": _p("Phase 1", "§8.5"),
    "685ead09a4": _p("Phase 4"),
    # 861e753d64 was this gate's pre-ADR-022 wording. ADR-022 rewrote the line to name the
    # 900px breakpoint explicitly, which changed the hash. The requirement did not change owner,
    # so the new id inherits Phase 1 rather than being re-argued.
    "52fa900820": _p("Phase 1", "reworded by ADR-022; was 861e753d64"),
    "9f90f0abcb": _p("Phase 1", "lens mechanism added to Phase 1 by ADR-017"),
    "fe4db434ff": _p("Phase 5"),
    "651484fb0d": _p("Phase 5"),
    "1e4c4e489c": _p("Phase 1", "lens mechanism, ADR-017"),
    "f3c40d285e": _p("Phase 1", "lens mechanism, ADR-017"),
    "e9156f6ad9": _p(
        "Phase 1",
        "fields the §8.6 reliability tier reads must exist in Phase 1; the full profile "
        "surface is Phase 5",
    ),
    "05b082017e": _p("Phase 1", "§8.5"),
    "5367b15573": _p("Phase 1", "§8.6"),
    "4231610ab9": _p("Phase 1", "§8.6"),
    "a881c89467": _p("Phase 3", "ADR-017 split"),
    "366cd41a3d": _s("no_phase_6_surface"),
    "6e695ffec9": _p("Phase 1", "§6.4.2"),
    # -------------------------------------------------------------------- v4.0 additions
    "e235b076a0": _p("Phase 1", "04a §4.9.1; primitive scope fixed by ADR-019"),
    "e8c06e1085": _p("Phase 1", "writes into the ADR-020 provenance shape"),
    "0165d56128": _p("Phase 1"),
    "2c8a1db3c1": _p("Phase 1"),
    "2e3fe7334a": _s("no_framer_motion"),
    "e0fb595df5": _s("no_copypaste_libs_as_deps"),
    "0b4b4daf0e": _p("Phase 3", "ADR-017: field + read path land in Phase 1, UI in Phase 3"),
    "615c21b86d": _s("no_shared_visibility_toggle"),
    "a49e71a8f1": _w(WALKTHROUGH, note="one pass per lens, per phase exit"),
    # -------------------------------------------------------------------- v4.2 additions
    "97f8749dd3": _s("upstream_source_not_vendored"),
    "c567f44e59": _s("upstream_pinned_by_digest"),
    "3dac335d62": _w("a PORTING_LEDGER.md entry, or a recorded decision not to vendor"),
    "8c8a27c55f": _s("policy_logic_not_in_browser"),
    "f4cc6a5806": _p("Phase 1", "no frontend network layer exists yet to check"),
    "bfd22f4af8": _s("ts_client_confined"),
    # -------------------------------------------------------------------- v4.3 additions
    "d1df4834f1": _s("no_identity_fields"),
    "b6acbf1a4f": _s("no_household_surface"),
    "138fe74899": _p("Phase 1"),
    "8fa0716a72": _p("Phase 1"),
    "72e3ceedb1": _w(WALKTHROUGH, note="one pass per lens, per phase exit"),
    # -------------------------------------------------------------------- v4.4 additions
    "0c1a82d540": _p("Phase 1", "ADR-021: AuthorizeRequest is PROVISIONAL until verified"),
    "f8e58eea83": _p("Phase 1"),
    "00656cb32d": _p("Phase 1"),
    "597baab62b": _p("Phase 1"),
    "e4e7c6dd57": _p("Phase 1", "null vs empty must be distinguishable; ADR-020"),
    "a075a1d62a": _w("mutation-test records in BUILD_LOG.md, one per shipped control"),
    "e957dd6a34": _s("agent_server_dtos_generated"),
    "09b2b464ff": _p("Phase 1", "§8.0–8.1 telemetry seed"),
    "2a7092a810": _p("Phase 1", "trust-dial.ts is the outstanding mirror"),
    "4b7a517724": _s("ledger_records_native_basis"),
    # -------------------------------------------------------------------- v4.5 additions
    "2b305a5b8a": _s("provisional_types_not_wired"),
    # ---- ADR-026 (extension-only posture). All four are STATIC: each is decidable from the
    # working tree alone, so none of them may be deferred to a phase.
    "1acdd1a4d7": _s("evidence_snapshot_not_imported"),
    "43049c8f68": _s("openhands_not_pinned_to_fork"),
    "ba75ea5a14": _s("evidence_snapshot_matches_upstream"),
    "4b173c05b1": _s("cited_evidence_paths_resolve"),
    # ---- ADR-015 amendment 2 (PRESENT-BUT-UNCONSUMED).
    "e2fbb01781": _s("unconsumed_native_fields_not_wired"),
}


def validate_registry() -> list[str]:
    """Structural problems with the registry itself, independent of the spec file."""
    problems: list[str] = []
    for gate_id, entry in REGISTRY.items():
        if entry.tier == "STATIC":
            if not entry.check:
                problems.append(f"{gate_id}: STATIC with no check named")
            elif entry.check not in REGISTRY_CHECKS:
                problems.append(f"{gate_id}: names unknown check {entry.check!r}")
        elif entry.tier == "PHASE":
            if not entry.owner:
                problems.append(f"{gate_id}: PHASE with no owning phase")
        elif entry.tier == "WITNESS":
            if not entry.artifact:
                problems.append(f"{gate_id}: WITNESS with no artifact named")
        elif entry.tier == "RETIRED":
            if not entry.note:
                problems.append(f"{gate_id}: RETIRED with no retiring ADR named")
        else:
            problems.append(f"{gate_id}: unknown tier {entry.tier!r}")
    return problems


def unused_checks() -> list[str]:
    """Predicates defined in `checks.py` that no gate claims.

    Reported yellow rather than red: dead code is worth surfacing, but it does not mean a
    requirement is going unenforced, which is the only thing this runner fails builds over.
    """
    return sorted(set(REGISTRY_CHECKS) - {e.check for e in REGISTRY.values() if e.check})
