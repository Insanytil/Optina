import unittest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import configure_mappers

from app.core.pagination import PagePaginationParams
from app.models import Category, User
from app.modules.category.repository.category_repository import CategoryRepository


class CategoryRepositoryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.scalar = AsyncMock(return_value=None)
        self.db.scalars = AsyncMock(return_value=MagicMock())
        self.db.execute = AsyncMock()
        self.db.flush = AsyncMock()
        self.repo = CategoryRepository(self.db)
        self.user_id, self.category_id = uuid4(), uuid4()

    async def test_all_reads_and_writes_are_scoped(self):
        for method, extra in [
            (self.repo.get_by_id, {}),
            (self.repo.update, {"name": "X", "parent_id": None}),
            (self.repo.delete, {}),
            (self.repo.has_children, {}),
        ]:
            with self.subTest(method=method.__name__):
                await method(user_id=self.user_id, category_id=self.category_id, **extra)
                compiled = self.db.scalar.call_args.args[0].compile(dialect=postgresql.dialect())
                self.assertIn(self.user_id, compiled.params.values())
                self.assertIn(self.category_id, compiled.params.values())
                self.assertIn("categories.user_id =", str(compiled))
        self.db.commit.assert_not_called()

    async def test_ancestry_query_is_recursive_and_owner_scoped(self):
        await self.repo.ancestors(user_id=self.user_id, category_id=self.category_id)
        compiled = self.db.scalars.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("WITH RECURSIVE", str(compiled))
        self.assertIn(self.user_id, compiled.params.values())
        self.assertIn(self.category_id, compiled.params.values())
        self.assertNotIn("UNION ALL", str(compiled))

    async def test_list_root_filters_null_parent(self):
        await self.repo.list_for_user(user_id=self.user_id, parent_id=None, pagination=PagePaginationParams(page=3, page_size=10))
        compiled = self.db.scalars.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("categories.parent_id IS NULL", str(compiled))
        self.assertIn(self.user_id, compiled.params.values())
        self.assertIn(20, compiled.params.values())

    async def test_write_lock_is_on_owner_row(self):
        await self.repo.lock_for_user(user_id=self.user_id)
        compiled = self.db.execute.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("FOR UPDATE", str(compiled))
        self.assertIn(self.user_id, compiled.params.values())

    def test_mapper_and_cross_owner_foreign_key(self):
        configure_mappers()
        self.assertTrue(Category.children.property.uselist)
        self.assertFalse(Category.parent.property.uselist)
        self.assertTrue(User.categories.property.uselist)
        constraint = next(item for item in Category.__table__.foreign_key_constraints if item.name == "fk_categories_parent_owner")
        self.assertEqual(list(constraint.column_keys), ["parent_id", "user_id"])

    async def test_order_write_is_scoped_and_binds_uuid_positions(self):
        await self.repo.set_order(user_id=self.user_id, category_ids=[self.category_id])
        compiled = self.db.execute.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn("CASE categories.id", str(compiled))
        self.assertIn("categories.user_id =", str(compiled))
        self.assertIn(self.category_id, compiled.params.values())
        self.assertIn(self.user_id, compiled.params.values())

    async def test_tree_query_filters_owner_and_sorts_by_position(self):
        await self.repo.list_tree(user_id=self.user_id)
        compiled = self.db.scalars.call_args.args[0].compile(dialect=postgresql.dialect())
        self.assertIn(self.user_id, compiled.params.values())
        self.assertIn("ORDER BY categories.position, categories.id", str(compiled))
