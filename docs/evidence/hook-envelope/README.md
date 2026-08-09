# Captured `pre_tool_use` envelope — ADR-014 verification item 5

`envelope.json` is written by `scripts/capture-hook-envelope.sh`, from the pinned image.
**A file in here that was hand-edited is not evidence.** Regenerate; do not patch.

## How it is obtained

`ghcr.io/openhands/agent-server@sha256:f0244fd7…` contains no importable Python package tree
and no interpreter on `PATH` — just one 112 MB stripped PyInstaller binary at
`/usr/local/bin/openhands-agent-server`. So the harness:

1. copies that binary out of the image (by digest),
2. parses its PyInstaller CArchive to reach the embedded `PYZ.pyz`,
3. unmarshals `openhands.sdk.hooks.{types,executor,manager,conversation_hooks,config}`,
4. proves each matches the pinned upstream sdist (`openhands_sdk-1.41.0`, sha256 verified),
5. **executes the image's own `HookEvent`** to serialize `example_payload` and `fields`.

Step 5 runs the shipped bytecode rather than the sdist, so the recorded envelope has no
inferential step left in it.

## What it proves, and what it does not

Proves: the **shape** of the envelope the pinned image defines — field names, annotations,
nullability, and the fact that `model_dump_json` keeps nulls so all eight keys are always sent.

Does not prove: that a live agent-server populates those fields as expected during a real tool
call. ADR-014 verification items 1-4 need a running agent and are unrun.

## Consumers

- `scripts/diff_envelope.py` — fails on any mismatch with `AuthorizeRequest`.
- `services/middleware/tests/test_provisional_marker.py` — the flag may only be cleared while
  this file exists and agrees with the model.
- `services/middleware/tests/test_real_envelope.py` — drives the middleware with the recorded
  payload.
