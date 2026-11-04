from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.modules.category.repository.category_repository import CategoryRepository
from app.modules.category.services.category_service import CategoryService


def get_category_service(db: Annotated[AsyncSession, Depends(get_async_session)]) -> CategoryService:
    return CategoryService(db, CategoryRepository(db))


CategoryServiceDep = Annotated[CategoryService, Depends(get_category_service)]
