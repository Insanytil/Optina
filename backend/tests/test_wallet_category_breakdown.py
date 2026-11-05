import unittest
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.modules.category.exceptions import CategoryNotFoundError
from app.modules.wallet.exceptions import WalletNotFoundError
from app.modules.wallet.repository.wallet_repository import WalletRepository
from app.modules.wallet.schemas import WalletCategoryParams
from app.modules.wallet.services.wallet_service import WalletService


class WalletCategoryBreakdownTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db, self.repo = AsyncMock(), AsyncMock()
        self.service = WalletService(self.db, self.repo, AsyncMock())
        self.user_id, self.wallet_id, self.parent_id = uuid4(), uuid4(), uuid4()
        self.repo.get_by_id.return_value = SimpleNamespace(id=self.wallet_id, name="Compte", balance=Decimal("10.00"),
            created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
        self.repo.direct_category_expenses.return_value = Decimal("1.23")
        self.repo.category_breakdown.return_value = [
            dict(category_id=uuid4(), name="Médecin", amount=Decimal("2.34")),
            dict(category_id=uuid4(), name="Pharmacie", amount=Decimal("5.67")),
        ]

    async def test_root_exposes_every_category_without_others_bucket(self):
        rows = [dict(category_id=uuid4(), name=str(index), amount=Decimal("1.01")) for index in range(15)]
        self.repo.category_breakdown.return_value = rows
        response = await self.service.category_breakdown(user_id=self.user_id, wallet_id=self.wallet_id, params=WalletCategoryParams())
        self.assertEqual(len(response.items), 15)
        self.assertEqual(response.total, Decimal("15.15"))
        self.assertEqual(response.path, [])
        self.assertEqual(response.direct_amount, Decimal("0.00"))
        self.repo.direct_category_expenses.assert_not_awaited()

    async def test_children_and_direct_expenses_conserve_branch_total(self):
        path = [SimpleNamespace(id=uuid4(), name="Dépenses"), SimpleNamespace(id=self.parent_id, name="Santé")]
        params = WalletCategoryParams(category_id=self.parent_id, date_from=date(2026, 1, 1), date_to=date(2026, 1, 31))
        with patch('app.modules.category.services.category_service.CategoryService.path', new_callable=AsyncMock, return_value=path) as load_path:
            response = await self.service.category_breakdown(user_id=self.user_id, wallet_id=self.wallet_id, params=params)
        load_path.assert_awaited_once_with(user_id=self.user_id, category_id=self.parent_id)
        self.assertEqual(response.total, Decimal("9.24"))
        self.assertEqual(response.direct_amount, Decimal("1.23"))
        self.assertEqual([item.name for item in response.path], ["Dépenses", "Santé"])
        self.repo.category_breakdown.assert_awaited_once_with(user_id=self.user_id, wallet_id=self.wallet_id,
            category_id=self.parent_id, date_from=params.date_from, date_to=params.date_to)

    async def test_leaf_keeps_direct_amount_without_inventing_children(self):
        self.repo.category_breakdown.return_value = []
        with patch('app.modules.category.services.category_service.CategoryService.path', new_callable=AsyncMock,
                   return_value=[SimpleNamespace(id=self.parent_id, name="Feuille")]):
            response = await self.service.category_breakdown(user_id=self.user_id, wallet_id=self.wallet_id, params=WalletCategoryParams(category_id=self.parent_id))
        self.assertEqual(response.items, [])
        self.assertEqual(response.total, Decimal("1.23"))

    async def test_zero_amount_children_are_retained_for_navigation(self):
        self.repo.category_breakdown.return_value = [dict(category_id=uuid4(), name="Vide", amount=Decimal("0.00"))]
        response = await self.service.category_breakdown(user_id=self.user_id, wallet_id=self.wallet_id, params=WalletCategoryParams())
        self.assertEqual(len(response.items), 1)
        self.assertEqual(response.total, Decimal("0.00"))

    async def test_foreign_category_never_runs_the_aggregation(self):
        with patch('app.modules.category.services.category_service.CategoryService.path', new_callable=AsyncMock, side_effect=CategoryNotFoundError()):
            with self.assertRaises(CategoryNotFoundError):
                await self.service.category_breakdown(user_id=self.user_id, wallet_id=self.wallet_id, params=WalletCategoryParams(category_id=uuid4()))
        self.repo.category_breakdown.assert_not_awaited()
        self.repo.direct_category_expenses.assert_not_awaited()

    async def test_foreign_wallet_never_runs_the_aggregation(self):
        self.repo.get_by_id.return_value = None
        with self.assertRaises(WalletNotFoundError):
            await self.service.category_breakdown(user_id=self.user_id, wallet_id=self.wallet_id, params=WalletCategoryParams())
        self.repo.category_breakdown.assert_not_awaited()

    async def test_sql_rolls_up_descendants_and_keeps_zero_amount_children(self):
        db = MagicMock()
        db.execute = AsyncMock(return_value=MagicMock())
        db.execute.return_value.mappings.return_value.all.return_value = []
        repository = WalletRepository(db)
        await repository.category_breakdown(user_id=self.user_id, wallet_id=self.wallet_id, category_id=self.parent_id,
            date_from=date(2026, 1, 1), date_to=date(2026, 1, 31))
        sql = db.execute.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("WITH RECURSIVE expense_branches", str(sql))
        self.assertIn("LEFT OUTER JOIN wallet_transactions", str(sql))
        self.assertIn("categories.parent_id =", str(sql))
        self.assertIn(self.parent_id, sql.params.values())
        self.assertIn(self.user_id, sql.params.values())
        self.assertIn(self.wallet_id, sql.params.values())
        self.assertIn("standard", sql.params.values())
        self.assertIn("expense", sql.params.values())
