"""t01 — DELETE /notes/{id}: 404 when absent, success otherwise."""
from fastapi.testclient import TestClient
from notes_api.app import app

c = TestClient(app)

def test_delete_removes_the_note():
    nid = c.post("/notes", json={"title": "a", "body": "b", "tags": []}).json()["id"]
    r = c.delete(f"/notes/{nid}")
    assert r.status_code in (200, 202, 204), f"delete returned {r.status_code}"
    assert c.get(f"/notes/{nid}").status_code == 404, "note still readable after delete"

def test_delete_missing_is_404():
    assert c.delete("/notes/987654").status_code == 404
