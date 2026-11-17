import unittest
from types import SimpleNamespace as Node
from unittest.mock import AsyncMock, Mock
from uuid import uuid4
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.budget.views import BudgetViewService
from app.modules.budget.schemas import BudgetViewWrite


class BudgetViewTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db=AsyncMock(spec=AsyncSession)
        self.db.add=Mock()
        self.service=BudgetViewService(self.db)
        self.user,self.identifier,self.wallet=uuid4(),uuid4(),uuid4()
        self.payload=BudgetViewWrite(name=' Bilan ',preset='review',config={'period_types':['year'],'wallet_ids':[self.wallet]},is_default=True)

    async def test_foreign_reference_rejected_and_rolled_back_before_write(self):
        self.db.scalars.return_value=Mock(all=Mock(return_value=[]))
        with self.assertRaises(HTTPException) as error:
            await self.service.save_view(self.user,self.payload)
        self.assertEqual(error.exception.status_code,404)
        self.db.add.assert_not_called()
        self.db.commit.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_update_default_checks_owner_and_resets_only_owner_defaults(self):
        existing=Node(id=self.identifier,name='Ancien',preset='daily',config={},is_default=False)
        self.db.scalar.return_value=existing
        self.db.scalars.return_value=Mock(all=Mock(return_value=[self.wallet]))
        result=await self.service.save_view(self.user,self.payload,self.identifier)
        self.assertEqual(result.name,'Bilan')
        self.assertTrue(result.is_default)
        self.assertEqual(result.config.wallet_ids,[self.wallet])
        statements=[str(call.args[0]) for call in self.db.execute.await_args_list]
        self.assertIn('FOR UPDATE',statements[0])
        self.assertIn('WHERE budget_views.user_id =',statements[1])
        self.db.commit.assert_awaited_once()
        sql=self.db.scalar.await_args.args[0].compile()
        self.assertIn(self.user,sql.params.values())
        self.assertIn(self.identifier,sql.params.values())

    async def test_missing_view_cannot_be_deleted(self):
        self.db.scalar.return_value=None
        with self.assertRaises(HTTPException) as error:
            await self.service.delete_view(self.user,self.identifier)
        self.assertEqual(error.exception.status_code,404)
        self.db.delete.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    def test_schema_forbids_empty_views_unknown_widgets_and_owner_assignment(self):
        self.assertEqual(self.payload.name,'Bilan')
        for changes in [{'config':{'period_types':[]}},{'config':{'period_types':['month'],'widgets':[]}},{'config':{'period_types':['month'],'widgets':['unknown']}},{'user_id':str(self.user)}]:
            with self.subTest(changes=changes),self.assertRaises(ValidationError):
                BudgetViewWrite(**{**self.payload.model_dump(),**changes})
