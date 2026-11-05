"""Restart-safe processor. Several API workers may run it concurrently."""
import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from sqlalchemy import select
from app.core.config import settings
from app.db.session import async_session_factory
from app.models.recurrence import Recurrence
from app.models.user import User
from app.modules.category.repository.category_repository import CategoryRepository
from app.modules.recurrence.clock import daily_window
from app.modules.recurrence.repository import RecurrenceRepository
from app.modules.recurrence.service import generate_due

logger = logging.getLogger(__name__)


async def run_once() -> int:
    generated = 0
    last_id = None
    failed = False
    while True:
        async with async_session_factory() as db:
            today, _ = await daily_window(db)
            statement = select(Recurrence.user_id, Recurrence.id).join(User, User.id == Recurrence.user_id).where(
                Recurrence.is_active.is_(True), Recurrence.archived.is_(False), Recurrence.next_date <= today,
                User.is_active.is_(True), User.is_verified.is_(True))
            if last_id:
                statement = statement.where(Recurrence.id > last_id)
            candidates = (await db.execute(statement.order_by(Recurrence.id).limit(200))).all()
        if not candidates:
            if failed:
                raise RuntimeError("Some recurrences failed; see preceding errors")
            return generated
        last_id = candidates[-1][1]
        for user_id, rule_id in candidates:
            try:
                while True:
                    async with async_session_factory() as db:
                        await CategoryRepository(db).lock_for_user(user_id=user_id)
                        rule = await RecurrenceRepository(db).get(user_id, rule_id, skip_locked=True)
                        count = await generate_due(db, rule, today) if rule else 0
                        await db.commit()
                        generated += count
                    if count < 500:
                        break
            except Exception:
                failed = True
                logger.exception("Failed processing recurrence %s", rule_id)



async def run_forever():
    while True:
        try:
            # Catch up only through the last 06:00 boundary, then wait until
            # the next daily execution. Rule cursors make restarts idempotent.
            async with async_session_factory() as db:
                before, _ = await daily_window(db)
            await run_once()
            async with async_session_factory() as db:
                after, delay = await daily_window(db)
            if after != before:
                continue
        except Exception:
            logger.exception("Daily recurrence processor failed; retrying in five minutes")
            delay = 300
        await asyncio.sleep(delay)


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(run_forever(), name="recurring-transactions") if settings.recurrence_worker_enabled else None
    try:
        yield
    finally:
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
