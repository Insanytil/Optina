from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.budget import Budget, BudgetWallet
from app.models.category import Category
from app.models.recurrence import Recurrence, RecurrenceOccurrence
from app.models.wallet_transaction import WalletTransaction as Movement


def branches(user_id):
    tree = select(Category.id, Category.id.label('root_id')).where(Category.user_id == user_id,
        Category.parent_id.is_(None)).cte('budget_branches', recursive=True)
    return tree.union_all(select(Category.id, tree.c.root_id).join(tree, Category.parent_id == tree.c.id)
        .where(Category.user_id == user_id))


class BudgetRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, user_id, date_from, date_to):
        return list((await self.db.scalars(select(Budget).join(Category, Category.id == Budget.category_id)
            .where(Budget.user_id == user_id, Category.user_id == user_id, Budget.date_from <= date_to, Budget.date_to >= date_from)
            .order_by(Category.name, Budget.id))).all())

    async def get(self, user_id, budget_id):
        return await self.db.scalar(select(Budget).where(Budget.user_id == user_id, Budget.id == budget_id))

    async def activity(self, user_id, budget_ids):
        tree = branches(user_id)
        rows = await self.db.execute(select(Budget.id, Movement.date, func.sum(Movement.amount))
            .join(BudgetWallet, BudgetWallet.budget_id == Budget.id)
            .join(tree, tree.c.root_id == Budget.category_id)
            .join(Movement, and_(Movement.category_id == tree.c.id, Movement.wallet_id == BudgetWallet.wallet_id,
                Movement.user_id == user_id))
            .where(Budget.user_id == user_id, BudgetWallet.user_id == user_id, Budget.id.in_(budget_ids),
                Movement.kind == 'standard', Movement.type == 'expense', Movement.date >= Budget.date_from, Movement.date <= Budget.date_to)
            .group_by(Budget.id, Movement.date).order_by(Movement.date))
        result = {}
        for identifier, day, amount in rows.all():
            result.setdefault(identifier,[]).append(dict(date=day,amount=amount))
        return result

    async def rules(self, user_id, wallet_ids):
        return list((await self.db.scalars(select(Recurrence).where(Recurrence.user_id == user_id,
            Recurrence.wallet_id.in_(wallet_ids), Recurrence.type == 'expense',
            Recurrence.is_active.is_(True), Recurrence.archived.is_(False), Recurrence.next_date.is_not(None)))).all())

    async def receipts(self, user_id, start, end):
        rows = (await self.db.execute(select(RecurrenceOccurrence.recurrence_id, RecurrenceOccurrence.scheduled_date)
            .join(Recurrence, Recurrence.id == RecurrenceOccurrence.recurrence_id).where(Recurrence.user_id == user_id,
                RecurrenceOccurrence.scheduled_date >= start, RecurrenceOccurrence.scheduled_date <= end))).all()
        return {(identifier, scheduled) for identifier, scheduled in rows}

    def transaction_query(self, user_id, budget):
        tree = branches(user_id)
        start, end = budget.date_from, budget.date_to
        return select(Movement).join(tree, Movement.category_id == tree.c.id).where(
            Movement.user_id == user_id, Movement.wallet_id.in_(budget.wallet_ids), tree.c.root_id == budget.category_id,
            Movement.kind == 'standard', Movement.type == 'expense', Movement.date >= start, Movement.date <= end)
