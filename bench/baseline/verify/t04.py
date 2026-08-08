"""t04 — NoteStore.search case-insensitive, signature unchanged."""
import inspect
from notes_api.store import NoteStore

def test_case_insensitive():
    s = NoteStore()
    s.add("Hello World", "Body Text", [])
    assert len(s.search("hello")) == 1
    assert len(s.search("HELLO")) == 1
    assert len(s.search("body")) == 1

def test_signature_unchanged():
    params = list(inspect.signature(NoteStore.search).parameters)
    assert params == ["self", "term"], f"signature changed: {params}"
