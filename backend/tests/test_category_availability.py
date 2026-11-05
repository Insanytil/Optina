import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.category.availability import available, validate_active_recurrences, set_availability
from app.modules.category.exceptions import CategoryHierarchyError
from app.modules.category.repository.category_repository import CategoryRepository
from app.modules.transaction.exceptions import TransactionValidationError
from app.modules.transaction.services.transaction_service import TransactionService
from app.modules.transaction.schemas import TransactionCreate, TransactionUpdate
from app.modules.recurrence.service import RecurrenceService
from fastapi import HTTPException


class AvailabilityTests(unittest.TestCase):
    def test_unrestricted_includes_future_wallets(self):
        node = SimpleNamespace(id=uuid4(),parent_id=None,wallet_ids=None)
        self.assertTrue(available({node.id:node},node.id,uuid4()))

    def test_inheritance_intersection_and_empty_selection(self):
        a,b,c = uuid4(),uuid4(),uuid4()
        root = SimpleNamespace(id=uuid4(),parent_id=None,wallet_ids=[a,b])
        child = SimpleNamespace(id=uuid4(),parent_id=root.id,wallet_ids=[b,c])
        leaf = SimpleNamespace(id=uuid4(),parent_id=child.id,wallet_ids=None)
        nodes = {n.id:n for n in [root,child,leaf]}
        self.assertTrue(available(nodes,leaf.id,b))
        self.assertFalse(available(nodes,leaf.id,a))
        self.assertFalse(available(nodes,leaf.id,c))
        child.wallet_ids = []
        self.assertFalse(available(nodes,leaf.id,b))

    def test_deep_tree_missing_category_and_cycles(self):
        nodes = {}
        parent = None
        for _ in range(1200):
            node = SimpleNamespace(id=uuid4(),parent_id=parent,wallet_ids=None)
            nodes[node.id] = node
            parent = node.id
        self.assertTrue(available(nodes,node.id,uuid4()))
        nodes[node.id].parent_id = node.id
        self.assertFalse(available(nodes,node.id,uuid4()))
        self.assertFalse(available(nodes,uuid4(),uuid4()))


class EnforcementTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = AsyncMock(spec=AsyncSession)
        self.user,self.wallet,self.category = uuid4(),uuid4(),uuid4()
        self.categories = AsyncMock(spec=CategoryRepository)
        self.repo = AsyncMock()
        self.wallets = AsyncMock()
        self.wallets.lock_many.return_value = [SimpleNamespace(id=self.wallet)]
        self.repo.lock_category.return_value = object()
        self.categories.is_available.return_value = False
        self.service = TransactionService(self.db,self.repo,self.wallets,self.categories)

    async def test_disallowed_transaction_rejected_before_balance_change(self):
        payload = TransactionCreate(wallet_id=self.wallet,category_id=self.category,label='Test',type='expense',amount='1.00',date=date.today())
        with self.assertRaises(TransactionValidationError):
            await self.service.create(user_id=self.user,payload=payload)
        self.repo.create.assert_not_awaited()
        self.wallets.adjust_balance.assert_not_awaited()
        self.db.commit.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_active_recurrence_blocks_parent_restriction_change(self):
        category = SimpleNamespace(id=self.category,parent_id=None,wallet_ids=[])
        result = Mock()
        result.all.return_value = [SimpleNamespace(category_id=self.category,wallet_id=self.wallet,label='Loyer')]
        self.db.scalars.return_value = result
        with patch('app.modules.category.availability.graph',AsyncMock(return_value={self.category:category})):
            with self.assertRaisesRegex(CategoryHierarchyError,'Loyer'):
                await validate_active_recurrences(self.db,self.user)

    async def test_foreign_wallet_assignment_is_rejected(self):
        category = SimpleNamespace(restrict_wallets=False,wallet_links=[])
        self.db.scalar.return_value = category
        result = Mock()
        result.all.return_value = []
        self.db.scalars.return_value = result
        with self.assertRaises(CategoryHierarchyError):
            await set_availability(self.db,self.user,self.category,[self.wallet])
        self.db.flush.assert_not_awaited()

    async def test_disallowed_recurrence_cannot_be_saved_or_resumed(self):
        wallets = AsyncMock()
        wallets.lock_many.return_value = [object()]
        self.db.scalar.return_value = self.category
        payload = SimpleNamespace(wallet_id=self.wallet,category_id=self.category)
        with patch('app.modules.recurrence.service.WalletRepository',return_value=wallets), patch(
            'app.modules.recurrence.service.CategoryRepository',return_value=self.categories):
            with self.assertRaises(HTTPException) as error:
                await RecurrenceService(self.db).validate_links(self.user,payload)
            self.assertEqual(error.exception.status_code,409)

    async def test_hierarchy_change_rejected_atomically_for_incompatible_recurrence(self):
        from app.modules.category.services.category_service import CategoryService
        from app.modules.category.schemas import CategoryMove
        from datetime import UTC, datetime
        node = SimpleNamespace(id=self.category,name='Test',parent_id=None,position=0,wallet_ids=None,created_at=datetime.now(UTC),updated_at=datetime.now(UTC))
        self.categories.get_by_id.return_value = node
        self.categories.siblings.return_value = [node]
        self.categories.move.return_value = node
        self.categories.validate_active_recurrences.side_effect = CategoryHierarchyError('Récurrence incompatible')
        service = CategoryService(self.db,self.categories)
        with self.assertRaises(CategoryHierarchyError):
            await service.move(user_id=self.user,category_id=self.category,payload=CategoryMove(parent_id=None,before_id=None))
        self.db.rollback.assert_awaited_once()
        self.db.commit.assert_not_awaited()
