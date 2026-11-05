"""Optional external scheduler: uv run python -m app.cli.process_recurrences."""
import asyncio
import logging
import app.models  # Register all FK targets.
from app.db.session import engine
from app.modules.recurrence.worker import run_once


async def main():
    try:
        count = await run_once()
        print(f"{count} échéances traitées.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
