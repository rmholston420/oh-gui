# t08 — Persist to disk

Replace in-memory storage with JSON-file persistence at a path taken from an environment variable,
defaulting to the current behavior when unset. All existing tests must still pass.

Category: larger change, touches every layer. Expect this one to be hard.
