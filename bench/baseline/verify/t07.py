"""t07 — PATCH /notes/{id} partial update; unspecified fields preserved; 404 on missing."""
from fastapi.testclient import TestClient
from notes_api.app import app

c = TestClient(app)

def test_patch_preserves_unspecified_fields():
    nid = c.post("/notes", json={"title": "orig", "body": "keep", "tags": ["k"]}).json()["id"]
    r = c.patch(f"/notes/{nid}", json={"title": "new"})
    assert r.status_code == 200, f"patch returned {r.status_code}"
    got = c.get(f"/notes/{nid}").json()
    assert got["title"] == "new"
    assert got["body"] == "keep", "unspecified body was clobbered"
    assert got["tags"] == ["k"], "unspecified tags were clobbered"

def test_patch_missing_is_404():
    assert c.patch("/notes/987654", json={"title": "x"}).status_code == 404
