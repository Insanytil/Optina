"""Opt-in PostgreSQL tests; each test uses and removes its own isolated schema."""
import asyncio
import os
import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.base import Base
from app.models import Category, User, Wallet, WalletTransaction
from app.modules.category.repository.category_repository import CategoryRepository
from app.modules.transaction.exceptions import TransactionNotFoundError
from app.modules.transaction.repository.transaction_repository import TransactionRepository
from app.modules.transaction.schemas import TransactionCreate, TransactionUpdate
from app.modules.transaction.services.transaction_service import TransactionService
from app.modules.wallet.exceptions import WalletInUseError
from app.modules.wallet.repository.wallet_repository import WalletRepository
from app.modules.wallet.schemas import WalletCreate
from app.modules.wallet.services.wallet_service import WalletService


@unittest.skipUnless(os.environ.get("RUN_POSTGRES_TESTS") == "1", "Set RUN_POSTGRES_TESTS=1 for isolated PostgreSQL integration tests")
class TransactionPostgresTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.schema = "test_transactions_" + uuid4().hex
        self.engine = create_async_engine(settings.database_url, connect_args={"timeout": 5},
            execution_options={"schema_translate_map": {None: self.schema}})
        self.addAsyncCleanup(self.cleanup)
        async with self.engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.user_id, self.other_user_id = uuid4(), uuid4()
        self.wallet_id, self.category_id = uuid4(), uuid4()
        async with self.sessions() as db:
            db.add_all([User(id=self.user_id, email=f"{self.user_id}@example.com", hashed_password="unused", is_active=True, is_verified=True),
                User(id=self.other_user_id, email=f"{self.other_user_id}@example.com", hashed_password="unused", is_active=True, is_verified=True)])
            await db.flush()
            db.add_all([Wallet(id=self.wallet_id, user_id=self.user_id, name="Compte", balance=Decimal("0.00")),
                Category(id=self.category_id, user_id=self.user_id, name="Divers", position=0)])
            await db.commit()

    async def cleanup(self):
        try:
            async with self.engine.begin() as connection:
                await connection.execute(text(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE'))
        finally:
            await self.engine.dispose()

    def service(self, db):
        return TransactionService(db, TransactionRepository(db), WalletRepository(db), CategoryRepository(db))

    def payload(self, amount="10.00", **changes):
        values = dict(wallet_id=self.wallet_id, category_id=self.category_id, type="expense", amount=amount,
            date=date.today(), label="Test")
        values.update(changes)
        return values

    async def create(self, **changes):
        async with self.sessions() as db:
            return await self.service(db).create(user_id=self.user_id, payload=TransactionCreate(**self.payload(**changes)))

    async def assert_balance(self, expected):
        async with self.sessions() as db:
            balance = await db.scalar(select(Wallet.balance).where(Wallet.id == self.wallet_id))
            reconstructed = await db.scalar(select(func.coalesce(func.sum(case(
                (WalletTransaction.type == "income", WalletTransaction.amount), else_=-WalletTransaction.amount)), 0))
                .where(WalletTransaction.wallet_id == self.wallet_id))
            self.assertEqual(balance, Decimal(expected))
            self.assertEqual(balance, reconstructed)

    async def test_create_edit_delete_reconstructs_exact_balance(self):
        await self.create(amount="100.00", type="income")
        expense = await self.create(amount="30.00")
        await self.assert_balance("70.00")
        async with self.sessions() as db:
            await self.service(db).update(user_id=self.user_id, transaction_id=expense.id,
                payload=TransactionUpdate(**self.payload(amount="50.00")))
        await self.assert_balance("50.00")
        async with self.sessions() as db:
            await self.service(db).delete(user_id=self.user_id, transaction_id=expense.id)
        await self.assert_balance("100.00")

    async def test_concurrent_insertions_never_lose_balance_updates(self):
        await asyncio.gather(self.create(amount="10.01", type="income"), self.create(amount="20.02", type="income"))
        await self.assert_balance("30.03")

    async def test_concurrent_deletions_reverse_effect_only_once(self):
        transaction = await self.create()
        async def delete():
            async with self.sessions() as db:
                try:
                    await self.service(db).delete(user_id=self.user_id, transaction_id=transaction.id)
                    return True
                except TransactionNotFoundError:
                    return False
        self.assertEqual(sorted(await asyncio.gather(delete(), delete())), [False, True])
        await self.assert_balance("0.00")

    async def test_concurrent_edits_reconstruct_from_last_saved_amount(self):
        transaction = await self.create()
        async def edit(amount):
            async with self.sessions() as db:
                return await self.service(db).update(user_id=self.user_id, transaction_id=transaction.id,
                    payload=TransactionUpdate(**self.payload(amount=amount)))
        await asyncio.gather(edit("20.00"), edit("30.00"))
        async with self.sessions() as db:
            amount = await db.scalar(select(WalletTransaction.amount).where(WalletTransaction.id == transaction.id))
        await self.assert_balance(str(-amount))

    async def test_opening_is_not_applied_twice_and_blocks_wallet_deletion(self):
        async with self.sessions() as db:
            service = WalletService(db, WalletRepository(db), TransactionRepository(db))
            wallet = await service.create(user_id=self.user_id, payload=WalletCreate(name="Initial", balance="-123.45"))
        self.wallet_id = wallet.id
        await self.assert_balance("-123.45")
        async with self.sessions() as db:
            with self.assertRaises(WalletInUseError):
                await WalletService(db, WalletRepository(db)).delete(user_id=self.user_id, wallet_id=wallet.id)

    async def test_foreign_category_never_changes_wallet_balance(self):
        foreign_id = uuid4()
        async with self.sessions() as db:
            db.add(Category(id=foreign_id, user_id=self.other_user_id, name="Privé", position=0))
            await db.commit()
        with self.assertRaises(TransactionNotFoundError):
            await self.create(category_id=foreign_id)
        await self.assert_balance("0.00")

    async def test_wallet_summary_excludes_opening_and_other_wallets_and_periods(self):
        from datetime import timedelta
        from app.modules.wallet.schemas import WalletPeriod
        async with self.sessions() as db:
            wallet = await WalletService(db, WalletRepository(db), TransactionRepository(db)).create(
                user_id=self.user_id, payload=WalletCreate(name="Synthèse", balance="100.00"))
        self.wallet_id = wallet.id
        await self.create(amount="50.00", type="income")
        await self.create(amount="20.00")
        await self.create(amount="7.00", date=date.today() - timedelta(days=40))
        async with self.sessions() as db:
            service = WalletService(db, WalletRepository(db))
            result = await service.summary(user_id=self.user_id, wallet_id=self.wallet_id,
                period=WalletPeriod(date_from=date.today(), date_to=date.today()))
            self.assertEqual(result.wallet.balance, Decimal("123.00"))
            self.assertEqual(result.income, Decimal("50.00"))
            self.assertEqual(result.expenses, Decimal("20.00"))
            self.assertEqual(result.net, Decimal("30.00"))
