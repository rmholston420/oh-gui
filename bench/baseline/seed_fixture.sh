#!/usr/bin/env bash
# Seed the deterministic fixture repository the Phase 0 baseline tasks operate on.
#
# Why a fixture and not real project code: 02-repo-setup.md item 5 asks for the SAME
# representative tasks to be re-runnable later against OH-GUI, so Phase 0 numbers and Phase N
# numbers can be compared. A moving target (this repo, mid-build) would make that comparison
# meaningless. The fixture is small, self-contained, has a real test suite, and is recreated
# byte-identically by this script.
#
# Destroy and reseed freely: it is never a build input.
set -euo pipefail
FIXTURE="${OH_GUI_FIXTURE:-$HOME/.oh-gui/baseline/fixture}"

[ -d "$FIXTURE" ] && { chmod -R u+w "$FIXTURE"; rm -rf "$FIXTURE"; }
mkdir -p "$FIXTURE"/{notes_api,tests}
cd "$FIXTURE"

cat > notes_api/__init__.py <<'PY'
PY

cat > notes_api/store.py <<'PY'
"""In-memory note storage."""
from dataclasses import dataclass, field
from itertools import count


@dataclass
class Note:
    id: int
    title: str
    body: str
    tags: list[str] = field(default_factory=list)


class NoteStore:
    def __init__(self) -> None:
        self._notes: dict[int, Note] = {}
        self._ids = count(1)

    def add(self, title: str, body: str, tags: list[str] | None = None) -> Note:
        note = Note(id=next(self._ids), title=title, body=body, tags=list(tags or []))
        self._notes[note.id] = note
        return note

    def get(self, note_id: int) -> Note | None:
        return self._notes.get(note_id)

    def list(self) -> list[Note]:
        return list(self._notes.values())

    def delete(self, note_id: int) -> bool:
        return self._notes.pop(note_id, None) is not None

    def search(self, term: str) -> list[Note]:
        # Case-sensitive on purpose. Task t04 asks for this to be fixed.
        return [n for n in self._notes.values() if term in n.title or term in n.body]
PY

cat > notes_api/app.py <<'PY'
"""Minimal FastAPI surface over NoteStore."""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .store import NoteStore

app = FastAPI(title="notes-api")
store = NoteStore()


class NoteIn(BaseModel):
    title: str
    body: str
    tags: list[str] = []


@app.post("/notes")
def create_note(payload: NoteIn) -> dict:
    note = store.add(payload.title, payload.body, payload.tags)
    return {"id": note.id, "title": note.title, "body": note.body, "tags": note.tags}


@app.get("/notes/{note_id}")
def read_note(note_id: int) -> dict:
    note = store.get(note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="note not found")
    return {"id": note.id, "title": note.title, "body": note.body, "tags": note.tags}


@app.get("/notes")
def list_notes() -> list[dict]:
    return [{"id": n.id, "title": n.title, "body": n.body, "tags": n.tags} for n in store.list()]
PY

cat > tests/test_store.py <<'PY'
from notes_api.store import NoteStore


def test_add_and_get():
    s = NoteStore()
    n = s.add("hello", "world")
    assert s.get(n.id) is not None
    assert s.get(n.id).title == "hello"


def test_delete():
    s = NoteStore()
    n = s.add("a", "b")
    assert s.delete(n.id) is True
    assert s.delete(n.id) is False


def test_search_finds_body_match():
    s = NoteStore()
    s.add("title", "needle in body")
    assert len(s.search("needle")) == 1
PY

cat > tests/test_app.py <<'PY'
from fastapi.testclient import TestClient

from notes_api.app import app

client = TestClient(app)


def test_create_and_read():
    r = client.post("/notes", json={"title": "t", "body": "b", "tags": ["x"]})
    assert r.status_code == 200
    note_id = r.json()["id"]
    assert client.get(f"/notes/{note_id}").json()["title"] == "t"


def test_missing_note_is_404():
    assert client.get("/notes/99999").status_code == 404
PY

cat > requirements.txt <<'PY'
fastapi
pytest
httpx
PY

cat > README.md <<'MD'
# notes-api (baseline fixture)

Deliberately small, deliberately imperfect. Seeded by
`bench/baseline/seed_fixture.sh` in the OH-GUI repo and recreated identically on demand.
Not a real project; do not fix things here outside a baseline task.
MD

cat > .gitignore <<'MD'
__pycache__/
*.pyc
.venv/
.pytest_cache/
MD

git init -q -b main
git -c user.name="oh-gui-baseline" -c user.email="baseline@localhost" add -A
git -c user.name="oh-gui-baseline" -c user.email="baseline@localhost" \
    commit -q -m "Seed notes-api baseline fixture"
echo "fixture seeded at $FIXTURE ($(git rev-parse --short HEAD))"
