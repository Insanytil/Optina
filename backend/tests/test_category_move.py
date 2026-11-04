import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.modules.category.exceptions import CategoryHierarchyError, CategoryNotFoundError
from app.modules.category.schemas import CategoryMove
from app.modules.category.services.category_service import CategoryService


def category(parent_id=None, position=0):
    return SimpleNamespace(id=uuid4(), name="Catégorie", parent_id=parent_id, position=position,
        created_at=datetime.now(UTC), updated_at=datetime.now(UTC))


class CategoryMoveTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = AsyncMock()
        self.repo = AsyncMock()
        self.service = CategoryService(self.db, self.repo)
        self.user_id = uuid4()
        self.first, self.second, self.third = category(), category(position=1), category(position=2)
        self.repo.get_by_id.return_value = self.third
        self.repo.siblings.return_value = [self.first, self.second, self.third]
        self.repo.move.return_value = self.third

    async def test_reorder_uses_single_owner_lock_and_atomic_commit(self):
        await self.service.move(user_id=self.user_id, category_id=self.third.id, payload=CategoryMove(parent_id=None, before_id=self.first.id))
        self.repo.lock_for_user.assert_awaited_once_with(user_id=self.user_id)
        self.repo.move.assert_awaited_once_with(user_id=self.user_id, category_id=self.third.id, parent_id=None, position=0)
        self.repo.set_order.assert_awaited_once_with(user_id=self.user_id, category_ids=[self.third.id, self.first.id, self.second.id])
        self.db.commit.assert_awaited_once()

    async def test_move_to_parent_appends_without_touching_descendants(self):
        self.repo.ancestors.return_value = [self.first]
        child = category(self.first.id)
        self.repo.siblings.return_value = [child]
        await self.service.move(user_id=self.user_id, category_id=self.third.id, payload=CategoryMove(parent_id=self.first.id))
        self.repo.move.assert_awaited_once_with(user_id=self.user_id, category_id=self.third.id, parent_id=self.first.id, position=1)
        self.repo.set_order.assert_awaited_once_with(user_id=self.user_id, category_ids=[child.id, self.third.id])

    async def test_before_id_must_belong_to_destination_siblings(self):
        with self.assertRaises(CategoryHierarchyError):
            await self.service.move(user_id=self.user_id, category_id=self.third.id, payload=CategoryMove(parent_id=None, before_id=uuid4()))
        self.repo.move.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_self_or_descendant_parent_refuses_move(self):
        descendant = category(self.third.id)
        self.repo.ancestors.return_value = [self.third, descendant]
        with self.assertRaises(CategoryHierarchyError):
            await self.service.move(user_id=self.user_id, category_id=self.third.id, payload=CategoryMove(parent_id=descendant.id))
        self.repo.move.assert_not_awaited()

    async def test_foreign_category_is_not_found(self):
        self.repo.get_by_id.return_value = None
        with self.assertRaises(CategoryNotFoundError):
            await self.service.move(user_id=self.user_id, category_id=uuid4(), payload=CategoryMove(parent_id=None))
        self.repo.siblings.assert_not_awaited()

    async def test_foreign_parent_is_not_found(self):
        self.repo.ancestors.return_value = []
        with self.assertRaises(CategoryNotFoundError):
            await self.service.move(user_id=self.user_id, category_id=self.third.id, payload=CategoryMove(parent_id=uuid4()))
        self.repo.move.assert_not_awaited()

    async def test_failed_order_update_rolls_back_parent_move(self):
        self.repo.set_order.side_effect = RuntimeError("failure")
        with self.assertRaises(RuntimeError):
            await self.service.move(user_id=self.user_id, category_id=self.third.id, payload=CategoryMove(parent_id=None))
        self.db.commit.assert_not_awaited()
        self.db.rollback.assert_awaited_once()
