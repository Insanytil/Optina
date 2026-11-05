import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from pydantic import ValidationError

from app.core.pagination import PagePaginationParams
from app.modules.category.exceptions import CategoryHierarchyError, CategoryNotFoundError
from app.modules.category.schemas import CategoryCreate, CategoryUpdate
from app.modules.category.services.category_service import CategoryService


def category(parent_id=None, name="Transport"):
    return SimpleNamespace(id=uuid4(), parent_id=parent_id, name=name,
        created_at=datetime.now(UTC), updated_at=datetime.now(UTC))


class CategoryServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = AsyncMock()
        self.repo = AsyncMock()
        self.repo.has_transactions.return_value = False
        self.service = CategoryService(self.db, self.repo)
        self.user_id = uuid4()
        self.root = category()
        self.child = category(self.root.id, "Voiture")
        self.grandchild = category(self.child.id, "Entretien")

    async def test_create_child_checks_owner_and_commits(self):
        self.repo.get_by_id.return_value = self.root
        self.repo.create.return_value = self.child
        result = await self.service.create(user_id=self.user_id, payload=CategoryCreate(name=" Voiture ", parent_id=self.root.id))
        self.repo.lock_for_user.assert_awaited_once_with(user_id=self.user_id)
        self.repo.get_by_id.assert_awaited_once_with(user_id=self.user_id, category_id=self.root.id)
        self.repo.create.assert_awaited_once_with(user_id=self.user_id, name="Voiture", parent_id=self.root.id)
        self.assertEqual(result.parent_id, self.root.id)
        self.db.commit.assert_awaited_once()

    async def test_foreign_parent_is_not_found_and_nothing_is_created(self):
        self.repo.get_by_id.return_value = None
        with self.assertRaises(CategoryNotFoundError):
            await self.service.create(user_id=self.user_id, payload=CategoryCreate(name="X", parent_id=uuid4()))
        self.repo.create.assert_not_awaited()
        self.db.commit.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_path_returns_root_to_leaf_without_depth_limit(self):
        items = [self.root]
        for _ in range(1100):
            items.append(category(items[-1].id))
        self.repo.ancestors.return_value = list(reversed(items))
        path = await self.service.path(user_id=self.user_id, category_id=items[-1].id)
        self.assertEqual([item.id for item in path], [item.id for item in items])

    async def test_cycle_in_existing_data_is_reported(self):
        self.root.parent_id = self.child.id
        self.repo.ancestors.return_value = [self.root, self.child]
        with self.assertRaises(CategoryHierarchyError):
            await self.service.path(user_id=self.user_id, category_id=self.root.id)

    async def test_self_parent_or_descendant_parent_is_rejected(self):
        for parent in [self.root, self.child, self.grandchild]:
            with self.subTest(parent=parent.id):
                self.repo.get_by_id.return_value = self.root
                self.repo.ancestors.return_value = [self.root, self.child, self.grandchild][: [self.root, self.child, self.grandchild].index(parent) + 1]
                with self.assertRaises(CategoryHierarchyError):
                    await self.service.update(user_id=self.user_id, category_id=self.root.id, payload=CategoryUpdate(name="X", parent_id=parent.id))
        self.repo.update.assert_not_awaited()
        self.db.commit.assert_not_awaited()

    async def test_rename_preserves_parent_when_omitted(self):
        self.repo.get_by_id.return_value = self.child
        self.repo.ancestors.return_value = [self.root]
        self.repo.update.return_value = self.child
        self.repo.move.return_value = self.child
        self.repo.next_position.return_value = 0
        await self.service.update(user_id=self.user_id, category_id=self.child.id, payload=CategoryUpdate(name="Auto"))
        self.repo.update.assert_awaited_once_with(user_id=self.user_id, category_id=self.child.id, name="Auto", parent_id=self.root.id)
        self.db.commit.assert_awaited_once()

    async def test_explicit_null_moves_category_to_root(self):
        self.repo.get_by_id.return_value = self.child
        self.repo.update.return_value = self.child
        self.repo.move.return_value = self.child
        self.repo.next_position.return_value = 0
        await self.service.update(user_id=self.user_id, category_id=self.child.id, payload=CategoryUpdate(name="Auto", parent_id=None))
        self.repo.update.assert_awaited_once_with(user_id=self.user_id, category_id=self.child.id, name="Auto", parent_id=None)
        self.repo.ancestors.assert_not_awaited()

    async def test_delete_non_empty_is_refused(self):
        self.repo.get_by_id.return_value = self.root
        self.repo.has_children.return_value = True
        with self.assertRaises(CategoryHierarchyError):
            await self.service.delete(user_id=self.user_id, category_id=self.root.id)
        self.repo.delete.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_delete_leaf_commits(self):
        self.repo.get_by_id.return_value = self.child
        self.repo.has_children.return_value = False
        self.repo.delete.return_value = True
        await self.service.delete(user_id=self.user_id, category_id=self.child.id)
        self.repo.delete.assert_awaited_once_with(user_id=self.user_id, category_id=self.child.id)
        self.db.commit.assert_awaited_once()

    async def test_failed_commit_rolls_back(self):
        self.repo.create.return_value = self.root
        self.db.commit.side_effect = RuntimeError("failed")
        with self.assertRaises(RuntimeError):
            await self.service.create(user_id=self.user_id, payload=CategoryCreate(name="X"))
        self.db.rollback.assert_awaited_once()

    async def test_list_filters_parent_and_builds_pagination(self):
        self.repo.get_by_id.return_value = self.root
        self.repo.count_for_user.return_value = 21
        self.repo.list_for_user.return_value = [self.child]
        params = PagePaginationParams(page=2)
        result = await self.service.list_for_user(user_id=self.user_id, parent_id=self.root.id, pagination=params)
        self.assertEqual(result.pagination.total_pages, 2)
        self.repo.list_for_user.assert_awaited_once_with(user_id=self.user_id, parent_id=self.root.id, pagination=params)

    def test_schema_rejects_empty_names_and_owner_override(self):
        for payload in [{"name": " "}, {"name": "x" * 256}, {"name": "X", "user_id": str(uuid4())}, {"name": "X", "parent_id": "invalid"}]:
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                CategoryCreate(**payload)

    async def test_category_with_transactions_cannot_be_deleted(self):
        self.repo.get_by_id.return_value = self.child
        self.repo.has_children.return_value = False
        self.repo.has_transactions.return_value = True
        with self.assertRaises(CategoryHierarchyError):
            await self.service.delete(user_id=self.user_id, category_id=self.child.id)
        self.repo.delete.assert_not_awaited()
