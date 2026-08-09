"""Run the middleware. Loopback only; `config.require_loopback` refuses anything else."""

from __future__ import annotations

import uvicorn

from .config import from_env
from .ipc.server import create_app


def main() -> None:
    settings = from_env()
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
