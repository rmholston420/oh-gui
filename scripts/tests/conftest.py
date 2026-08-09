"""Make the hyphenated runner importable.

`scripts/check-hard-constraints.py` is named for the operator who types it, not for Python's
import system. conftest runs before test collection, so registering the module here lets the
tests import it under a legal name.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

_spec = importlib.util.spec_from_file_location(
    "check_hard_constraints_shim", SCRIPTS / "check-hard-constraints.py"
)
assert _spec and _spec.loader
_module = importlib.util.module_from_spec(_spec)
sys.modules["check_hard_constraints_shim"] = _module
_spec.loader.exec_module(_module)
