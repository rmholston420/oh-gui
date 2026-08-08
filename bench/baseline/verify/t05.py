"""t05 — empty / whitespace-only title rejected with 422."""
import pytest
from fastapi.testclient import TestClient
from notes_api.app import app

c = TestClient(app)

@pytest.mark.parametrize("bad", ["", "   ", "\t\n"])
def test_empty_title_rejected(bad):
    r = c.post("/notes", json={"title": bad, "body": "b", "tags": []})
    assert r.status_code == 422, f"title {bad!r} accepted with {r.status_code}"

def test_valid_title_still_works():
    assert c.post("/notes", json={"title": "ok", "body": "b", "tags": []}).status_code == 200
