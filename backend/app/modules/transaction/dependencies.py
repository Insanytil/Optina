from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.modules.category.repository.category_repository import CategoryRepository
from app.modules.transaction.repository.transaction_repository import TransactionRepository
from app.modules.transaction.services.transaction_service import TransactionService
from app.modules.wallet.repository.wallet_repository import WalletRepository


def get_transaction_service(db: Annotated[AsyncSession, Depends(get_async_session)]) -> TransactionService:
    return TransactionService(db, TransactionRepository(db), WalletRepository(db), CategoryRepository(db))


TransactionServiceDep = Annotated[TransactionService, Depends(get_transaction_service)]
