# t01 — Add a DELETE endpoint

Add `DELETE /notes/{note_id}` to `notes_api/app.py`. It must return 404 when the note does not
exist and a 204-equivalent success otherwise. Add a test for both cases.

Category: additive feature, single file plus test.
