import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response

from app.modules.auth.dependencies import CsrfProtectedSession, CurrentUser
from app.modules.transaction.dependencies import TransactionServiceDep
from app.modules.transaction.exceptions import TransactionNotFoundError, TransactionValidationError
from app.modules.transaction.schemas import TransactionPageResponse, TransactionCreate, TransactionListParams, TransactionResponse, TransactionUpdate

router = APIRouter(prefix="/transactions", tags=["transactions"])


def transaction_error(error: TransactionNotFoundError | TransactionValidationError) -> HTTPException:
    if isinstance(error, TransactionNotFoundError):
        return HTTPException(status_code=404, detail="Transaction, portefeuille ou catégorie introuvable.")
    return HTTPException(status_code=409, detail=str(error))


@router.get("", response_model=TransactionPageResponse)
async def list_transactions(user: CurrentUser, service: TransactionServiceDep, params: Annotated[TransactionListParams, Query()]):
    try:
        return await service.list_for_user(user_id=user.id, params=params)
    except TransactionNotFoundError as error:
        raise transaction_error(error) from None


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(transaction_id: uuid.UUID, user: CurrentUser, service: TransactionServiceDep):
    try:
        return await service.get_by_id(user_id=user.id, transaction_id=transaction_id)
    except TransactionNotFoundError as error:
        raise transaction_error(error) from None


@router.post("", response_model=TransactionResponse, status_code=201)
async def create_transaction(payload: TransactionCreate, auth: CsrfProtectedSession, service: TransactionServiceDep):
    try:
        return await service.create(user_id=auth.user.id, payload=payload)
    except (TransactionNotFoundError, TransactionValidationError) as error:
        raise transaction_error(error) from None


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(transaction_id: uuid.UUID, payload: TransactionUpdate, auth: CsrfProtectedSession, service: TransactionServiceDep):
    try:
        return await service.update(user_id=auth.user.id, transaction_id=transaction_id, payload=payload)
    except (TransactionNotFoundError, TransactionValidationError) as error:
        raise transaction_error(error) from None


@router.delete("/{transaction_id}", status_code=204, response_class=Response)
async def delete_transaction(transaction_id: uuid.UUID, auth: CsrfProtectedSession, service: TransactionServiceDep) -> Response:
    try:
        await service.delete(user_id=auth.user.id, transaction_id=transaction_id)
    except (TransactionNotFoundError, TransactionValidationError) as error:
        raise transaction_error(error) from None
    return Response(status_code=204)
