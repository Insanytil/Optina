import uuid
from decimal import Decimal

from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.models.wallet_transaction import TransactionKind, TransactionType
from app.modules.category.repository.category_repository import CategoryRepository
from app.modules.transaction.exceptions import TransactionNotFoundError, TransactionValidationError
from app.modules.transaction.repository.transaction_repository import TransactionRepository
from app.modules.transaction.schemas import TransactionCreate, TransactionListParams, TransactionResponse, TransactionUpdate
from app.modules.wallet.repository.wallet_repository import WalletRepository


def signed_amount(type: str, amount: Decimal) -> Decimal:
    return amount if type == TransactionType.INCOME else -amount


class TransactionService:
    def __init__(self, db: AsyncSession, repository: TransactionRepository, wallets: WalletRepository, categories: CategoryRepository):
        self.db, self.repository, self.wallets, self.categories = db, repository, wallets, categories

    async def list_for_user(self, *, user_id: uuid.UUID, params: TransactionListParams) -> PagePaginatedResponse[TransactionResponse]:
        if params.wallet_id and await self.wallets.get_by_id(user_id=user_id, wallet_id=params.wallet_id) is None:
            raise TransactionNotFoundError()
        if params.category_id and await self.categories.get_by_id(user_id=user_id, category_id=params.category_id) is None:
            raise TransactionNotFoundError()
        total = await self.repository.count_for_user(user_id=user_id, params=params)
        items = await self.repository.list_for_user(user_id=user_id, params=params)
        return PagePaginatedResponse[TransactionResponse](items=[TransactionResponse.model_validate(item) for item in items],
            pagination=PagePaginationMeta(page=params.page, page_size=params.page_size, total=total,
                total_pages=(total + params.page_size - 1) // params.page_size))

    async def get_by_id(self, *, user_id: uuid.UUID, transaction_id: uuid.UUID) -> TransactionResponse:
        transaction = await self.repository.get_by_id(user_id=user_id, transaction_id=transaction_id)
        if transaction is None:
            raise TransactionNotFoundError()
        return TransactionResponse.model_validate(transaction)

    async def _lock_wallets(self, user_id: uuid.UUID, identifiers: list[uuid.UUID]) -> None:
        expected = set(identifiers)
        wallets = await self.wallets.lock_many(user_id=user_id, wallet_ids=sorted(expected))
        if {wallet.id for wallet in wallets} != expected:
            raise TransactionNotFoundError()

    async def _validate_category(self, user_id: uuid.UUID, category_id: uuid.UUID | None, kind: str, wallet_id: uuid.UUID | None = None) -> None:
        if kind == TransactionKind.OPENING_BALANCE:
            if category_id is not None:
                raise TransactionValidationError("Un mouvement d'ouverture ne doit pas avoir de catégorie.")
        elif category_id is None:
            raise TransactionValidationError("Choisissez une catégorie pour cette transaction.")
        elif await self.repository.lock_category(user_id=user_id, category_id=category_id) is None:
            raise TransactionNotFoundError()
        elif wallet_id is not None and not await self.categories.is_available(user_id=user_id, category_id=category_id, wallet_id=wallet_id):
            raise TransactionValidationError("Cette catégorie n’est pas disponible dans ce portefeuille.")

    async def create(self, *, user_id: uuid.UUID, payload: TransactionCreate) -> TransactionResponse:
        try:
            await self.categories.lock_for_user(user_id=user_id)
            await self._lock_wallets(user_id, [payload.wallet_id])
            await self._validate_category(user_id, payload.category_id, TransactionKind.STANDARD, payload.wallet_id)
            transaction = await self.repository.create(user_id=user_id, **payload.model_dump())
            await self.wallets.adjust_balance(user_id=user_id, wallet_id=payload.wallet_id, amount=signed_amount(payload.type, payload.amount))
            response = TransactionResponse.model_validate(transaction)
            await self.db.commit()
            return response
        except (IntegrityError, DataError):
            await self.db.rollback()
            raise TransactionValidationError("Impossible d'enregistrer ce mouvement : une référence a changé ou le solde dépasse le montant autorisé.") from None
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, user_id: uuid.UUID, transaction_id: uuid.UUID, payload: TransactionUpdate) -> TransactionResponse:
        try:
            await self.categories.lock_for_user(user_id=user_id)
            transaction = await self.repository.get_by_id(user_id=user_id, transaction_id=transaction_id, for_update=True)
            if transaction is None:
                raise TransactionNotFoundError()
            if transaction.kind == TransactionKind.OPENING_BALANCE and payload.wallet_id != transaction.wallet_id:
                raise TransactionValidationError("Un mouvement d'ouverture doit rester dans son portefeuille d'origine.")
            await self._lock_wallets(user_id, [transaction.wallet_id, payload.wallet_id])
            await self._validate_category(user_id, payload.category_id, transaction.kind, payload.wallet_id if (payload.category_id, payload.wallet_id) != (transaction.category_id, transaction.wallet_id) else None)
            old_wallet_id = transaction.wallet_id
            old_amount = signed_amount(transaction.type, transaction.amount)
            new_amount = signed_amount(payload.type, payload.amount)
            if old_wallet_id == payload.wallet_id:
                await self.wallets.adjust_balance(user_id=user_id, wallet_id=old_wallet_id, amount=new_amount - old_amount)
            else:
                await self.wallets.adjust_balance(user_id=user_id, wallet_id=old_wallet_id, amount=-old_amount)
                await self.wallets.adjust_balance(user_id=user_id, wallet_id=payload.wallet_id, amount=new_amount)
            for name, value in payload.model_dump().items():
                setattr(transaction, name, value)
            await self.db.flush()
            # Refresh SQL-generated updated_at without implicit async lazy loads.
            await self.db.refresh(transaction)
            response = TransactionResponse.model_validate(transaction)
            await self.db.commit()
            return response
        except (IntegrityError, DataError):
            await self.db.rollback()
            raise TransactionValidationError("Impossible de modifier ce mouvement : une référence a changé ou le solde dépasse le montant autorisé.") from None
        except Exception:
            await self.db.rollback()
            raise

    async def delete(self, *, user_id: uuid.UUID, transaction_id: uuid.UUID) -> None:
        try:
            await self.categories.lock_for_user(user_id=user_id)
            transaction = await self.repository.get_by_id(user_id=user_id, transaction_id=transaction_id, for_update=True)
            if transaction is None:
                raise TransactionNotFoundError()
            await self._lock_wallets(user_id, [transaction.wallet_id])
            await self.wallets.adjust_balance(user_id=user_id, wallet_id=transaction.wallet_id, amount=-signed_amount(transaction.type, transaction.amount))
            await self.repository.delete(transaction)
            await self.db.commit()
        except (IntegrityError, DataError):
            await self.db.rollback()
            raise TransactionValidationError("Impossible de supprimer ce mouvement : le solde résultant dépasse le montant autorisé.") from None
        except Exception:
            await self.db.rollback()
            raise
