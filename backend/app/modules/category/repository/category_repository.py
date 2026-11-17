import uuid

from sqlalchemy import case, delete, exists, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PagePaginationParams
from app.models.category import Category
from app.models.user import User


class CategoryRepository:
    """Owner-scoped persistence. Services control the transaction."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def lock_for_user(self, *, user_id: uuid.UUID) -> None:
        # Serialize hierarchy changes for this user to prevent concurrent cycles.
        await self.db.execute(select(User.id).where(User.id == user_id).with_for_update())

    async def create(self, *, user_id: uuid.UUID, name: str, parent_id: uuid.UUID | None) -> Category:
        position = await self.next_position(user_id=user_id, parent_id=parent_id)
        category = Category(user_id=user_id, name=name, parent_id=parent_id, position=position)
        self.db.add(category)
        await self.db.flush()
        return category

    async def get_by_id(self, *, user_id: uuid.UUID, category_id: uuid.UUID) -> Category | None:
        return await self.db.scalar(select(Category).where(Category.user_id == user_id, Category.id == category_id))

    async def list_for_user(self, *, user_id: uuid.UUID, parent_id: uuid.UUID | None, pagination: PagePaginationParams) -> list[Category]:
        result = await self.db.scalars(
            select(Category)
            .where(Category.user_id == user_id, Category.parent_id == parent_id)
            .order_by(Category.position, Category.id)
            .limit(pagination.page_size).offset(pagination.offset)
        )
        return list(result.all())

    async def count_for_user(self, *, user_id: uuid.UUID, parent_id: uuid.UUID | None) -> int:
        return await self.db.scalar(
            select(func.count()).select_from(Category)
            .where(Category.user_id == user_id, Category.parent_id == parent_id)
        ) or 0

    async def ancestors(self, *, user_id: uuid.UUID, category_id: uuid.UUID) -> list[Category]:
        lineage = select(Category.id, Category.parent_id).where(
            Category.user_id == user_id, Category.id == category_id
        ).cte("category_lineage", recursive=True)
        # UNION (rather than UNION ALL) also terminates if existing data contains a cycle.
        lineage = lineage.union(
            select(Category.id, Category.parent_id)
            .join(lineage, Category.id == lineage.c.parent_id)
            .where(Category.user_id == user_id)
        )
        result = await self.db.scalars(
            select(Category).where(Category.user_id == user_id, Category.id.in_(select(lineage.c.id)))
        )
        return list(result.all())

    async def update(self, *, user_id: uuid.UUID, category_id: uuid.UUID, name: str, parent_id: uuid.UUID | None) -> Category | None:
        return await self.db.scalar(
            update(Category).where(Category.user_id == user_id, Category.id == category_id)
            .values(name=name, parent_id=parent_id).returning(Category)
            .execution_options(populate_existing=True)
        )

    async def has_children(self, *, user_id: uuid.UUID, category_id: uuid.UUID) -> bool:
        return bool(await self.db.scalar(select(exists().where(
            Category.user_id == user_id, Category.parent_id == category_id
        ))))

    async def delete(self, *, user_id: uuid.UUID, category_id: uuid.UUID) -> bool:
        return await self.db.scalar(
            delete(Category).where(Category.user_id == user_id, Category.id == category_id).returning(Category.id)
        ) is not None

    async def next_position(self, *, user_id: uuid.UUID, parent_id: uuid.UUID | None) -> int:
        highest = await self.db.scalar(select(func.max(Category.position)).where(
            Category.user_id == user_id, Category.parent_id == parent_id
        ))
        return 0 if highest is None else highest + 1

    async def list_tree(self, *, user_id: uuid.UUID) -> list[Category]:
        # Flat payload avoids recursion limits when serializing deep hierarchies.
        result = await self.db.scalars(select(Category).where(Category.user_id == user_id)
            .order_by(Category.position, Category.id))
        return list(result.all())

    async def siblings(self, *, user_id: uuid.UUID, parent_id: uuid.UUID | None) -> list[Category]:
        result = await self.db.scalars(select(Category)
            .where(Category.user_id == user_id, Category.parent_id == parent_id)
            .order_by(Category.position, Category.id))
        return list(result.all())

    async def move(self, *, user_id: uuid.UUID, category_id: uuid.UUID, parent_id: uuid.UUID | None, position: int) -> Category | None:
        return await self.db.scalar(update(Category)
            .where(Category.user_id == user_id, Category.id == category_id)
            .values(parent_id=parent_id, position=position).returning(Category)
            .execution_options(populate_existing=True))

    async def set_order(self, *, user_id: uuid.UUID, category_ids: list[uuid.UUID]) -> None:
        if not category_ids:
            return
        await self.db.execute(update(Category)
            .where(Category.user_id == user_id, Category.id.in_(category_ids))
            .values(position=case({identifier: index for index, identifier in enumerate(category_ids)}, value=Category.id))
            .execution_options(synchronize_session=False))

    async def has_transactions(self, *, user_id: uuid.UUID, category_id: uuid.UUID) -> bool:
        from app.models.wallet_transaction import WalletTransaction
        return bool(await self.db.scalar(select(exists().where(
            WalletTransaction.user_id == user_id, WalletTransaction.category_id == category_id))))

    async def is_available(self, *, user_id: uuid.UUID, category_id: uuid.UUID, wallet_id: uuid.UUID) -> bool:
        from app.modules.category.availability import available, graph
        return available(await graph(self.db, user_id), category_id, wallet_id)

    async def set_availability(self, *, user_id, category_id, wallet_ids):
        from app.modules.category.availability import set_availability
        await set_availability(self.db, user_id, category_id, wallet_ids)

    async def validate_active_recurrences(self, *, user_id):
        from app.modules.category.availability import validate_active_recurrences
        await validate_active_recurrences(self.db, user_id)

    async def search(self, *, user_id: uuid.UUID, query: str, limit: int = 25,
                     wallet_id: uuid.UUID | None = None, exclude_id: uuid.UUID | None = None,
                     parent_id: uuid.UUID | None = None, root_only: bool = False) -> list[Category]:
        import unicodedata
        from sqlalchemy import Text, and_, cast, literal, or_
        from app.models.category_wallet import CategoryWallet
        accents = 'àâäáãåçèéêëìíîïñòóôöõùúûüýÿ'
        plain = ''.join(character for character in unicodedata.normalize('NFD', accents) if not unicodedata.combining(character))
        allowed = or_(Category.restrict_wallets.is_(False), exists().where(
            CategoryWallet.category_id == Category.id, CategoryWallet.user_id == user_id,
            CategoryWallet.wallet_id == wallet_id)) if wallet_id is not None else literal(True)
        excluded = Category.id == exclude_id if exclude_id is not None else literal(False)
        tree = select(Category.id, cast(Category.name, Text).label('path'),
            allowed.label('allowed'), excluded.label('excluded')).where(
                Category.user_id == user_id, Category.parent_id.is_(None)).cte('category_search', recursive=True)
        tree = tree.union_all(select(Category.id, tree.c.path + ' / ' + Category.name,
                and_(tree.c.allowed, allowed), or_(tree.c.excluded, excluded))
            .join(tree, Category.parent_id == tree.c.id).where(Category.user_id == user_id))
        searchable = func.translate(func.replace(func.replace(func.lower(tree.c.path), 'œ', 'oe'), 'æ', 'ae'), accents, plain)
        normalized = ''.join(character for character in unicodedata.normalize('NFD', query.casefold()) if not unicodedata.combining(character)).replace('œ','oe').replace('æ','ae')
        statement = select(Category).join(tree, Category.id == tree.c.id).where(
            Category.user_id == user_id, tree.c.allowed.is_(True), tree.c.excluded.is_(False))
        if root_only:
            statement = statement.where(Category.parent_id.is_(None))
        elif parent_id is not None:
            statement = statement.where(Category.parent_id == parent_id)
        for token in normalized.split():
            escaped = token.replace('!', '!!').replace('%', '!%').replace('_', '!_')
            statement = statement.where(searchable.like(f'%{escaped}%', escape='!'))
        rows = await self.db.scalars(statement.order_by(tree.c.path, Category.id).limit(limit))
        return list(rows.all())
