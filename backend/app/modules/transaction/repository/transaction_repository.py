import uuid
from datetime import date as DateValue
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.wallet_transaction import TransactionKind, TransactionType, WalletTransaction
from app.modules.transaction.schemas import TransactionListParams


class TransactionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, user_id: uuid.UUID, wallet_id: uuid.UUID, category_id: uuid.UUID | None,
                     type: TransactionType, amount: Decimal, date: DateValue, label: str, note: str | None = None,
                     kind: TransactionKind = TransactionKind.STANDARD) -> WalletTransaction:
        transaction = WalletTransaction(user_id=user_id, wallet_id=wallet_id, category_id=category_id,
            type=type, amount=amount, date=date, label=label, note=note, kind=kind)
        self.db.add(transaction)
        await self.db.flush()
        return transaction

    async def get_by_id(self, *, user_id: uuid.UUID, transaction_id: uuid.UUID, for_update: bool = False) -> WalletTransaction | None:
        statement = select(WalletTransaction).where(WalletTransaction.user_id == user_id, WalletTransaction.id == transaction_id)
        if for_update:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        return await self.db.scalar(statement)

    async def lock_category(self, *, user_id: uuid.UUID, category_id: uuid.UUID) -> Category | None:
        # Keep deletion from racing a transaction insert/update.
        return await self.db.scalar(select(Category).where(Category.user_id == user_id, Category.id == category_id)
            .with_for_update(read=True, key_share=True))

    def filters(self, *, user_id: uuid.UUID, params: TransactionListParams):
        clauses = [WalletTransaction.user_id == user_id]
        if params.wallet_id:
            clauses.append(WalletTransaction.wallet_id == params.wallet_id)
        if params.category_id:
            if params.include_subcategories:
                subtree = select(Category.id).where(Category.id == params.category_id, Category.user_id == user_id).cte("transaction_categories", recursive=True)
                subtree = subtree.union(select(Category.id).join(subtree, Category.parent_id == subtree.c.id).where(Category.user_id == user_id))
                clauses.append(WalletTransaction.category_id.in_(select(subtree.c.id)))
            else:
                clauses.append(WalletTransaction.category_id == params.category_id)
        if params.type:
            clauses.append(WalletTransaction.type == params.type)
        if params.kind:
            clauses.append(WalletTransaction.kind == params.kind)
        if params.date_from:
            clauses.append(WalletTransaction.date >= params.date_from)
        if params.date_to:
            clauses.append(WalletTransaction.date <= params.date_to)
        if params.q and params.q.strip():
            clauses.append(WalletTransaction.label.ilike(f"%{params.q.strip()}%"))
        if params.origin == "recurring":
            clauses.append(WalletTransaction.recurrence_id.is_not(None))
        elif params.origin == "manual":
            clauses.append(WalletTransaction.recurrence_id.is_(None))
        return clauses

    async def list_for_user(self, *, user_id: uuid.UUID, params: TransactionListParams) -> list[WalletTransaction]:
        result = await self.db.scalars(select(WalletTransaction).where(*self.filters(user_id=user_id, params=params))
            .order_by(WalletTransaction.date.desc(), WalletTransaction.id.desc()).limit(params.page_size).offset(params.offset))
        return list(result.all())

    async def count_for_user(self, *, user_id: uuid.UUID, params: TransactionListParams) -> int:
        return await self.db.scalar(select(func.count()).select_from(WalletTransaction).where(*self.filters(user_id=user_id, params=params))) or 0

    async def net_for_user(self, *, user_id: uuid.UUID, params: TransactionListParams) -> Decimal:
        signed = case((WalletTransaction.type == TransactionType.INCOME, WalletTransaction.amount), else_=-WalletTransaction.amount)
        return await self.db.scalar(select(func.coalesce(func.sum(signed), 0))
            .where(*self.filters(user_id=user_id, params=params))) or Decimal(0)

    async def delete(self, transaction: WalletTransaction) -> None:
        await self.db.delete(transaction)
        await self.db.flush()
