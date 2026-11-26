import unittest
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from pydantic import ValidationError

from app.models.wallet_transaction import TransactionKind
from app.modules.transaction.exceptions import TransactionNotFoundError, TransactionValidationError
from app.modules.transaction.schemas import TransactionCreate, TransactionUpdate, TransactionListParams
from app.modules.transaction.services.transaction_service import TransactionService


class TransactionServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db, self.repo, self.wallets, self.categories = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
        self.service = TransactionService(self.db, self.repo, self.wallets, self.categories)
        self.user_id, self.wallet_id, self.category_id = uuid4(), uuid4(), uuid4()
        self.wallets.lock_many.return_value = [SimpleNamespace(id=self.wallet_id)]
        self.transaction = SimpleNamespace(id=uuid4(), wallet_id=self.wallet_id, category_id=self.category_id,
            type="expense", kind="standard", amount=Decimal("10.00"), date=date.today(), label="Courses", note=None,
            created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
        self.repo.create.return_value = self.transaction
        self.repo.get_by_id.return_value = self.transaction
        self.repo.lock_category.return_value = SimpleNamespace(id=self.category_id)

    def payload(self, **changes):
        values = dict(wallet_id=self.wallet_id, category_id=self.category_id, type="expense", amount="25.00", date=date.today(), label="Courses")
        values.update(changes)
        return values

    async def test_expense_and_income_creation_use_signed_atomic_adjustment(self):
        for type, delta in [("expense", Decimal("-25.00")), ("income", Decimal("25.00"))]:
            with self.subTest(type=type):
                await self.service.create(user_id=self.user_id, payload=TransactionCreate(**self.payload(type=type)))
                self.wallets.adjust_balance.assert_awaited_with(user_id=self.user_id, wallet_id=self.wallet_id, amount=delta)
                self.repo.lock_category.assert_awaited_with(user_id=self.user_id, category_id=self.category_id)
        self.assertEqual(self.db.commit.await_count, 2)

    async def test_failed_insert_rolls_back_and_never_adjusts_balance(self):
        self.repo.create.side_effect = RuntimeError("failed")
        with self.assertRaises(RuntimeError):
            await self.service.create(user_id=self.user_id, payload=TransactionCreate(**self.payload()))
        self.wallets.adjust_balance.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_foreign_wallet_is_rejected_before_insertion(self):
        self.wallets.lock_many.return_value = []
        with self.assertRaises(TransactionNotFoundError):
            await self.service.create(user_id=self.user_id, payload=TransactionCreate(**self.payload()))
        self.repo.create.assert_not_awaited()

    async def test_foreign_category_is_rejected_before_insertion(self):
        self.repo.lock_category.return_value = None
        with self.assertRaises(TransactionNotFoundError):
            await self.service.create(user_id=self.user_id, payload=TransactionCreate(**self.payload()))
        self.repo.create.assert_not_awaited()

    async def test_edit_uses_delta_and_locks_original_transaction(self):
        await self.service.update(user_id=self.user_id, transaction_id=self.transaction.id, payload=TransactionUpdate(**self.payload()))
        self.repo.get_by_id.assert_awaited_once_with(user_id=self.user_id, transaction_id=self.transaction.id, for_update=True)
        self.wallets.adjust_balance.assert_awaited_once_with(user_id=self.user_id, wallet_id=self.wallet_id, amount=Decimal("-15.00"))
        self.assertEqual(self.transaction.amount, Decimal("25.00"))
        self.db.commit.assert_awaited_once()

    async def test_change_expense_to_income_reverses_old_effect(self):
        await self.service.update(user_id=self.user_id, transaction_id=self.transaction.id, payload=TransactionUpdate(**self.payload(type="income")))
        self.wallets.adjust_balance.assert_awaited_once_with(user_id=self.user_id, wallet_id=self.wallet_id, amount=Decimal("35.00"))

    async def test_correcting_wallet_locks_both_in_stable_order(self):
        other = uuid4()
        self.wallets.lock_many.return_value.append(SimpleNamespace(id=other))
        await self.service.update(user_id=self.user_id, transaction_id=self.transaction.id, payload=TransactionUpdate(**self.payload(wallet_id=other)))
        self.wallets.lock_many.assert_awaited_once_with(user_id=self.user_id, wallet_ids=sorted([self.wallet_id, other]))
        self.wallets.adjust_balance.assert_any_await(user_id=self.user_id, wallet_id=self.wallet_id, amount=Decimal("10.00"))
        self.wallets.adjust_balance.assert_any_await(user_id=self.user_id, wallet_id=other, amount=Decimal("-25.00"))

    async def test_delete_reverses_effect_once(self):
        self.repo.get_by_id.side_effect = [self.transaction, None]
        await self.service.delete(user_id=self.user_id, transaction_id=self.transaction.id)
        with self.assertRaises(TransactionNotFoundError):
            await self.service.delete(user_id=self.user_id, transaction_id=self.transaction.id)
        self.wallets.adjust_balance.assert_awaited_once_with(user_id=self.user_id, wallet_id=self.wallet_id, amount=Decimal("10.00"))
        self.repo.delete.assert_awaited_once_with(self.transaction)

    async def test_opening_balance_can_be_edited_without_category(self):
        self.transaction.kind = TransactionKind.OPENING_BALANCE
        self.transaction.category_id = None
        await self.service.update(user_id=self.user_id, transaction_id=self.transaction.id, payload=TransactionUpdate(**self.payload(category_id=None)))
        self.assertEqual(self.transaction.kind, TransactionKind.OPENING_BALANCE)
        self.repo.lock_category.assert_not_awaited()

    async def test_opening_balance_cannot_move_to_another_wallet(self):
        self.transaction.kind = TransactionKind.OPENING_BALANCE
        with self.assertRaises(TransactionValidationError):
            await self.service.update(user_id=self.user_id, transaction_id=self.transaction.id, payload=TransactionUpdate(**self.payload(wallet_id=uuid4(), category_id=None)))
        self.wallets.adjust_balance.assert_not_awaited()

    async def test_standard_transaction_always_requires_category(self):
        with self.assertRaises(TransactionValidationError):
            await self.service.update(user_id=self.user_id, transaction_id=self.transaction.id, payload=TransactionUpdate(**self.payload(category_id=None)))
        self.wallets.adjust_balance.assert_not_awaited()

    async def test_commit_failure_rolls_back_everything(self):
        self.db.commit.side_effect = RuntimeError("failed")
        with self.assertRaises(RuntimeError):
            await self.service.create(user_id=self.user_id, payload=TransactionCreate(**self.payload()))
        self.db.rollback.assert_awaited_once()

    async def test_list_builds_metadata_and_preserves_all_filters(self):
        params = TransactionListParams(type="income", kind="standard", page=2)
        self.repo.count_for_user.return_value = 21
        self.repo.net_for_user.return_value = Decimal("-12.50")
        self.repo.list_for_user.return_value = [self.transaction]
        result = await self.service.list_for_user(user_id=self.user_id, params=params)
        self.assertEqual(result.pagination.total_pages, 2)
        self.repo.list_for_user.assert_awaited_once_with(user_id=self.user_id, params=params)

    def test_validation_rejects_ambiguous_amounts_future_dates_and_private_fields(self):
        for changes in [{"amount": "0"}, {"amount": "-10"}, {"amount": "1.234"}, {"amount": "NaN"}, {"amount": "Infinity"},
                        {"date": date.today() + timedelta(days=1)}, {"category_id": None}, {"type": "transfer"},
                        {"label": " "}, {"user_id": uuid4()}, {"kind": "opening_balance"}]:
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                TransactionCreate(**self.payload(**changes))
        with self.assertRaises(ValidationError):
            TransactionListParams(date_from=date.today(), date_to=date.today() - timedelta(days=1))
