"""t06 — an abstract storage interface exists and NoteStore implements it.

Deliberately name-agnostic: any ABC in notes_api that NoteStore inherits from counts.
"""
import abc, inspect, pkgutil, importlib
import notes_api
from notes_api.store import NoteStore

def _abcs():
    found = []
    for m in pkgutil.iter_modules(notes_api.__path__):
        mod = importlib.import_module(f"notes_api.{m.name}")
        for _, obj in inspect.getmembers(mod, inspect.isclass):
            if obj is not NoteStore and isinstance(obj, abc.ABCMeta) and getattr(
                obj, "__abstractmethods__", None) is not None:
                found.append(obj)
    return found

def test_notestore_implements_an_abstract_base():
    bases = [b for b in _abcs() if issubclass(NoteStore, b) and b is not object]
    assert bases, "no abstract base class that NoteStore implements was found in notes_api"

def test_the_base_is_actually_abstract():
    bases = [b for b in _abcs() if issubclass(NoteStore, b)]
    assert any(getattr(b, "__abstractmethods__", frozenset()) or
               any(getattr(getattr(b, n, None), "__isabstractmethod__", False) for n in dir(b))
               for b in bases), "base declares no abstract methods"
