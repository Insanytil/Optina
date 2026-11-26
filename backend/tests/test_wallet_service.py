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
        self.transactions = AsyncMock()
        self.service = WalletService(self.db, self.repo, self.transactions)
        self.user_id = uuid4()
        self.repo.has_transactions.return_value = False
        self.repo.has_live_recurrences.return_value = False
        self.wallet = SimpleNamespace(id=uuid4(), name="Courant", color="#3b82f6", balance=Decimal("12.34"), created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
        self.repo.lock_many.return_value = [self.wallet]
        self.repo.used_colors.return_value = []

    async def test_create_commits_and_preserves_amount(self):
        self.repo.create.return_value = self.wallet
        payload = WalletCreate(name=" Courant ", balance="12.34")
        result = await self.service.create(user_id=self.user_id, payload=payload)
        self.repo.create.assert_awaited_once_with(user_id=self.user_id, name="Courant", color="#3b82f6", balance=Decimal("12.34"))
        self.db.commit.assert_awaited_once()
        self.assertEqual(result.model_dump(mode="json")["balance"], "12.34")

    async def test_failed_commit_rolls_back(self):
        self.repo.create.return_value = self.wallet
        self.db.commit.side_effect = RuntimeError("failed")
        with self.assertRaises(RuntimeError):
            await self.service.create(user_id=self.user_id, payload=WalletCreate(name="Courant"))
        self.db.rollback.assert_awaited_once()

    async def test_create_picks_first_unused_color_unless_one_is_given(self):
        self.repo.create.return_value = self.wallet
        self.repo.used_colors.return_value = ["#3b82f6", "#8b5cf6"]
        await self.service.create(user_id=self.user_id, payload=WalletCreate(name="Livret"))
        self.assertEqual(self.repo.create.call_args.kwargs["color"], "#f59e0b")
        await self.service.create(user_id=self.user_id, payload=WalletCreate(name="Joint", color="#EC4899"))
        self.assertEqual(self.repo.create.call_args.kwargs["color"], "#ec4899")

    async def test_update_passes_new_color(self):
        self.repo.rename.return_value = self.wallet
        await self.service.update(wallet_id=self.wallet.id, user_id=self.user_id, payload=WalletUpdate(name="Courant", color="#06b6d4"))
        self.repo.rename.assert_awaited_once_with(wallet_id=self.wallet.id, user_id=self.user_id, name="Courant", color="#06b6d4")

    def test_invalid_color_is_rejected(self):
        from pydantic import ValidationError
        for value in ("blue", "#12345", "#gggggg"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                WalletUpdate(name="Courant", color=value)

    def test_next_color_reuses_least_used_once_palette_is_full(self):
        from app.modules.wallet.colors import WALLET_COLORS, next_color
        used = list(WALLET_COLORS) + [WALLET_COLORS[0]]
        self.assertEqual(next_color(used), WALLET_COLORS[1])

    async def test_missing_or_foreign_wallet_update_does_not_commit(self):
        self.repo.rename.return_value = None
        with self.assertRaises(WalletNotFoundError):
            await self.service.update(wallet_id=self.wallet.id, user_id=self.user_id, payload=WalletUpdate(name="Épargne"))
        self.repo.rename.assert_awaited_once_with(wallet_id=self.wallet.id, user_id=self.user_id, name="Épargne", color=None)
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

    async def test_nonzero_initial_balance_creates_opening_once_without_adjusting_balance(self):
        self.repo.create.return_value = self.wallet
        await self.service.create(user_id=self.user_id, payload=WalletCreate(name="Courant", balance="-12.34"))
        args = self.transactions.create.call_args.kwargs
        self.assertEqual(args["kind"], "opening_balance")
        self.assertEqual(args["type"], "expense")
        self.assertEqual(args["amount"], Decimal("12.34"))
        self.assertIsNone(args["category_id"])
        self.repo.adjust_balance.assert_not_awaited()

    async def test_zero_initial_balance_does_not_create_empty_opening(self):
        self.repo.create.return_value = self.wallet
        await self.service.create(user_id=self.user_id, payload=WalletCreate(name="Vide"))
        self.transactions.create.assert_not_awaited()

    async def test_wallet_with_transactions_cannot_be_deleted(self):
        from app.modules.wallet.exceptions import WalletInUseError
        self.repo.has_transactions.return_value = True
        with self.assertRaises(WalletInUseError):
            await self.service.delete(user_id=self.user_id, wallet_id=self.wallet.id)
        self.repo.delete.assert_not_awaited()

    async def test_delete_purges_archived_recurrences_first(self):
        self.repo.delete.return_value = True
        await self.service.delete(user_id=self.user_id, wallet_id=self.wallet.id)
        self.repo.purge_archived_recurrences.assert_awaited_once_with(user_id=self.user_id, wallet_id=self.wallet.id)
        self.db.commit.assert_awaited_once()

    async def test_wallet_with_live_recurrence_cannot_be_deleted(self):
        from app.modules.wallet.exceptions import WalletInUseError
        self.repo.has_live_recurrences.return_value = True
        with self.assertRaises(WalletInUseError):
            await self.service.delete(user_id=self.user_id, wallet_id=self.wallet.id)
        self.repo.purge_archived_recurrences.assert_not_awaited()
        self.repo.delete.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_summary_uses_database_aggregate_and_keeps_current_balance(self):
        from datetime import date
        from app.modules.wallet.schemas import WalletPeriod
        period = WalletPeriod(date_from=date(2026, 1, 1), date_to=date(2026, 1, 31))
        self.repo.get_summary.return_value = (self.wallet, Decimal("100.00"), Decimal("25.50"))
        result = await self.service.summary(user_id=self.user_id, wallet_id=self.wallet.id, period=period)
        self.assertEqual(result.net, Decimal("74.50"))
        self.assertEqual(result.wallet.balance, self.wallet.balance)
        self.repo.get_summary.assert_awaited_once_with(user_id=self.user_id, wallet_id=self.wallet.id,
            date_from=period.date_from, date_to=period.date_to)
        self.db.commit.assert_not_awaited()

    async def test_summary_missing_or_foreign_wallet_is_not_found(self):
        from app.modules.wallet.schemas import WalletPeriod
        self.repo.get_summary.return_value = None
        with self.assertRaises(WalletNotFoundError):
            await self.service.summary(user_id=self.user_id, wallet_id=self.wallet.id, period=WalletPeriod())

    async def test_summary_empty_period_has_zero_totals_and_retains_wallet(self):
        from app.modules.wallet.schemas import WalletPeriod
        self.repo.get_summary.return_value = (self.wallet, Decimal("0.00"), Decimal("0.00"))
        result = await self.service.summary(user_id=self.user_id, wallet_id=self.wallet.id, period=WalletPeriod())
        self.assertEqual(result.income, Decimal("0.00"))
        self.assertEqual(result.expenses, Decimal("0.00"))
        self.assertEqual(result.net, Decimal("0.00"))
        self.assertEqual(result.wallet.balance, self.wallet.balance)

    def test_summary_period_rejects_reversed_dates_and_handles_leap_year(self):
        from datetime import date
        from app.modules.wallet.schemas import WalletPeriod
        with self.assertRaises(ValidationError):
            WalletPeriod(date_from=date(2026, 2, 1), date_to=date(2026, 1, 31))
        period = WalletPeriod(date_from=date(2024, 2, 1), date_to=date(2024, 2, 29))
        self.assertEqual(period.date_to.day, 29)

    async def test_analytics_fills_months_and_scopes_all_aggregates(self):
        from datetime import date
        from app.modules.wallet.schemas import WalletPeriod
        self.repo.get_by_id.return_value = self.wallet
        for method in ["expenses_by_date", "expenses_by_category", "monthly_movements", "activity", "top_expenses"]:
            getattr(self.repo, method).return_value = []
        self.repo.monthly_movements.return_value = [{"month": "2026-01", "income": Decimal("10.00"), "expenses": Decimal("2.00")}]
        period = WalletPeriod(date_from=date(2026, 1, 1), date_to=date(2026, 1, 31))
        result = await self.service.analytics(user_id=self.user_id, wallet_id=self.wallet.id, period=period)
        self.assertEqual(len(result.monthly), 12)
        self.assertEqual(result.monthly[0].month, "2025-02")
        self.assertEqual(result.monthly[-1].income, Decimal("10.00"))
        self.assertEqual(result.monthly[0].expenses, Decimal("0.00"))
        self.assertEqual(result.expense_granularity, "day")
        self.assertEqual(len(result.expenses_by_date), 31)
        self.assertTrue(all(row.amount == Decimal("0.00") for row in result.expenses_by_date))
        for method in ["expenses_by_date", "expenses_by_category", "monthly_movements", "activity", "top_expenses"]:
            kwargs = getattr(self.repo, method).call_args.kwargs
            self.assertEqual(kwargs["user_id"], self.user_id)
            self.assertEqual(kwargs["wallet_id"], self.wallet.id)
        self.assertEqual((result.activity_to - result.activity_from).days, 89)

    async def test_analytics_groups_remaining_categories_without_losing_money(self):
        from datetime import date
        from uuid import uuid4
        from app.modules.wallet.schemas import WalletPeriod
        self.repo.get_by_id.return_value = self.wallet
        for method in ["expenses_by_date", "monthly_movements", "activity", "top_expenses"]:
            getattr(self.repo, method).return_value = []
        self.repo.expenses_by_category.return_value = [dict(category_id=uuid4(), name=str(n), amount=Decimal("1.01")) for n in range(10)]
        result = await self.service.analytics(user_id=self.user_id, wallet_id=self.wallet.id,
            period=WalletPeriod(date_from=date(2026, 1, 1), date_to=date(2026, 12, 31)))
        self.assertEqual(result.expense_granularity, "week")
        self.assertEqual(len(result.expenses_by_category), 7)
        self.assertEqual(result.expenses_by_category[-1].name, "Autres")
        self.assertEqual(result.expenses_by_category[-1].amount, Decimal("4.04"))
        self.assertEqual(sum(row.amount for row in result.expenses_by_category), Decimal("10.10"))

    async def test_analytics_refuses_foreign_wallet_before_running_aggregates(self):
        from app.modules.wallet.schemas import WalletPeriod
        self.repo.get_by_id.return_value = None
        with self.assertRaises(WalletNotFoundError):
            await self.service.analytics(user_id=self.user_id, wallet_id=self.wallet.id, period=WalletPeriod())
        self.repo.expenses_by_date.assert_not_awaited()
