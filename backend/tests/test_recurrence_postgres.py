"""Opt-in integration coverage in a disposable PostgreSQL schema."""
import asyncio
import os
import unittest
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.core.config import settings
from app.db.base import Base
from app.models import User, Wallet, Category, WalletTransaction
from app.models.recurrence import Recurrence, RecurrenceOccurrence
from app.modules.recurrence.clock import daily_window
from app.modules.recurrence.repository import RecurrenceRepository
from app.modules.recurrence.service import generate_due, RecurrenceService


@unittest.skipUnless(os.environ.get('RUN_POSTGRES_TESTS') == '1', 'Set RUN_POSTGRES_TESTS=1 for isolated PostgreSQL integration tests')
class RecurrencePostgresTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.schema = 'test_recurrences_' + uuid4().hex
        self.engine = create_async_engine(settings.database_url, connect_args={'timeout': 5}, execution_options={'schema_translate_map': {None: self.schema}})
        self.addAsyncCleanup(self.cleanup)
        async with self.engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.user_id, self.wallet_id, self.category_id, self.rule_id = [uuid4() for _ in range(4)]
        async with self.sessions() as db:
            db.add(User(id=self.user_id,email=f'{self.user_id}@example.com',hashed_password='unused',is_active=True,is_verified=True))
            await db.flush()
            db.add_all([Wallet(id=self.wallet_id,user_id=self.user_id,name='Test',balance=Decimal(0)),Category(id=self.category_id,user_id=self.user_id,name='Test',position=0)])
            await db.flush()
            db.add(Recurrence(id=self.rule_id,user_id=self.user_id,wallet_id=self.wallet_id,category_id=self.category_id,label='Loyer',type='expense',amount=Decimal('100.01'),note=None,frequency_unit='month',interval=1,start_date=date(2026,1,31),end_date=None,next_date=date(2026,1,31),next_index=0,is_active=True,archived=False))
            await db.commit()

    async def cleanup(self):
        try:
            async with self.engine.begin() as connection:
                await connection.execute(text(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE'))
        finally:
            await self.engine.dispose()

    async def generate(self):
        async with self.sessions() as db:
            rule = await RecurrenceRepository(db).get(self.user_id,self.rule_id)
            await generate_due(db,rule,date(2026,3,31))
            await db.commit()

    async def test_concurrent_workers_post_each_occurrence_once(self):
        await asyncio.gather(self.generate(),self.generate())
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(WalletTransaction)),3)
            self.assertEqual(await db.scalar(select(func.count()).select_from(RecurrenceOccurrence)),3)
            self.assertEqual(await db.scalar(select(Wallet.balance)),Decimal('-300.03'))

    async def test_deleted_movement_keeps_receipt_and_does_not_reappear(self):
        await self.generate()
        async with self.sessions() as db:
            movement = await db.scalar(select(WalletTransaction).order_by(WalletTransaction.date))
            await db.delete(movement)
            await db.commit()
        async with self.sessions() as db:
            rule = await RecurrenceRepository(db).get(self.user_id,self.rule_id)
            rule.next_index = 0
            rule.next_date = rule.start_date
            await db.commit()
        await self.generate()
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(WalletTransaction)),2)
            self.assertEqual(await db.scalar(select(func.count()).select_from(RecurrenceOccurrence)),3)
            self.assertEqual(await db.scalar(select(func.count()).select_from(RecurrenceOccurrence).where(RecurrenceOccurrence.transaction_id.is_(None))),1)

    async def test_rollback_reverts_movements_receipts_cursor_and_balance(self):
        async with self.sessions() as db:
            rule = await RecurrenceRepository(db).get(self.user_id,self.rule_id)
            await generate_due(db,rule,date(2026,3,31))
            await db.rollback()
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(WalletTransaction)),0)
            self.assertEqual(await db.scalar(select(Wallet.balance)),0)
            self.assertEqual(await db.scalar(select(Recurrence.next_date)),date(2026,1,31))

    async def test_daily_0600_boundary_and_daylight_saving(self):
        async with self.sessions() as db:
            before, _ = await daily_window(db,datetime(2026,11,4,4,59,tzinfo=UTC))
            at, delay = await daily_window(db,datetime(2026,11,4,5,tzinfo=UTC))
            self.assertEqual(before,date(2026,11,3))
            self.assertEqual(at,date(2026,11,4))
            self.assertEqual(delay,24*3600)
            _, spring = await daily_window(db,datetime(2026,3,28,5,tzinfo=UTC))
            _, autumn = await daily_window(db,datetime(2026,10,24,4,tzinfo=UTC))
            self.assertEqual(spring,23*3600)
            self.assertEqual(autumn,25*3600)

    async def test_other_owner_cannot_access_rule(self):
        async with self.sessions() as db:
            self.assertIsNone(await RecurrenceRepository(db).get(uuid4(),self.rule_id))

    async def test_availability_updates_are_atomic_and_preserve_existing_transactions(self):
        from app.modules.category.repository.category_repository import CategoryRepository
        from app.modules.category.services.category_service import CategoryService
        from app.modules.category.schemas import CategoryUpdate
        from app.modules.category.exceptions import CategoryHierarchyError
        from app.modules.transaction.repository.transaction_repository import TransactionRepository
        from app.modules.transaction.services.transaction_service import TransactionService
        from app.modules.transaction.schemas import TransactionCreate
        from app.modules.transaction.exceptions import TransactionValidationError
        await self.generate()
        async with self.sessions() as db:
            service = CategoryService(db,CategoryRepository(db))
            with self.assertRaises(CategoryHierarchyError):
                await service.update(user_id=self.user_id,category_id=self.category_id,payload=CategoryUpdate(name='Test',wallet_ids=[]))
        async with self.sessions() as db:
            rule = await RecurrenceRepository(db).get(self.user_id,self.rule_id)
            rule.is_active = False
            await db.commit()
        async with self.sessions() as db:
            result = await CategoryService(db,CategoryRepository(db)).update(user_id=self.user_id,category_id=self.category_id,payload=CategoryUpdate(name='Test',wallet_ids=[]))
            self.assertEqual(result.wallet_ids,[])
            self.assertEqual(await db.scalar(select(func.count()).select_from(WalletTransaction)),3)
        async with self.sessions() as db:
            from app.modules.wallet.repository.wallet_repository import WalletRepository
            service = TransactionService(db,TransactionRepository(db),WalletRepository(db),CategoryRepository(db))
            with self.assertRaises(TransactionValidationError):
                await service.create(user_id=self.user_id,payload=TransactionCreate(wallet_id=self.wallet_id,category_id=self.category_id,label='Interdit',type='expense',amount='1.00',date=date.today()))

    async def test_repeated_wallet_selection_and_foreign_owner(self):
        from app.modules.category.repository.category_repository import CategoryRepository
        from app.modules.category.services.category_service import CategoryService
        from app.modules.category.schemas import CategoryCreate, CategoryUpdate
        from app.modules.category.exceptions import CategoryHierarchyError
        async with self.sessions() as db:
            service = CategoryService(db,CategoryRepository(db))
            category = await service.create(user_id=self.user_id,payload=CategoryCreate(name='Choix',wallet_ids=[self.wallet_id]))
            category = await service.update(user_id=self.user_id,category_id=category.id,payload=CategoryUpdate(name='Choix',wallet_ids=[self.wallet_id,self.wallet_id]))
            self.assertEqual(category.wallet_ids,[self.wallet_id])
            with self.assertRaises(CategoryHierarchyError):
                await service.update(user_id=self.user_id,category_id=category.id,payload=CategoryUpdate(name='Choix',wallet_ids=[uuid4()]))

    async def test_paused_creation_never_posts_past_occurrences(self):
        from app.modules.recurrence.schemas import RecurrenceCreate
        async with self.sessions() as db:
            created=await RecurrenceService(db).save(self.user_id,RecurrenceCreate(wallet_id=self.wallet_id,category_id=self.category_id,
                label='Abonnement suspendu',type='expense',amount='12.90',frequency_unit='month',interval=1,start_date=date(2026,1,1),is_active=False))
            self.assertFalse(created.is_active)
            self.assertEqual(await db.scalar(select(func.count()).select_from(WalletTransaction)),0)
            self.assertEqual(await db.scalar(select(Wallet.balance)),Decimal(0))
