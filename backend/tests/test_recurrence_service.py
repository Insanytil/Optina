import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.wallet_transaction import WalletTransaction
from app.modules.recurrence.service import generate_due, build_forecast, RecurrenceService


class GenerationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = AsyncMock(spec=AsyncSession)
        self.db.add = Mock()
        self.rule = SimpleNamespace(id=uuid4(), user_id=uuid4(), wallet_id=uuid4(), category_id=uuid4(),
            label='Loyer', type='expense', amount=Decimal('900.25'), note=None,
            start_date=date(2026,1,31), next_date=date(2026,1,31), next_index=0,
            frequency_unit='month', interval=1, end_date=None, is_active=True, archived=False)
        self.wallets = AsyncMock()
        self.wallets.lock_many.return_value = [object()]

    async def generate(self, recorded=(), **kw):
        with patch('app.modules.recurrence.service.WalletRepository', return_value=self.wallets), patch('app.modules.recurrence.service.RecurrenceRepository') as repo:
            repo.return_value.recorded_dates = AsyncMock(return_value=set(recorded))
            return await generate_due(self.db, self.rule, date(2026,3,31), **kw)

    async def test_catchup_dates_balance_and_idempotent_cursor(self):
        self.assertEqual(await self.generate(), 3)
        movements = [c.args[0] for c in self.db.add.call_args_list if isinstance(c.args[0], WalletTransaction)]
        self.assertEqual([m.date for m in movements], [date(2026,1,31),date(2026,2,28),date(2026,3,31)])
        self.assertEqual(self.wallets.adjust_balance.await_count, 3)
        self.assertEqual(self.wallets.adjust_balance.await_args.kwargs['amount'], Decimal('-900.25'))
        self.assertEqual(self.rule.next_date, date(2026,4,30))
        self.db.commit.assert_not_awaited()
        self.assertEqual(await self.generate(), 0)

    async def test_receipt_retained_after_transaction_deletion_prevents_recreation(self):
        self.assertEqual(await self.generate([date(2026,1,31),date(2026,2,28),date(2026,3,31)]), 3)
        self.wallets.adjust_balance.assert_not_awaited()
        self.db.add.assert_not_called()

    async def test_paused_and_archived_post_nothing(self):
        self.rule.is_active = False
        self.assertEqual(await self.generate(), 0)
        self.rule.is_active = True
        self.rule.archived = True
        self.assertEqual(await self.generate(), 0)
        self.db.add.assert_not_called()

    async def test_income_bounded_batch_and_end(self):
        self.rule.type = 'income'
        self.rule.end_date = date(2026,2,28)
        self.assertEqual(await self.generate(batch_size=1), 1)
        self.assertEqual(self.rule.next_date, date(2026,2,28))
        self.assertEqual(await self.generate(), 1)
        self.assertIsNone(self.rule.next_date)
        self.assertEqual(self.wallets.adjust_balance.await_args.kwargs['amount'], Decimal('900.25'))

    async def test_resume_skips_occurrence_that_fell_during_pause(self):
        for cutoff, expected in [(date(2026,1,28),date(2026,1,29)),(date(2026,1,29),date(2026,2,26))]:
            self.rule.start_date = date(2026,1,1)
            self.rule.next_date = date(2026,1,1)
            self.rule.frequency_unit = 'week'
            self.rule.interval = 4
            self.rule.next_index = 0
            self.rule.is_active = False
            service = RecurrenceService(self.db)
            service.required = AsyncMock(return_value=self.rule)
            service.validate_links = AsyncMock()
            with patch('app.modules.recurrence.service.business_today',AsyncMock(return_value=date(2026,1,29))), patch(
                'app.modules.recurrence.service.daily_window',AsyncMock(return_value=(cutoff,3600))):
                result = await service.status(self.rule.user_id,self.rule.id,True)
                self.assertEqual(result.next_date,expected)


class ForecastTests(unittest.TestCase):
    def event(self, day, type, amount):
        return dict(recurrence_id=uuid4(), label='Test', type=type, amount=Decimal(amount), scheduled_date=date(2026,1,day), date=date(2026,1,day))

    def test_temporary_shortfall_even_with_positive_monthly_net(self):
        result = build_forecast(date(2026,1,1),date(2026,2,28),Decimal('100'),[
            self.event(2,'expense','300'),self.event(10,'income','1000'),self.event(10,'expense','100')])
        self.assertEqual(result.minimum_balance, Decimal('-200'))
        self.assertEqual(result.months[0].minimum_date, date(2026,1,2))
        self.assertEqual(result.months[0].closing_balance, Decimal('700'))
        self.assertEqual(result.months[1].opening_balance, Decimal('700'))
        self.assertEqual(result.months[1].expenses, 0)

    def test_same_day_flows_do_not_imply_intraday_shortfall(self):
        result = build_forecast(date(2026,1,1),date(2026,1,31),Decimal(0),[
            self.event(2,'expense','100'),self.event(2,'income','100')])
        self.assertEqual(result.minimum_balance, 0)
