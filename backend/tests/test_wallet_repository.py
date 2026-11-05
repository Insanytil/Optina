import unittest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.core.pagination import PagePaginationParams
from app.modules.wallet.repository.wallet_repository import WalletRepository


class WalletRepositoryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.flush = AsyncMock()
        self.db.scalar = AsyncMock(return_value=None)
        self.db.scalars = AsyncMock(return_value=MagicMock())
        self.repo = WalletRepository(self.db)
        self.user_id = uuid4()
        self.wallet_id = uuid4()

    async def test_create_preserves_decimal_and_leaves_commit_to_service(self):
        wallet = await self.repo.create(user_id=self.user_id, name="Courant")
        self.assertEqual(wallet.balance, Decimal("0.00"))
        self.assertEqual(wallet.user_id, self.user_id)
        self.db.add.assert_called_once_with(wallet)
        self.db.flush.assert_awaited_once()
        self.db.commit.assert_not_called()

    async def test_all_individual_operations_filter_by_wallet_and_owner(self):
        for method, extra in [
            (self.repo.get_by_id, {}),
            (self.repo.rename, {"name": "Épargne"}),
            (self.repo.adjust_balance, {"amount": Decimal("-12.34")}),
            (self.repo.delete, {}),
        ]:
            with self.subTest(method=method.__name__):
                result = await method(wallet_id=self.wallet_id, user_id=self.user_id, **extra)
                self.assertEqual(result, False if method == self.repo.delete else None)
                statement = self.db.scalar.call_args.args[0]
                where = statement.whereclause.compile(dialect=postgresql.dialect())
                self.assertIn("wallets.id =", str(where))
                self.assertIn("wallets.user_id =", str(where))
                self.assertIn(self.wallet_id, where.params.values())
                self.assertIn(self.user_id, where.params.values())
        self.db.commit.assert_not_called()

    async def test_balance_adjustment_uses_atomic_sql_increment(self):
        await self.repo.adjust_balance(wallet_id=self.wallet_id, user_id=self.user_id, amount=Decimal("1.23"))
        compiled = self.db.scalar.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("balance=(wallets.balance +", str(compiled))
        self.assertIn(Decimal("1.23"), compiled.params.values())

    async def test_list_is_scoped_paginated_and_ordered(self):
        wallets = [MagicMock()]
        self.db.scalars.return_value.all.return_value = wallets
        result = await self.repo.list_for_user(user_id=self.user_id, pagination=PagePaginationParams(page=3, page_size=10))
        self.assertEqual(result, wallets)
        compiled = self.db.scalars.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("wallets.user_id =", str(compiled))
        self.assertIn("ORDER BY wallets.created_at DESC, wallets.id DESC", str(compiled))
        self.assertIn(self.user_id, compiled.params.values())
        self.assertIn(10, compiled.params.values())
        self.assertIn(20, compiled.params.values())

    async def test_invalid_pagination_never_queries_database(self):
        for kwargs in [{"page_size": 0}, {"page_size": 101}, {"page": 0}]:
            with self.assertRaises(ValueError):
                await self.repo.list_for_user(user_id=self.user_id, pagination=PagePaginationParams(**kwargs))
        self.db.scalars.assert_not_awaited()

    async def test_delete_reports_success(self):
        self.db.scalar.return_value = self.wallet_id
        self.assertTrue(await self.repo.delete(wallet_id=self.wallet_id, user_id=self.user_id))

    async def test_summary_is_owner_scoped_inclusive_and_excludes_opening_movements(self):
        from datetime import date
        self.db.execute = AsyncMock(return_value=MagicMock())
        self.db.execute.return_value.one_or_none.return_value = None
        result = await self.repo.get_summary(user_id=self.user_id, wallet_id=self.wallet_id,
            date_from=date(2026, 1, 1), date_to=date(2026, 1, 31))
        self.assertIsNone(result)
        query = self.db.execute.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("LEFT OUTER JOIN wallet_transactions", str(query))
        self.assertIn("wallet_transactions.user_id = wallets.user_id", str(query))
        self.assertIn("wallet_transactions.date >=", str(query))
        self.assertIn("wallet_transactions.date <=", str(query))
        self.assertIn("standard", query.params.values())
        self.assertIn(self.user_id, query.params.values())
        self.assertIn(self.wallet_id, query.params.values())
        self.db.scalars.assert_not_awaited()

    async def test_analytics_queries_are_scoped_exclude_openings_and_aggregate_in_sql(self):
        from datetime import date
        self.db.execute = AsyncMock(return_value=MagicMock())
        self.db.execute.return_value.mappings.return_value.all.return_value = []
        args = dict(user_id=self.user_id, wallet_id=self.wallet_id, date_from=date(2026, 1, 1), date_to=date(2026, 1, 31))
        for name in ["expenses_by_date", "expenses_by_category", "monthly_movements", "top_expenses", "activity"]:
            with self.subTest(method=name):
                extra = {"granularity": "day"} if name == "expenses_by_date" else {}
                await getattr(self.repo, name)(**args, **extra)
                query = self.db.execute.call_args.args[0].compile(dialect=postgresql.dialect())
                self.assertIn(self.user_id, query.params.values())
                self.assertIn(self.wallet_id, query.params.values())
                self.assertIn("standard", query.params.values())
                self.assertIn(date(2026, 1, 1), query.params.values())
                self.assertIn(date(2026, 1, 31), query.params.values())
                if name == "expenses_by_category":
                    self.assertIn("WITH RECURSIVE category_roots", str(query))
                    self.assertIn("GROUP BY", str(query))
                if name == "top_expenses":
                    self.assertIn(5, query.params.values())
