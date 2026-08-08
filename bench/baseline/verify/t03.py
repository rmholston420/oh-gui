"""t03 — GET /notes?tag=x filters; absent param returns everything."""
from fastapi.testclient import TestClient
from notes_api.app import app

c = TestClient(app)

def test_tag_filter():
    c.post("/notes", json={"title": "x", "body": "b", "tags": ["alpha"]})
    c.post("/notes", json={"title": "y", "body": "b", "tags": ["beta"]})
    got = c.get("/notes", params={"tag": "alpha"}).json()
    assert len(got) >= 1, "tag filter returned nothing"
    assert all("alpha" in n["tags"] for n in got), f"filter leaked non-matching notes: {got}"
    assert len(c.get("/notes").json()) >= 2, "absent tag param must return everything"
