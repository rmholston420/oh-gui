# Acceptance gates

One file per task. Copied into the fixture root AFTER the agent stops, run with pytest, then
deleted. The agent never sees them.

**Every gate here must FAIL on the pristine fixture.** That is enforced by
`tests/test_gates_fail_on_pristine.py`, which seeds a clean fixture and asserts each gate fails.
A gate that passes on pristine code cannot distinguish a model that did the work from a model that
did nothing — which is exactly what happened in the first matrix, where 27b/t04 changed zero files
and was recorded as `tests=pass`.

Gates test the REQUIREMENT through the public surface. They do not test how it was implemented.
