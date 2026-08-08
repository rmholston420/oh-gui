"""t08 — JSON persistence at NOTES_API_DB; in-memory default when unset."""
import importlib, json, os, sys

def _fresh():
    for m in [m for m in sys.modules if m.startswith("notes_api")]:
        del sys.modules[m]
    return importlib.import_module("notes_api.store")

def test_survives_a_new_store_instance(tmp_path, monkeypatch):
    db = tmp_path / "notes.json"
    monkeypatch.setenv("NOTES_API_DB", str(db))
    s = _fresh().NoteStore()
    s.add("persisted", "body", ["t"])
    assert db.exists(), "NOTES_API_DB path was never written"
    json.loads(db.read_text())
    again = _fresh().NoteStore()
    assert [n.title for n in again.list_all()] == ["persisted"], "note did not survive reload"

def test_unset_env_stays_in_memory(monkeypatch):
    monkeypatch.delenv("NOTES_API_DB", raising=False)
    s = _fresh().NoteStore()
    s.add("ephemeral", "b", [])
    again = _fresh().NoteStore()
    assert [n.title for n in again.list_all()] == [], "state leaked without NOTES_API_DB set"
