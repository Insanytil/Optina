"""Opt-in tests in disposable PostgreSQL schemas, never in application tables."""
import asyncio
import os
import unittest
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from fastapi import HTTPException
from app.core.config import settings
from app.db.base import Base
from app.models import User, Wallet, Category, WalletTransaction
from app.models.budget import Budget
from app.modules.budget.service import BudgetService
from app.modules.budget.schemas import BudgetWrite, BudgetViewWrite, calendar_period
from app.modules.category.repository.category_repository import CategoryRepository
from app.modules.category.services.category_service import CategoryService
from app.modules.category.schemas import CategoryMove
from app.modules.category.exceptions import CategoryHierarchyError
from app.modules.recurrence.repository import RecurrenceRepository
from app.modules.recurrence.schemas import RecurrenceCreate
from app.modules.recurrence.service import RecurrenceService, generate_due
from app.modules.budget.views import BudgetViewService

def month_bounds(month):
    return calendar_period("month",month)


@unittest.skipUnless(os.environ.get('RUN_POSTGRES_TESTS')=='1','Set RUN_POSTGRES_TESTS=1 for disposable PostgreSQL integration tests')
class BudgetPostgresTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.schema='test_budgets_'+uuid4().hex
        self.engine=create_async_engine(settings.database_url,connect_args={'timeout':5},execution_options={'schema_translate_map':{None:self.schema}})
        self.addAsyncCleanup(self.cleanup)
        async with self.engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
            await connection.run_sync(Base.metadata.create_all)
        self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
        self.user,self.wallet,self.other_wallet,self.root,self.child=[uuid4() for _ in range(5)]
        self.month=date.today().replace(day=1)
        async with self.sessions() as db:
            db.add(User(id=self.user,email=f'{self.user}@example.com',hashed_password='unused',is_active=True,is_verified=True))
            await db.flush()
            db.add_all([Wallet(id=self.wallet,user_id=self.user,name='Compte',balance=Decimal('1000')),Wallet(id=self.other_wallet,user_id=self.user,name='Cash',balance=Decimal('100')),Category(id=self.root,user_id=self.user,name='Alimentation',position=0)])
            await db.flush()
            db.add(Category(id=self.child,user_id=self.user,name='Courses',parent_id=self.root,position=0))
            await db.commit()

    async def cleanup(self):
        try:
            async with self.engine.begin() as connection:
                await connection.execute(text(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE'))
        finally:
            await self.engine.dispose()

    def payload(self,**changes):
        return BudgetWrite(**{**dict(name="Courses",category_id=self.root,date_from=self.month,date_to=month_bounds(self.month)[1],period_type="month",amount='500.00',wallet_ids=[self.wallet,self.other_wallet]),**changes})

    async def create(self,payload=None):
        async with self.sessions() as db:
            return await BudgetService(db).save(self.user,payload or self.payload())

    async def test_concurrent_creation_allows_intentional_overlapping_objectives(self):
        results=await asyncio.gather(self.create(),self.create(),return_exceptions=True)
        self.assertEqual(sum(not isinstance(result,Exception) for result in results),2)
        self.assertFalse(any(isinstance(result,Exception) for result in results))

    async def test_update_copy_and_delete_preserve_wallet_balances(self):
        created=await self.create()
        async with self.sessions() as db:
            service=BudgetService(db)
            updated=await service.save(self.user,self.payload(amount='700',wallet_ids=[self.wallet]),created.id)
            self.assertEqual(updated.wallet_ids,[self.wallet])
            target=date(self.month.year+1,self.month.month,1)
            await service.save(self.user,self.payload(date_from=target,date_to=month_bounds(target)[1]))
            self.assertEqual(await db.scalar(select(func.count()).select_from(Budget)),2)
            await service.delete(self.user,created.id)
            self.assertEqual(await db.scalar(select(Wallet.balance).where(Wallet.id==self.wallet)),Decimal('1000'))

    async def test_recurring_posting_does_not_change_total_committed(self):
        created=await self.create()
        async with self.sessions() as db:
            for day in [1,month_bounds(self.month)[1].day]:
                await RecurrenceService(db).save(self.user,RecurrenceCreate(wallet_id=self.wallet,category_id=self.child,
                    label=f'Charge {day}',amount='100.01',type='expense',frequency_unit='month',interval=1,start_date=self.month.replace(day=day)))
            before=await BudgetService(db).list(self.user,*month_bounds(self.month))
            self.assertEqual(before.items[0].committed,Decimal('200.02'))
            rules=await RecurrenceRepository(db).list_for_user(self.user)
            for rule in rules:
                await CategoryRepository(db).lock_for_user(user_id=self.user)
                locked=await RecurrenceRepository(db).get(self.user,rule.id)
                await generate_due(db,locked,month_bounds(self.month)[1])
                await db.commit()
            after=await BudgetService(db).list(self.user,*month_bounds(self.month))
            self.assertEqual(after.items[0].upcoming,0)
            self.assertEqual(after.items[0].spent,Decimal('200.02'))
            self.assertEqual(after.items[0].committed,before.items[0].committed)

    async def test_budget_root_cannot_be_moved_under_another_category(self):
        await self.create()
        async with self.sessions() as db:
            parent=Category(user_id=self.user,name='Autre',position=1)
            db.add(parent)
            await db.commit()
            with self.assertRaises(CategoryHierarchyError):
                await CategoryService(db,CategoryRepository(db)).move(user_id=self.user,category_id=self.root,payload=CategoryMove(parent_id=parent.id))

    async def test_saved_default_is_unique_and_owner_scoped(self):
        async def save(name):
            async with self.sessions() as db:
                return await BudgetViewService(db).save_view(self.user,BudgetViewWrite(name=name,preset='daily',config={'period_types':['month']},is_default=True))
        await asyncio.gather(save('A'),save('B'))
        async with self.sessions() as db:
            service=BudgetViewService(db)
            rows=await service.views(self.user)
            self.assertEqual(len(rows),2)
            self.assertEqual(sum(row.is_default for row in rows),1)
            self.assertEqual(await service.views(uuid4()),[])
            with self.assertRaises(HTTPException):
                await service.delete_view(uuid4(),rows[0].id)

    async def test_same_transaction_counts_in_each_objective_without_global_total(self):
        await self.create()
        await self.create(self.payload(period_type='year',date_from=date(self.month.year,1,1),date_to=date(self.month.year,12,31)))
        async with self.sessions() as db:
            db.add(WalletTransaction(user_id=self.user,wallet_id=self.wallet,category_id=self.child,type='expense',kind='standard',amount=Decimal('600.01'),date=self.month,label='Courses'))
            await db.commit()
            result=await BudgetService(db).list(self.user,*month_bounds(self.month))
            self.assertEqual(len(result.items),2)
            self.assertEqual([item.spent for item in result.items],[Decimal('600.01')]*2)
            self.assertEqual(set(result.model_dump()),{'as_of','items'})

    async def test_repeating_periods_are_independent_and_versions_preserve_previous_months(self):
        created=await self.create(self.payload(repeats=True))
        start=self.month
        next_start=month_bounds(start)[1]+timedelta(days=1)
        third_start=month_bounds(next_start)[1]+timedelta(days=1)
        async with self.sessions() as db:
            service=BudgetService(db)
            result=await service.list(self.user,start,month_bounds(third_start)[1])
            self.assertEqual(len(result.items),3)
            rows=sorted(result.items,key=lambda row:row.date_from)
            await service.save(self.user,self.payload(repeats=True,date_from=next_start,date_to=month_bounds(next_start)[1],amount='700'),rows[1].id,'period')
            result=await service.list(self.user,start,month_bounds(third_start)[1])
            self.assertEqual([row.amount for row in sorted(result.items,key=lambda row:row.date_from)],[Decimal('500'),Decimal('700'),Decimal('500')])
            await service.save(self.user,self.payload(repeats=True,date_from=third_start,date_to=month_bounds(third_start)[1],amount='1000'),rows[2].id,'following')
            fourth=month_bounds(third_start)[1]+timedelta(days=1)
            result=await service.list(self.user,start,month_bounds(fourth)[1])
            rows=sorted(result.items,key=lambda row:row.date_from)
            self.assertEqual([row.amount for row in rows],[Decimal('500'),Decimal('700'),Decimal('1000'),Decimal('1000')])
            history=await service.history(self.user,rows[-1].id)
            self.assertEqual(len(history.items),4)
            # No financial movements or wallet balance changes are introduced by repeating budgets.
            self.assertEqual(await db.scalar(select(func.count()).select_from(WalletTransaction)),0)
            self.assertEqual(await db.scalar(select(Wallet.balance).where(Wallet.id==self.wallet)),Decimal('1000'))

    async def test_concurrent_materialization_is_idempotent_and_deletion_removes_entire_series(self):
        created=await self.create(self.payload(repeats=True))
        async def load():
            async with self.sessions() as db:
                return await BudgetService(db).list(self.user,self.month,date(self.month.year,12,31))
        results=await asyncio.gather(load(),load())
        self.assertEqual({row.id for row in results[0].items},{row.id for row in results[1].items})
        async with self.sessions() as db:
            service=BudgetService(db)
            with self.assertRaises(HTTPException):
                await service.history(uuid4(),created.id)
            await service.delete(self.user,created.id)
            self.assertEqual(await db.scalar(select(func.count()).select_from(Budget)),0)

    async def test_repeat_end_keeps_prior_periods_and_blocks_new_ones(self):
        await self.create(self.payload(repeats=True))
        following=month_bounds(self.month)[1]+timedelta(days=1)
        later=month_bounds(following)[1]+timedelta(days=1)
        async with self.sessions() as db:
            service=BudgetService(db)
            result=await service.list(self.user,self.month,month_bounds(later)[1])
            selected=next(row for row in result.items if row.date_from==following)
            await service.save(self.user,self.payload(repeats=True,date_from=following,date_to=month_bounds(following)[1],repeat_until=month_bounds(following)[1]),selected.id,'following')
            result=await service.list(self.user,self.month,month_bounds(later)[1])
            self.assertEqual(sorted(row.date_from for row in result.items),[self.month,following])
