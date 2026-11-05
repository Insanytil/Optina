import uuid

from sqlalchemy.exc import IntegrityError

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PagePaginatedResponse, PagePaginationMeta, PagePaginationParams
from app.modules.category.repository.category_repository import CategoryRepository
from app.modules.wallet.exceptions import WalletInUseError, WalletNotFoundError
from app.models.wallet_transaction import TransactionKind, TransactionType
from app.modules.transaction.repository.transaction_repository import TransactionRepository
from app.modules.wallet.repository.wallet_repository import WalletRepository
from app.modules.wallet.schemas import WalletCategoryBreakdown, WalletCategoryParams, WalletCreate, WalletPeriod, WalletResponse, WalletSummaryResponse, WalletUpdate


class WalletService:
    def __init__(self, db: AsyncSession, repository: WalletRepository, transactions: TransactionRepository | None = None):
        self.db = db
        self.repository = repository
        self.transactions = transactions if transactions is not None else TransactionRepository(db)

    async def list_for_user(self, *, user_id: uuid.UUID, pagination: PagePaginationParams) -> PagePaginatedResponse[WalletResponse]:
        total = await self.repository.count_for_user(user_id=user_id)
        wallets = await self.repository.list_for_user(user_id=user_id, pagination=pagination)
        return PagePaginatedResponse[WalletResponse](
            items=[WalletResponse.model_validate(wallet) for wallet in wallets],
            pagination=PagePaginationMeta(
                page=pagination.page,
                page_size=pagination.page_size,
                total=total,
                total_pages=(total + pagination.page_size - 1) // pagination.page_size,
            ),
        )

    async def get_by_id(self, *, wallet_id: uuid.UUID, user_id: uuid.UUID) -> WalletResponse:
        wallet = await self.repository.get_by_id(wallet_id=wallet_id, user_id=user_id)
        if wallet is None:
            raise WalletNotFoundError()
        return WalletResponse.model_validate(wallet)

    async def create(self, *, user_id: uuid.UUID, payload: WalletCreate) -> WalletResponse:
        try:
            wallet = await self.repository.create(user_id=user_id, name=payload.name, balance=payload.balance)
            if payload.balance != 0:
                await self.transactions.create(
                    user_id=user_id, wallet_id=wallet.id, category_id=None,
                    type=TransactionType.INCOME if payload.balance > 0 else TransactionType.EXPENSE,
                    kind=TransactionKind.OPENING_BALANCE, amount=abs(payload.balance),
                    date=payload.opening_date, label="Solde initial",
                )
            response = WalletResponse.model_validate(wallet)
            await self.db.commit()
            return response
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, wallet_id: uuid.UUID, user_id: uuid.UUID, payload: WalletUpdate) -> WalletResponse:
        try:
            wallet = await self.repository.rename(wallet_id=wallet_id, user_id=user_id, name=payload.name)
            if wallet is None:
                raise WalletNotFoundError()
            response = WalletResponse.model_validate(wallet)
            await self.db.commit()
            return response
        except Exception:
            await self.db.rollback()
            raise

    async def delete(self, *, wallet_id: uuid.UUID, user_id: uuid.UUID) -> None:
        try:
            await CategoryRepository(self.db).lock_for_user(user_id=user_id)
            wallets = await self.repository.lock_many(user_id=user_id, wallet_ids=[wallet_id])
            if not wallets:
                raise WalletNotFoundError()
            if await self.repository.has_transactions(user_id=user_id, wallet_id=wallet_id):
                raise WalletInUseError("Ce portefeuille contient des transactions et ne peut pas être supprimé.")
            if not await self.repository.delete(wallet_id=wallet_id, user_id=user_id):
                raise WalletNotFoundError()
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise WalletInUseError("Ce portefeuille est lié à des transactions ou à des récurrences et ne peut pas être supprimé.") from None
        except Exception:
            await self.db.rollback()
            raise

    async def summary(self, *, user_id: uuid.UUID, wallet_id: uuid.UUID, period: WalletPeriod) -> WalletSummaryResponse:
        result = await self.repository.get_summary(user_id=user_id, wallet_id=wallet_id,
            date_from=period.date_from, date_to=period.date_to)
        if result is None:
            raise WalletNotFoundError()
        wallet, income, expenses = result
        return WalletSummaryResponse(wallet=WalletResponse.model_validate(wallet),
            date_from=period.date_from, date_to=period.date_to,
            income=income, expenses=expenses, net=income - expenses)

    async def analytics(self, *, user_id: uuid.UUID, wallet_id: uuid.UUID, period: WalletPeriod):
        from datetime import date, timedelta
        from decimal import Decimal
        from app.modules.wallet.schemas import (
            WalletAnalyticsResponse, ExpenseBucket, CategoryExpense, MonthlyMovement, TopExpense, ActivityDay,
        )
        await self.get_by_id(user_id=user_id, wallet_id=wallet_id)
        days = (period.date_to - period.date_from).days + 1
        granularity = "day" if days <= 92 else "week" if days <= 730 else "month" if days <= 3660 else "year"
        args = dict(user_id=user_id, wallet_id=wallet_id)
        selected = dict(**args, date_from=period.date_from, date_to=period.date_to)
        expenses = await self.repository.expenses_by_date(**selected, granularity=granularity)
        if granularity == "day":
            by_date = {row["date"]: row["amount"] for row in expenses}
            expenses = [dict(date=period.date_from + timedelta(days=offset), amount=by_date.get(
                period.date_from + timedelta(days=offset), Decimal("0.00"))) for offset in range(days)]
        categories = list(await self.repository.expenses_by_category(**selected))
        if len(categories) > 7:
            categories = categories[:6] + [dict(category_id=None, name="Autres", amount=sum(
                (row["amount"] for row in categories[6:]), Decimal("0.00")))]
        # Twelve calendar months ending in the selected period's final month.
        end = period.date_to
        end_month = (end.year - 1) * 12 + end.month - 1
        start_month = max(0, end_month - 11)
        start = date(start_month // 12 + 1, start_month % 12 + 1, 1)
        monthly_rows = await self.repository.monthly_movements(**args, date_from=start, date_to=end)
        by_month = {row["month"]: row for row in monthly_rows}
        monthly = []
        for number in range(start_month, end_month + 1):
            month = f"{number // 12 + 1:04d}-{number % 12 + 1:02d}"
            monthly.append(MonthlyMovement(**by_month.get(month, dict(month=month, income=Decimal("0.00"), expenses=Decimal("0.00")))))
        activity_to = min(end, date.today())
        activity_from = max(date.min, activity_to - timedelta(days=min(89, (activity_to - date.min).days)))
        activity = await self.repository.activity(**args, date_from=activity_from, date_to=activity_to)
        top = await self.repository.top_expenses(**selected)
        return WalletAnalyticsResponse(expense_granularity=granularity,
            expenses_by_date=[ExpenseBucket(**row) for row in expenses],
            expenses_by_category=[CategoryExpense(**row) for row in categories], monthly=monthly,
            top_expenses=[TopExpense(**row) for row in top], activity=[ActivityDay(**row) for row in activity],
            activity_from=activity_from, activity_to=activity_to)

    async def category_breakdown(self, *, user_id: uuid.UUID, wallet_id: uuid.UUID, params: WalletCategoryParams) -> WalletCategoryBreakdown:
        from decimal import Decimal
        from app.modules.category.repository.category_repository import CategoryRepository
        from app.modules.category.services.category_service import CategoryService
        from app.modules.wallet.schemas import CategoryCrumb, CategoryExpense, WalletCategoryBreakdown
        await self.get_by_id(user_id=user_id, wallet_id=wallet_id)
        path = []
        direct = Decimal("0.00")
        args = dict(user_id=user_id, wallet_id=wallet_id, category_id=params.category_id,
            date_from=params.date_from, date_to=params.date_to)
        if params.category_id is not None:
            category_service = CategoryService(self.db, CategoryRepository(self.db))
            path = await category_service.path(user_id=user_id, category_id=params.category_id)
            direct = await self.repository.direct_category_expenses(**args)
        items = [CategoryExpense(**item) for item in await self.repository.category_breakdown(**args)]
        return WalletCategoryBreakdown(path=[CategoryCrumb(id=item.id, name=item.name) for item in path],
            items=items, direct_amount=direct, total=sum((item.amount for item in items), direct))
