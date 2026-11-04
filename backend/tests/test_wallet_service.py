import unittest
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from pydantic import ValidationError

from app.core.pagination import PagePaginationParams
from app.modules.wallet.exceptions import WalletNotFoundError
from app.modules.wallet.schemas import WalletCreate, WalletUpdate
from app.modules.wallet.services.wallet_service import WalletService


class WalletServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = AsyncMock()
        self.repo = AsyncMock()
        self.service = WalletService(self.db, self.repo)
        self.user_id = uuid4()
        self.wallet = SimpleNamespace(id=uuid4(), name="Courant", balance=Decimal("12.34"), created_at=datetime.now(UTC), updated_at=datetime.now(UTC))

    async def test_create_commits_and_preserves_amount(self):
        self.repo.create.return_value = self.wallet
        payload = WalletCreate(name=" Courant ", balance="12.34")
        result = await self.service.create(user_id=self.user_id, payload=payload)
        self.repo.create.assert_awaited_once_with(user_id=self.user_id, name="Courant", balance=Decimal("12.34"))
        self.db.commit.assert_awaited_once()
        self.assertEqual(result.model_dump(mode="json")["balance"], "12.34")

    async def test_failed_commit_rolls_back(self):
        self.repo.create.return_value = self.wallet
        self.db.commit.side_effect = RuntimeError("failed")
        with self.assertRaises(RuntimeError):
            await self.service.create(user_id=self.user_id, payload=WalletCreate(name="Courant"))
        self.db.rollback.assert_awaited_once()

    async def test_missing_or_foreign_wallet_update_does_not_commit(self):
        self.repo.rename.return_value = None
        with self.assertRaises(WalletNotFoundError):
            await self.service.update(wallet_id=self.wallet.id, user_id=self.user_id, payload=WalletUpdate(name="Épargne"))
        self.repo.rename.assert_awaited_once_with(wallet_id=self.wallet.id, user_id=self.user_id, name="Épargne")
        self.db.commit.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_update_commits_and_preserves_balance(self):
        self.repo.rename.return_value = self.wallet
        result = await self.service.update(wallet_id=self.wallet.id, user_id=self.user_id, payload=WalletUpdate(name="Courant"))
        self.assertEqual(result.balance, self.wallet.balance)
        self.db.commit.assert_awaited_once()

    async def test_list_metadata_and_user_scope(self):
        self.repo.count_for_user.return_value = 21
        self.repo.list_for_user.return_value = [self.wallet]
        params = PagePaginationParams(page=2)
        result = await self.service.list_for_user(user_id=self.user_id, pagination=params)
        self.assertEqual(result.pagination.total_pages, 2)
        self.assertEqual(result.pagination.total, 21)
        self.repo.count_for_user.assert_awaited_once_with(user_id=self.user_id)
        self.repo.list_for_user.assert_awaited_once_with(user_id=self.user_id, pagination=params)

    async def test_get_not_found(self):
        self.repo.get_by_id.return_value = None
        with self.assertRaises(WalletNotFoundError):
            await self.service.get_by_id(wallet_id=self.wallet.id, user_id=self.user_id)

    def test_schema_rejects_invalid_names_amounts_and_owner_override(self):
        for payload in [{"name": " "}, {"name": "x" * 256}, {"name": "X", "balance": "1.234"}, {"name": "X", "balance": "NaN"}, {"name": "X", "balance": "100000000000000000.00"}, {"name": "X", "user_id": str(uuid4())}]:
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                WalletCreate(**payload)
        with self.assertRaises(ValidationError):
            WalletUpdate(name="X", balance="10.00")

    async def test_delete_commits_for_owner(self):
        self.repo.delete.return_value = True
        await self.service.delete(wallet_id=self.wallet.id, user_id=self.user_id)
        self.repo.delete.assert_awaited_once_with(wallet_id=self.wallet.id, user_id=self.user_id)
        self.db.commit.assert_awaited_once()

    async def test_delete_missing_or_foreign_rolls_back(self):
        self.repo.delete.return_value = False
        with self.assertRaises(WalletNotFoundError):
            await self.service.delete(wallet_id=self.wallet.id, user_id=self.user_id)
        self.db.commit.assert_not_awaited()
        self.db.rollback.assert_awaited_once()
