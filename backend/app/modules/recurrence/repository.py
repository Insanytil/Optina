import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.recurrence import Recurrence, RecurrenceOccurrence


class RecurrenceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_user(self, user_id: uuid.UUID, wallet_id: uuid.UUID | None = None, *, include_archived: bool = False):
        statement = select(Recurrence).where(Recurrence.user_id == user_id)
        if not include_archived:
            statement = statement.where(Recurrence.archived.is_(False))
        if wallet_id is not None:
            statement = statement.where(Recurrence.wallet_id == wallet_id)
        return list((await self.db.scalars(statement.order_by(Recurrence.label, Recurrence.id))).all())

    async def get(self, user_id: uuid.UUID, recurrence_id: uuid.UUID, *, skip_locked=False):
        return await self.db.scalar(select(Recurrence).where(
            Recurrence.id == recurrence_id, Recurrence.user_id == user_id,
            Recurrence.archived.is_(False)).with_for_update(skip_locked=skip_locked)
            .execution_options(populate_existing=True))

    async def recorded_dates(self, recurrence_id: uuid.UUID, date_from=None, date_to=None):
        statement = select(RecurrenceOccurrence.scheduled_date).where(RecurrenceOccurrence.recurrence_id == recurrence_id)
        if date_from is not None:
            statement = statement.where(RecurrenceOccurrence.scheduled_date >= date_from)
        if date_to is not None:
            statement = statement.where(RecurrenceOccurrence.scheduled_date <= date_to)
        return set((await self.db.scalars(statement)).all())
