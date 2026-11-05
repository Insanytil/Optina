import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PagePaginatedResponse, PagePaginationMeta, PagePaginationParams
from app.modules.category.exceptions import CategoryHierarchyError, CategoryNotFoundError
from app.modules.category.repository.category_repository import CategoryRepository
from app.modules.category.schemas import CategoryCreate, CategoryMove, CategoryResponse, CategoryUpdate


class CategoryService:
    def __init__(self, db: AsyncSession, repository: CategoryRepository):
        self.db = db
        self.repository = repository

    async def get_by_id(self, *, user_id: uuid.UUID, category_id: uuid.UUID) -> CategoryResponse:
        category = await self.repository.get_by_id(user_id=user_id, category_id=category_id)
        if category is None:
            raise CategoryNotFoundError()
        return CategoryResponse.model_validate(category)

    async def list_for_user(self, *, user_id: uuid.UUID, parent_id: uuid.UUID | None, pagination: PagePaginationParams) -> PagePaginatedResponse[CategoryResponse]:
        if parent_id is not None:
            await self.get_by_id(user_id=user_id, category_id=parent_id)
        total = await self.repository.count_for_user(user_id=user_id, parent_id=parent_id)
        items = await self.repository.list_for_user(user_id=user_id, parent_id=parent_id, pagination=pagination)
        return PagePaginatedResponse[CategoryResponse](
            items=[CategoryResponse.model_validate(item) for item in items],
            pagination=PagePaginationMeta(page=pagination.page, page_size=pagination.page_size, total=total,
                total_pages=(total + pagination.page_size - 1) // pagination.page_size),
        )

    async def path(self, *, user_id: uuid.UUID, category_id: uuid.UUID) -> list[CategoryResponse]:
        items = await self.repository.ancestors(user_id=user_id, category_id=category_id)
        by_id = {item.id: item for item in items}
        if category_id not in by_id:
            raise CategoryNotFoundError()
        path = []
        current = category_id
        seen = set()
        while current is not None:
            if current in seen or current not in by_id:
                raise CategoryHierarchyError("La hiérarchie de cette catégorie est invalide.")
            seen.add(current)
            item = by_id[current]
            path.append(CategoryResponse.model_validate(item))
            current = item.parent_id
        path.reverse()
        return path

    async def create(self, *, user_id: uuid.UUID, payload: CategoryCreate) -> CategoryResponse:
        try:
            await self.repository.lock_for_user(user_id=user_id)
            if payload.parent_id is not None:
                await self.get_by_id(user_id=user_id, category_id=payload.parent_id)
            category = await self.repository.create(user_id=user_id, name=payload.name, parent_id=payload.parent_id)
            if payload.wallet_ids is not None:
                await self.repository.set_availability(user_id=user_id, category_id=category.id, wallet_ids=payload.wallet_ids)
                category = await self.repository.get_by_id(user_id=user_id, category_id=category.id)
            response = CategoryResponse.model_validate(category)
            await self.db.commit()
            return response
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, user_id: uuid.UUID, category_id: uuid.UUID, payload: CategoryUpdate) -> CategoryResponse:
        try:
            await self.repository.lock_for_user(user_id=user_id)
            category = await self.get_by_id(user_id=user_id, category_id=category_id)
            parent_id = payload.parent_id if "parent_id" in payload.model_fields_set else category.parent_id
            if parent_id is not None:
                ancestors = await self.path(user_id=user_id, category_id=parent_id)
                if any(item.id == category_id for item in ancestors):
                    raise CategoryHierarchyError("Une catégorie ne peut pas être placée sous elle-même ou l'une de ses sous-catégories.")
            updated = await self.repository.update(user_id=user_id, category_id=category_id, name=payload.name, parent_id=parent_id)
            if updated is None:
                raise CategoryNotFoundError()
            if parent_id != category.parent_id:
                position = await self.repository.next_position(user_id=user_id, parent_id=parent_id)
                updated = await self.repository.move(user_id=user_id, category_id=category_id, parent_id=parent_id, position=position)
                if updated is None:
                    raise CategoryNotFoundError()
            if "wallet_ids" in payload.model_fields_set:
                await self.repository.set_availability(user_id=user_id, category_id=category_id, wallet_ids=payload.wallet_ids)
            await self.repository.validate_active_recurrences(user_id=user_id)
            response = CategoryResponse.model_validate(updated)
            await self.db.commit()
            return response
        except Exception:
            await self.db.rollback()
            raise

    async def delete(self, *, user_id: uuid.UUID, category_id: uuid.UUID) -> None:
        try:
            await self.repository.lock_for_user(user_id=user_id)
            await self.get_by_id(user_id=user_id, category_id=category_id)
            if await self.repository.has_children(user_id=user_id, category_id=category_id):
                raise CategoryHierarchyError("Déplacez ou supprimez les sous-catégories avant de supprimer cette catégorie.")
            if await self.repository.has_transactions(user_id=user_id, category_id=category_id):
                raise CategoryHierarchyError("Cette catégorie contient des transactions et ne peut pas être supprimée.")
            if not await self.repository.delete(user_id=user_id, category_id=category_id):
                raise CategoryNotFoundError()
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise CategoryHierarchyError("Cette catégorie est encore utilisée et ne peut pas être supprimée.") from None
        except Exception:
            await self.db.rollback()
            raise

    async def tree(self, *, user_id: uuid.UUID) -> list[CategoryResponse]:
        categories = await self.repository.list_tree(user_id=user_id)
        return [CategoryResponse.model_validate(item) for item in categories]

    async def move(self, *, user_id: uuid.UUID, category_id: uuid.UUID, payload: CategoryMove) -> CategoryResponse:
        try:
            await self.repository.lock_for_user(user_id=user_id)
            await self.get_by_id(user_id=user_id, category_id=category_id)
            if payload.parent_id is not None:
                ancestors = await self.path(user_id=user_id, category_id=payload.parent_id)
                if any(item.id == category_id for item in ancestors):
                    raise CategoryHierarchyError("Une catégorie ne peut pas être placée sous elle-même ou l'une de ses sous-catégories.")
            if payload.before_id == category_id:
                raise CategoryHierarchyError("La catégorie de destination doit être différente de la catégorie déplacée.")
            siblings = await self.repository.siblings(user_id=user_id, parent_id=payload.parent_id)
            identifiers = [item.id for item in siblings if item.id != category_id]
            if payload.before_id is not None and payload.before_id not in identifiers:
                raise CategoryHierarchyError("La position de destination a changé. Actualisez la liste et réessayez.")
            position = identifiers.index(payload.before_id) if payload.before_id is not None else len(identifiers)
            identifiers.insert(position, category_id)
            moved = await self.repository.move(user_id=user_id, category_id=category_id, parent_id=payload.parent_id, position=position)
            if moved is None:
                raise CategoryNotFoundError()
            await self.repository.set_order(user_id=user_id, category_ids=identifiers)
            await self.repository.validate_active_recurrences(user_id=user_id)
            response = CategoryResponse.model_validate(moved)
            await self.db.commit()
            return response
        except Exception:
            await self.db.rollback()
            raise
