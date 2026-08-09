"""Anti-corruption layer package (ADR-001 item 7).

The sole permitted import site for `openhands*` inside the middleware. Enforced by
`tests/test_import_boundary.py`.
"""
