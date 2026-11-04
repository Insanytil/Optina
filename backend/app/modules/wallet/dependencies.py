from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.modules.wallet.repository.wallet_repository import WalletRepository
from app.modules.wallet.services.wallet_service import WalletService


def get_wallet_service(db: Annotated[AsyncSession, Depends(get_async_session)]) -> WalletService:
    return WalletService(db, WalletRepository(db))


WalletServiceDep = Annotated[WalletService, Depends(get_wallet_service)]
