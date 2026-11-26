import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response

from app.core.pagination import PagePaginatedResponse, PagePaginationParams
from app.modules.auth.dependencies import CsrfProtectedSession, CurrentUser
from app.modules.wallet.dependencies import WalletServiceDep
from app.modules.wallet.exceptions import WalletInUseError, WalletNotFoundError
from app.modules.wallet.schemas import WalletAnalyticsResponse, WalletBalanceHistory, WalletCategoryBreakdown, WalletCategoryParams, WalletCreate, WalletPeriod, WalletResponse, WalletSummaryResponse, WalletUpdate

router = APIRouter(prefix="/wallets", tags=["wallets"])


@router.get("", response_model=PagePaginatedResponse[WalletResponse])
async def list_wallets(user: CurrentUser, service: WalletServiceDep, pagination: Annotated[PagePaginationParams, Query()]):
    return await service.list_for_user(user_id=user.id, pagination=pagination)


@router.get("/{wallet_id}", response_model=WalletResponse)
async def get_wallet(wallet_id: uuid.UUID, user: CurrentUser, service: WalletServiceDep):
    try:
        return await service.get_by_id(wallet_id=wallet_id, user_id=user.id)
    except WalletNotFoundError:
        raise HTTPException(status_code=404, detail="Portefeuille introuvable.") from None


@router.post("", response_model=WalletResponse, status_code=201)
async def create_wallet(payload: WalletCreate, auth: CsrfProtectedSession, service: WalletServiceDep):
    return await service.create(user_id=auth.user.id, payload=payload)


@router.patch("/{wallet_id}", response_model=WalletResponse)
async def update_wallet(wallet_id: uuid.UUID, payload: WalletUpdate, auth: CsrfProtectedSession, service: WalletServiceDep):
    try:
        return await service.update(wallet_id=wallet_id, user_id=auth.user.id, payload=payload)
    except WalletNotFoundError:
        raise HTTPException(status_code=404, detail="Portefeuille introuvable.") from None


@router.delete("/{wallet_id}", status_code=204, response_class=Response)
async def delete_wallet(wallet_id: uuid.UUID, auth: CsrfProtectedSession, service: WalletServiceDep) -> Response:
    try:
        await service.delete(wallet_id=wallet_id, user_id=auth.user.id)
    except WalletNotFoundError:
        raise HTTPException(status_code=404, detail="Portefeuille introuvable.") from None
    except WalletInUseError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    return Response(status_code=204)


@router.get("/{wallet_id}/summary", response_model=WalletSummaryResponse)
async def wallet_summary(wallet_id: uuid.UUID, user: CurrentUser, service: WalletServiceDep,
                         period: Annotated[WalletPeriod, Query()]):
    try:
        return await service.summary(user_id=user.id, wallet_id=wallet_id, period=period)
    except WalletNotFoundError:
        raise HTTPException(status_code=404, detail="Portefeuille introuvable.") from None


@router.get("/{wallet_id}/balance-history", response_model=WalletBalanceHistory)
async def wallet_balance_history(wallet_id: uuid.UUID, user: CurrentUser, service: WalletServiceDep,
                                 period: Annotated[WalletPeriod, Query()]):
    try:
        return await service.balance_history(user_id=user.id, wallet_id=wallet_id, period=period)
    except WalletNotFoundError:
        raise HTTPException(status_code=404, detail="Portefeuille introuvable.") from None


@router.get("/{wallet_id}/analytics", response_model=WalletAnalyticsResponse)
async def wallet_analytics(wallet_id: uuid.UUID, user: CurrentUser, service: WalletServiceDep,
                           period: Annotated[WalletPeriod, Query()]):
    try:
        return await service.analytics(user_id=user.id, wallet_id=wallet_id, period=period)
    except WalletNotFoundError:
        raise HTTPException(status_code=404, detail="Portefeuille introuvable.") from None


@router.get("/{wallet_id}/category-breakdown", response_model=WalletCategoryBreakdown)
async def wallet_category_breakdown(wallet_id: uuid.UUID, user: CurrentUser, service: WalletServiceDep,
                                     params: Annotated[WalletCategoryParams, Query()]):
    from app.modules.category.exceptions import CategoryNotFoundError, CategoryHierarchyError
    try:
        return await service.category_breakdown(user_id=user.id, wallet_id=wallet_id, params=params)
    except WalletNotFoundError:
        raise HTTPException(status_code=404, detail="Portefeuille introuvable.") from None
    except CategoryNotFoundError:
        raise HTTPException(status_code=404, detail="Catégorie introuvable.") from None
    except CategoryHierarchyError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
