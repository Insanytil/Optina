import uuid
from decimal import Decimal

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PagePaginationParams
from app.models.wallet import Wallet


class WalletRepository:
    """User-scoped persistence; the service controls commits and rollbacks."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        user_id: uuid.UUID,
        name: str,
        balance: Decimal = Decimal("0.00"),
    ) -> Wallet:
        wallet = Wallet(user_id=user_id, name=name, balance=balance)
        self.db.add(wallet)
        await self.db.flush()
        return wallet

    async def get_by_id(
        self, *, wallet_id: uuid.UUID, user_id: uuid.UUID
    ) -> Wallet | None:
        return await self.db.scalar(
            select(Wallet).where(Wallet.id == wallet_id, Wallet.user_id == user_id)
        )

    async def list_for_user(
        self, *, user_id: uuid.UUID, pagination: PagePaginationParams | None = None
    ) -> list[Wallet]:
        pagination = pagination if pagination is not None else PagePaginationParams()
        statement = (
            select(Wallet)
            .where(Wallet.user_id == user_id)
            .order_by(Wallet.created_at.desc(), Wallet.id.desc())
        )
        result = await self.db.scalars(statement.limit(pagination.page_size).offset(pagination.offset))
        return list(result.all())

    async def count_for_user(self, *, user_id: uuid.UUID) -> int:
        return await self.db.scalar(
            select(func.count()).select_from(Wallet).where(Wallet.user_id == user_id)
        ) or 0

    async def rename(
        self, *, wallet_id: uuid.UUID, user_id: uuid.UUID, name: str
    ) -> Wallet | None:
        return await self.db.scalar(
            update(Wallet)
            .where(Wallet.id == wallet_id, Wallet.user_id == user_id)
            .values(name=name)
            .returning(Wallet)
            .execution_options(populate_existing=True)
        )

    async def adjust_balance(
        self, *, wallet_id: uuid.UUID, user_id: uuid.UUID, amount: Decimal
    ) -> Wallet | None:
        """Apply a signed delta atomically within the caller's transaction."""
        return await self.db.scalar(
            update(Wallet)
            .where(Wallet.id == wallet_id, Wallet.user_id == user_id)
            .values(balance=Wallet.balance + amount)
            .returning(Wallet)
            .execution_options(populate_existing=True)
        )

    async def delete(self, *, wallet_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        deleted_id = await self.db.scalar(
            delete(Wallet)
            .where(Wallet.id == wallet_id, Wallet.user_id == user_id)
            .returning(Wallet.id)
        )
        return deleted_id is not None
