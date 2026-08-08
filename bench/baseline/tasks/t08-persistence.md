# t08 — Persist to disk

Replace in-memory storage with JSON-file persistence at the path in the `NOTES_API_DB`
environment variable, defaulting to the current in-memory behavior when unset. All existing tests must still pass.

Category: larger change, touches every layer. Expect this one to be hard.
