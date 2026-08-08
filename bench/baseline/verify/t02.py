"""t02 — red-green: search must end up case-insensitive."""
from notes_api.store import NoteStore

def test_search_is_case_insensitive():
    s = NoteStore()
    s.add("Hello World", "body", [])
    assert [n.title for n in s.search("hello")] == ["Hello World"]
    assert [n.title for n in s.search("HELLO")] == ["Hello World"]

def test_search_still_matches_body():
    s = NoteStore()
    s.add("t", "Needle in here", [])
    assert len(s.search("needle")) == 1
