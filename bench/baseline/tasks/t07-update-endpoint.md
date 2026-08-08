# t07 — Partial update

Add `PATCH /notes/{note_id}` accepting any subset of title, body, tags. Unspecified fields keep
their values. 404 on missing note. Tests required.

Category: multi-step feature with edge cases.
