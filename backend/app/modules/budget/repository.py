from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.budget import Budget
from app.models.recurrence import Recurrence, RecurrenceOccurrence
from app.models.wallet_transaction import WalletTransaction as Movement


class BudgetRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, user_id):
        return list((await self.db.scalars(select(Budget).where(Budget.user_id == user_id)
            .order_by(func.lower(Budget.name), Budget.id))).all())

    async def get(self, user_id, budget_id):
        return await self.db.scalar(select(Budget).where(Budget.user_id == user_id, Budget.id == budget_id))

    def movements(self, user_id, category_ids, wallet_ids, start, end):
        """Standard expenses and incomes (refunds) of a budget scope."""
        return select(Movement).where(Movement.user_id == user_id, Movement.kind == 'standard',
            Movement.type.in_(('expense', 'income')), Movement.category_id.in_(category_ids),
            Movement.wallet_id.in_(wallet_ids), Movement.date >= start, Movement.date <= end)

    async def flows(self, user_id, category_ids, wallet_ids, start, end):
        """Daily totals per type over the scope, as dicts for `calculation.net_spent`."""
        inner = self.movements(user_id, category_ids, wallet_ids, start, end).subquery()
        rows = await self.db.execute(select(inner.c.date, inner.c.type, func.sum(inner.c.amount))
            .group_by(inner.c.date, inner.c.type))
        return [dict(date=day, type=kind, amount=amount) for day, kind, amount in rows.all()]

    async def rules(self, user_id, wallet_ids):
        return list((await self.db.scalars(select(Recurrence).where(Recurrence.user_id == user_id,
            Recurrence.wallet_id.in_(wallet_ids), Recurrence.type == 'expense',
            Recurrence.is_active.is_(True), Recurrence.archived.is_(False), Recurrence.next_date.is_not(None)))).all())

    async def receipts(self, user_id, start, end):
        rows = (await self.db.execute(select(RecurrenceOccurrence.recurrence_id, RecurrenceOccurrence.scheduled_date)
            .join(Recurrence, Recurrence.id == RecurrenceOccurrence.recurrence_id).where(Recurrence.user_id == user_id,
                RecurrenceOccurrence.scheduled_date >= start, RecurrenceOccurrence.scheduled_date <= end))).all()
        return {(identifier, scheduled) for identifier, scheduled in rows}
