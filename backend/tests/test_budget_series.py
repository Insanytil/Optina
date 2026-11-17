import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace as Node
from unittest.mock import AsyncMock, Mock
from uuid import uuid4
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.budget.schedule import periods, template_at, previous_start
from app.modules.budget.schemas import BudgetWrite
from app.modules.budget.series import BudgetSeriesManager


class BudgetScheduleTests(unittest.TestCase):
    def test_calendar_months_include_leap_day_and_reset_at_month_boundary(self):
        rows=list(periods('month',date(2024,1,1),None,date(2024,2,15),date(2024,3,1)))
        self.assertEqual(rows,[(date(2024,2,1),date(2024,2,29)),(date(2024,3,1),date(2024,3,31))])

    def test_week_crosses_year_and_series_end_is_inclusive(self):
        rows=list(periods('week',date(2025,12,29),date(2026,1,11),date(2025,12,31),date(2027,1,1)))
        self.assertEqual(rows,[(date(2025,12,29),date(2026,1,4)),(date(2026,1,5),date(2026,1,11))])

    def test_query_does_not_generate_all_periods_since_series_start(self):
        rows=list(periods('month',date(1900,1,1),None,date(2026,11,1),date(2026,11,30)))
        self.assertEqual(rows,[(date(2026,11,1),date(2026,11,30))])
        self.assertEqual(list(periods('year',date(2030,1,1),None,date(2026,1,1),date(2026,12,31))),[])

    def test_template_revision_preserves_reference_amount_before_its_start(self):
        old=Node(effective_from=date(2026,1,1),amount=Decimal('900'))
        new=Node(effective_from=date(2026,4,1),amount=Decimal('1000'))
        self.assertIs(template_at([new,old],date(2026,3,1)),old)
        self.assertIs(template_at([new,old],date(2026,4,1)),new)
        self.assertIsNone(template_at([old],date(2025,12,1)))
        self.assertEqual(previous_start('month',date(2026,2,1),11),date(2025,3,1))
        self.assertEqual(previous_start('quarter',date(2026,1,1),1),date(2025,10,1))

    def test_repeat_schema_requires_calendar_period_and_valid_end(self):
        values=dict(name='Courses',category_id=uuid4(),wallet_ids=[uuid4()],amount='900',period_type='month',date_from='2026-01-01',date_to='2026-01-31',repeats=True)
        self.assertTrue(BudgetWrite(**values).repeats)
        self.assertEqual(BudgetWrite(**{**values,'repeat_until':'2026-12-31'}).repeat_until,date(2026,12,31))
        for changes in [{'period_type':'custom'},{'repeat_until':'2026-12-15'},{'repeat_until':'2025-12-31'},{'repeats':False,'repeat_until':'2026-12-31'}]:
            with self.subTest(changes=changes),self.assertRaises(ValidationError):
                BudgetWrite(**{**values,**changes})


class BudgetMaterializationTests(unittest.IsolatedAsyncioTestCase):
    async def test_periods_use_dated_templates_and_existing_periods_are_not_overwritten(self):
        user,identifier,wallet,category=[uuid4() for _ in range(4)]
        series=Node(id=identifier,user_id=user,period_type='month',start_date=date(2026,1,1),end_date=None)
        old=Node(series_id=identifier,effective_from=date(2026,1,1),name='Courses',category_id=category,amount=Decimal('900'),wallet_ids=[wallet])
        new=Node(**{**vars(old),'effective_from':date(2026,3,1),'amount':Decimal('1000')})
        db=AsyncMock(spec=AsyncSession)
        db.scalars.side_effect=[Mock(all=Mock(return_value=[series])),Mock(all=Mock(return_value=[old,new]))]
        # February already exists as an individually customized period: it stays untouched.
        db.execute.return_value=Mock(all=Mock(return_value=[(identifier,date(2026,2,1))]))
        created=[]
        async def put(owner,payload,**kwargs):
            self.assertEqual(owner,user)
            row=Node(**payload.model_dump())
            created.append(row)
            return row
        await BudgetSeriesManager(db,put).materialize(user,date(2026,1,1),date(2026,3,31))
        self.assertEqual([(row.date_from,row.amount) for row in created],[(date(2026,1,1),Decimal('900')),(date(2026,3,1),Decimal('1000'))])
        self.assertTrue(all(row.series_id==identifier for row in created))
        # Repeating the same request with all periods present creates nothing.
        db.scalars.side_effect=[Mock(all=Mock(return_value=[series])),Mock(all=Mock(return_value=[old,new]))]
        db.execute.return_value=Mock(all=Mock(return_value=[(identifier,date(2026,month,1)) for month in [1,2,3]]))
        await BudgetSeriesManager(db,put).materialize(user,date(2026,1,1),date(2026,3,31))
        self.assertEqual(len(created),2)

    async def test_ended_series_materializes_its_final_period_for_management(self):
        user,identifier=uuid4(),uuid4()
        row=Node(id=identifier,user_id=user,period_type='month',start_date=date(2020,1,1),end_date=date(2025,12,31))
        db=AsyncMock(spec=AsyncSession)
        db.scalars.return_value=Mock(all=Mock(return_value=[row]))
        manager=BudgetSeriesManager(db,AsyncMock())
        manager.create_missing=AsyncMock()
        await manager.current(user,date(2026,11,6))
        manager.create_missing.assert_awaited_once_with(user,[(row,date(2025,12,1),date(2025,12,31))])
