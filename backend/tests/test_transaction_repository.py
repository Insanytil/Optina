import unittest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import configure_mappers

from app.models import Category, Wallet, WalletTransaction
from app.modules.transaction.repository.transaction_repository import TransactionRepository
from app.modules.transaction.schemas import TransactionListParams
from app.modules.wallet.repository.wallet_repository import WalletRepository


class TransactionRepositoryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.scalar = AsyncMock(return_value=None)
        self.db.scalars = AsyncMock(return_value=MagicMock())
        self.repo = TransactionRepository(self.db)
        self.user_id = uuid4()

    async def test_get_locks_owner_scoped_movement(self):
        identifier = uuid4()
        await self.repo.get_by_id(user_id=self.user_id, transaction_id=identifier, for_update=True)
        query = self.db.scalar.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("FOR UPDATE", str(query))
        self.assertIn(self.user_id, query.params.values())
        self.assertIn(identifier, query.params.values())

    async def test_wallet_locks_have_stable_order(self):
        await WalletRepository(self.db).lock_many(user_id=self.user_id, wallet_ids=[uuid4(), uuid4()])
        query = self.db.scalars.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("ORDER BY wallets.id FOR UPDATE", str(query))
        self.assertIn(self.user_id, query.params.values())

    async def test_category_is_protected_from_concurrent_deletion(self):
        await self.repo.lock_category(user_id=self.user_id, category_id=uuid4())
        query = self.db.scalar.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("FOR KEY SHARE", str(query))
        self.assertIn(self.user_id, query.params.values())

    async def test_category_filter_recurses_and_ordinary_filter_excludes_openings(self):
        identifier = uuid4()
        await self.repo.list_for_user(user_id=self.user_id, params=TransactionListParams(category_id=identifier, kind="standard"))
        query = self.db.scalars.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("WITH RECURSIVE", str(query))
        self.assertIn("standard", query.params.values())
        self.assertIn(identifier, query.params.values())
        self.assertIn(self.user_id, query.params.values())
        self.assertIn("ORDER BY wallet_transactions.date DESC, wallet_transactions.id DESC", str(query))

    def test_database_enforces_same_owner_and_preserves_history(self):
        configure_mappers()
        for name in ["fk_wallet_transactions_wallet_owner", "fk_wallet_transactions_category_owner"]:
            constraint = next(item for item in WalletTransaction.__table__.foreign_key_constraints if item.name == name)
            self.assertEqual(constraint.ondelete, "RESTRICT")
            self.assertIn("user_id", constraint.column_keys)
        self.assertEqual(Wallet.transactions.property.passive_deletes, "all")
        self.assertEqual(Category.transactions.property.passive_deletes, "all")
