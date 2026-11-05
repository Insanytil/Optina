import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response

from app.core.pagination import PagePaginatedResponse
from app.modules.auth.dependencies import CsrfProtectedSession, CurrentUser
from app.modules.category.dependencies import CategoryServiceDep
from app.modules.category.exceptions import CategoryHierarchyError, CategoryNotFoundError
from app.modules.category.schemas import CategoryCreate, CategoryListParams, CategoryMove, CategoryResponse, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


def category_error(error: CategoryNotFoundError | CategoryHierarchyError) -> HTTPException:
    if isinstance(error, CategoryNotFoundError):
        return HTTPException(status_code=404, detail="Catégorie introuvable.")
    return HTTPException(status_code=409, detail=str(error))


@router.get("", response_model=PagePaginatedResponse[CategoryResponse])
async def list_categories(user: CurrentUser, service: CategoryServiceDep, pagination: Annotated[CategoryListParams, Query()]):
    try:
        return await service.list_for_user(user_id=user.id, parent_id=pagination.parent_id, pagination=pagination)
    except CategoryNotFoundError as error:
        raise category_error(error) from None


@router.get("/tree", response_model=list[CategoryResponse])
async def category_tree(user: CurrentUser, service: CategoryServiceDep):
    return await service.tree(user_id=user.id)


@router.get("/{category_id}/path", response_model=list[CategoryResponse])
async def category_path(category_id: uuid.UUID, user: CurrentUser, service: CategoryServiceDep):
    try:
        return await service.path(user_id=user.id, category_id=category_id)
    except (CategoryNotFoundError, CategoryHierarchyError) as error:
        raise category_error(error) from None


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: uuid.UUID, user: CurrentUser, service: CategoryServiceDep):
    try:
        return await service.get_by_id(user_id=user.id, category_id=category_id)
    except CategoryNotFoundError as error:
        raise category_error(error) from None


@router.post("", response_model=CategoryResponse, status_code=201)
async def create_category(payload: CategoryCreate, auth: CsrfProtectedSession, service: CategoryServiceDep):
    try:
        return await service.create(user_id=auth.user.id, payload=payload)
    except (CategoryNotFoundError, CategoryHierarchyError) as error:
        raise category_error(error) from None


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: uuid.UUID, payload: CategoryUpdate, auth: CsrfProtectedSession, service: CategoryServiceDep):
    try:
        return await service.update(user_id=auth.user.id, category_id=category_id, payload=payload)
    except (CategoryNotFoundError, CategoryHierarchyError) as error:
        raise category_error(error) from None


@router.delete("/{category_id}", status_code=204, response_class=Response)
async def delete_category(category_id: uuid.UUID, auth: CsrfProtectedSession, service: CategoryServiceDep) -> Response:
    try:
        await service.delete(user_id=auth.user.id, category_id=category_id)
    except (CategoryNotFoundError, CategoryHierarchyError) as error:
        raise category_error(error) from None
    return Response(status_code=204)


@router.post("/{category_id}/move", response_model=CategoryResponse)
async def move_category(category_id: uuid.UUID, payload: CategoryMove, auth: CsrfProtectedSession, service: CategoryServiceDep):
    try:
        return await service.move(user_id=auth.user.id, category_id=category_id, payload=payload)
    except (CategoryNotFoundError, CategoryHierarchyError) as error:
        raise category_error(error) from None
