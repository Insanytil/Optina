import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PagePaginatedResponse, PagePaginationMeta, PagePaginationParams
from app.modules.wallet.exceptions import WalletNotFoundError
from app.modules.wallet.repository.wallet_repository import WalletRepository
from app.modules.wallet.schemas import WalletCreate, WalletResponse, WalletUpdate


class WalletService:
    def __init__(self, db: AsyncSession, repository: WalletRepository):
        self.db = db
        self.repository = repository

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
            if not await self.repository.delete(wallet_id=wallet_id, user_id=user_id):
                raise WalletNotFoundError()
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
