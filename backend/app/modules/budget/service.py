from datetime import date, timedelta
from fastapi import HTTPException
from sqlalchemy import func, select
from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.models.budget import Budget, BudgetAmount, BudgetWallet
from app.models.category import Category
from app.models.user import User
from app.models.wallet import Wallet
from app.models.wallet_transaction import WalletTransaction
from app.modules.budget import calculation
from app.modules.budget.repository import BudgetRepository
from app.modules.budget.schemas import BudgetHistory, BudgetPeriod, BudgetResponse, BudgetStatus, BudgetStatusList
from app.modules.recurrence.service import business_today
from app.modules.transaction.schemas import TransactionResponse


def reference_day(month: date, today: date) -> date:
    """The day whose period is shown for `month`: today in the current month,
    the month's last day for a past month, its first day for a future one."""
    start = month.replace(day=1)
    end = calendar_end(start)
    return today if start <= today <= end else end if end < today else start


def calendar_end(month_start: date) -> date:
    return (month_start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)


class BudgetService:
    def __init__(self, db):
        self.db = db
        self.repo = BudgetRepository(db)

    async def lock(self, user_id):
        await self.db.execute(select(User.id).where(User.id == user_id).with_for_update())

    async def required(self, user_id, budget_id):
        budget = await self.repo.get(user_id, budget_id)
        if budget is None:
            raise HTTPException(404, 'Budget introuvable.')
        return budget

    async def validate(self, user_id, payload):
        category = await self.db.scalar(select(Category.id).where(Category.user_id == user_id, Category.id == payload.category_id))
        if category is None:
            raise HTTPException(404, 'Catégorie introuvable.')
        owned = set((await self.db.scalars(select(Wallet.id).where(Wallet.user_id == user_id, Wallet.id.in_(payload.wallet_ids)))).all())
        if owned != set(payload.wallet_ids):
            raise HTTPException(404, 'Un portefeuille sélectionné est introuvable.')

    async def categories(self, user_id):
        rows = (await self.db.scalars(select(Category).where(Category.user_id == user_id))).all()
        return {row.id: row for row in rows}

    # ---- definitions -------------------------------------------------

    async def list(self, user_id):
        return [BudgetResponse.model_validate(row) for row in await self.repo.list(user_id)]

    async def save(self, user_id, payload, budget_id=None):
        try:
            await self.lock(user_id)
            budget = await self.required(user_id, budget_id) if budget_id else None
            await self.validate(user_id, payload)
            if budget is None:
                budget = Budget(user_id=user_id, wallet_links=[], amount_rows=[])
                self.db.add(budget)
            else:
                budget.wallet_links.clear()
                budget.amount_rows.clear()
                await self.db.flush()
            for key in ('name', 'category_id', 'frequency', 'start_date', 'end_date', 'carry_over', 'alert_threshold'):
                setattr(budget, key, getattr(payload, key))
            budget.wallet_links = [BudgetWallet(user_id=user_id, wallet_id=identifier) for identifier in payload.wallet_ids]
            budget.amount_rows = [BudgetAmount(user_id=user_id, effective_from=row.effective_from, amount=row.amount) for row in payload.amounts]
            await self.db.flush()
            result = BudgetResponse.model_validate(budget)
            await self.db.commit()
            return result
        except Exception:
            await self.db.rollback()
            raise

    async def delete(self, user_id, budget_id):
        try:
            await self.lock(user_id)
            await self.db.delete(await self.required(user_id, budget_id))
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    # ---- tracking ----------------------------------------------------

    async def ledger(self, user_id, budget, categories, last, count=None):
        """Periods of `budget` up to `last`; computed from its first period so carry-over is right."""
        periods = calculation.periods_through(budget, last)
        scope = calculation.descendants(categories, budget.category_id)
        flows = await self.repo.flows(user_id, scope, budget.wallet_ids, periods[0][0], periods[-1][1])
        rows = calculation.ledger(budget, periods, flows)
        return (rows[-count:] if count else rows), scope

    async def status(self, user_id, month):
        today = await business_today(self.db)
        day = reference_day(month, today)
        budgets = await self.repo.list(user_id)
        categories = await self.categories(user_id)
        wallets = {identifier for budget in budgets for identifier in budget.wallet_ids}
        rules = await self.repo.rules(user_id, wallets) if wallets else []
        items = []
        for budget in budgets:
            last = calculation.period_containing(budget, day)
            if budget.frequency == 'once' and last is None:
                # A one-off budget shows in any month it overlaps.
                start, end = month.replace(day=1), calendar_end(month.replace(day=1))
                if budget.start_date <= end and budget.end_date >= start:
                    last = (budget.start_date, budget.end_date)
            if last is None:
                continue
            rows, scope = await self.ledger(user_id, budget, categories, last, count=1)
            period = rows[-1]
            receipts = await self.repo.receipts(user_id, period['start'], period['end']) if rules else set()
            occurrences = calculation.pending(rules, receipts, scope, set(budget.wallet_ids), period['start'], period['end'], today)
            upcoming = sum((item['amount'] for item in occurrences), calculation.ZERO)
            committed = period['spent'] + upcoming
            items.append(BudgetStatus(**BudgetResponse.model_validate(budget).model_dump(), period=BudgetPeriod(**period),
                upcoming=upcoming, committed=committed, remaining=period['available'] - committed, occurrences=occurrences))
        return BudgetStatusList(as_of=today, month=month.replace(day=1), items=items)

    async def history(self, user_id, budget_id, month, count=12):
        budget = await self.required(user_id, budget_id)
        today = await business_today(self.db)
        last = calculation.period_containing(budget, reference_day(month, today))
        if last is None:
            # Outside the budget's span: show up to its last (or first) period.
            edge = budget.end_date if budget.end_date and reference_day(month, today) > budget.end_date else budget.start_date
            last = calculation.period_containing(budget, edge)
        rows, _ = await self.ledger(user_id, budget, await self.categories(user_id), last, count=count)
        return BudgetHistory(as_of=today, periods=[BudgetPeriod(**row) for row in rows])

    async def transactions(self, user_id, budget_id, month, pagination):
        budget = await self.required(user_id, budget_id)
        today = await business_today(self.db)
        period = calculation.period_containing(budget, reference_day(month, today))
        if period is None and budget.frequency == 'once':
            period = (budget.start_date, budget.end_date)
        if period is None:
            return PagePaginatedResponse[TransactionResponse](items=[], pagination=PagePaginationMeta(
                page=pagination.page, page_size=pagination.page_size, total=0, total_pages=0))
        scope = calculation.descendants(await self.categories(user_id), budget.category_id)
        statement = self.repo.movements(user_id, scope, budget.wallet_ids, *period)
        total = await self.db.scalar(select(func.count()).select_from(statement.subquery())) or 0
        rows = (await self.db.scalars(statement.order_by(WalletTransaction.date.desc(), WalletTransaction.id.desc())
            .limit(pagination.page_size).offset(pagination.offset))).all()
        return PagePaginatedResponse[TransactionResponse](items=[TransactionResponse.model_validate(row) for row in rows],
            pagination=PagePaginationMeta(page=pagination.page, page_size=pagination.page_size, total=total,
                total_pages=(total + pagination.page_size - 1) // pagination.page_size))
