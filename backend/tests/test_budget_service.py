import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace as Node
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.modules.budget.service import BudgetService
from app.modules.budget.schemas import BudgetWrite


class BudgetServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db=AsyncMock(spec=AsyncSession)
        self.db.add=Mock()
        self.service=BudgetService(self.db)
        self.service.repo=AsyncMock()
        self.service.series_manager=AsyncMock()
        self.service.repo.conflict.return_value=None
        self.user,self.category,self.wallet=uuid4(),uuid4(),uuid4()
        self.payload=BudgetWrite(name='Courses',category_id=self.category,date_from='2026-01-01',date_to='2026-01-31',period_type='month',amount='100.00',wallet_ids=[self.wallet])
        self.db.scalar.return_value=Node(parent_id=None)
        rows=Mock()
        rows.all.return_value=[self.wallet]
        self.db.scalars.return_value=rows

    async def test_overlaps_are_allowed_without_conflict_validation(self):
        await self.service.validate(self.user,self.payload)
        self.service.repo.conflict.assert_not_awaited()

    async def test_subcategory_and_foreign_wallet_are_rejected(self):
        self.db.scalar.return_value=Node(parent_id=uuid4())
        with self.assertRaises(HTTPException) as error:
            await self.service.validate(self.user,self.payload)
        self.assertEqual(error.exception.status_code,409)
        self.db.scalar.return_value=Node(parent_id=None)
        self.db.scalars.return_value.all.return_value=[]
        with self.assertRaises(HTTPException) as error:
            await self.service.validate(self.user,self.payload)
        self.assertEqual(error.exception.status_code,404)

    async def test_missing_or_foreign_budget_not_found_before_mutation(self):
        self.service.repo.get.return_value=None
        with self.assertRaises(HTTPException) as error:
            await self.service.delete(self.user,uuid4())
        self.assertEqual(error.exception.status_code,404)
        self.db.delete.assert_not_awaited()

    async def test_list_uses_full_goal_period_and_has_no_additive_totals(self):
        budget=Node(id=uuid4(),name='Courses',category_id=self.category,date_from=date(2026,1,1),date_to=date(2026,12,31),period_type='year',amount=Decimal('1000'),wallet_ids=[self.wallet])
        self.service.repo.list.return_value=[budget]
        self.service.repo.activity.return_value={budget.id:[dict(date=date(2026,1,1),amount=Decimal('620.03'))]}
        self.service.repo.rules.return_value=[]
        self.service.repo.receipts.return_value=set()
        with patch('app.modules.budget.service.business_today',AsyncMock(return_value=date(2026,1,15))),patch('app.modules.budget.service.CategoryRepository') as repo:
            repo.return_value.list_tree=AsyncMock(return_value=[])
            result=await self.service.list(self.user,date(2026,1,1),date(2026,1,31))
        self.assertEqual(result.items[0].remaining,Decimal('379.97'))
        self.assertEqual(result.items[0].spent,Decimal('620.03'))
        self.assertEqual(set(result.model_dump()),{'as_of','items'})
        self.service.repo.receipts.assert_awaited_once_with(self.user,date(2026,1,1),date(2026,12,31))

    async def test_definition_listing_keeps_owner_scope_and_never_calculates_forecasts(self):
        from app.core.pagination import PagePaginationParams
        from sqlalchemy.dialects import postgresql
        row=Node(id=uuid4(),**self.payload.model_dump())
        self.db.scalar.return_value=21
        self.db.scalars.return_value=Mock(all=Mock(return_value=[row]))
        with patch('app.modules.budget.service.business_today',AsyncMock(return_value=date(2026,1,15))):
            result=await self.service.definitions(self.user,PagePaginationParams(page=2,page_size=20))
        self.assertEqual(result.pagination.total_pages,2)
        self.assertEqual(result.items[0].id,row.id)
        for statement in [self.db.scalar.await_args.args[0],self.db.scalars.await_args.args[0]]:
            compiled=statement.compile(dialect=postgresql.dialect())
            self.assertIn(self.user,compiled.params.values())
            self.assertIn('budgets.user_id =',str(compiled))
        compiled=self.db.scalars.await_args.args[0].compile(dialect=postgresql.dialect())
        self.assertEqual(self.db.scalars.await_args.args[0]._limit_clause.value,20)
        self.assertEqual(self.db.scalars.await_args.args[0]._offset_clause.value,20)
        self.service.repo.activity.assert_not_awaited()
        self.service.repo.rules.assert_not_awaited()
        self.db.commit.assert_awaited_once()

    async def test_repeating_single_period_edit_does_not_change_template(self):
        payload=self.payload.model_copy(update={'repeats':True})
        existing=Node(id=uuid4(),series_id=uuid4(),is_override=False,**payload.model_dump())
        self.service.repo.get.return_value=existing
        self.service.put=AsyncMock(return_value=existing)
        result=await self.service.save(self.user,payload,existing.id,'period')
        self.assertTrue(result.is_override)
        self.service.series_manager.replace_following.assert_not_awaited()
        self.db.commit.assert_awaited_once()

    async def test_following_scope_is_explicit_and_frequency_cannot_be_moved(self):
        payload=self.payload.model_copy(update={'repeats':True})
        existing=Node(id=uuid4(),series_id=uuid4(),is_override=False,**payload.model_dump())
        self.service.repo.get.return_value=existing
        await self.service.save(self.user,payload,existing.id,'following')
        self.service.series_manager.replace_following.assert_awaited_once_with(self.user,existing,payload)
        with self.assertRaises(HTTPException) as error:
            await self.service.save(self.user,payload.model_copy(update={'repeats':False}),existing.id,'period')
        self.assertEqual(error.exception.status_code,409)
        self.db.rollback.assert_awaited_once()
