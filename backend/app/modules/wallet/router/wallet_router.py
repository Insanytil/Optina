import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response

from app.core.pagination import PagePaginatedResponse, PagePaginationParams
from app.modules.auth.dependencies import CsrfProtectedSession, CurrentUser
from app.modules.wallet.dependencies import WalletServiceDep
from app.modules.wallet.exceptions import WalletNotFoundError
from app.modules.wallet.schemas import WalletCreate, WalletResponse, WalletUpdate

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
    return Response(status_code=204)
