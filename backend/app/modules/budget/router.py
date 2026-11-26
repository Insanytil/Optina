import uuid
from datetime import date
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.pagination import PagePaginatedResponse, PagePaginationParams
from app.db.session import get_async_session
from app.modules.auth.dependencies import CsrfProtectedSession, CurrentUser
from app.modules.budget.schemas import BudgetHistory, BudgetResponse, BudgetStatusList, BudgetWrite
from app.modules.budget.service import BudgetService
from app.modules.transaction.schemas import TransactionResponse

router = APIRouter(prefix='/budgets', tags=['budgets'])


def get_budget_service(db: Annotated[AsyncSession, Depends(get_async_session)]):
    return BudgetService(db)


Service = Annotated[BudgetService, Depends(get_budget_service)]
Month = Annotated[date, Query(description='Any day of the month to show.')]


async def write(service, operation):
    try:
        return await operation
    except (IntegrityError, DataError):
        await service.db.rollback()
        raise HTTPException(409, 'Une référence a changé. Vérifiez les éléments sélectionnés.') from None


def check_month(month: date):
    if not 1900 <= month.year <= 9998:
        raise HTTPException(422, 'Choisissez un mois entre 1900 et 9998.')
    return month


@router.get('', response_model=list[BudgetResponse])
async def list_budgets(user: CurrentUser, service: Service):
    return await service.list(user.id)


@router.get('/status', response_model=BudgetStatusList)
async def budget_status(user: CurrentUser, service: Service, month: Month):
    return await service.status(user.id, check_month(month))


@router.post('', response_model=BudgetResponse, status_code=201)
async def create_budget(payload: BudgetWrite, auth: CsrfProtectedSession, service: Service):
    return await write(service, service.save(auth.user.id, payload))


@router.patch('/{budget_id}', response_model=BudgetResponse)
async def update_budget(budget_id: uuid.UUID, payload: BudgetWrite, auth: CsrfProtectedSession, service: Service):
    return await write(service, service.save(auth.user.id, payload, budget_id))


@router.delete('/{budget_id}', status_code=204)
async def delete_budget(budget_id: uuid.UUID, auth: CsrfProtectedSession, service: Service):
    await write(service, service.delete(auth.user.id, budget_id))
    return Response(status_code=204)


@router.get('/{budget_id}/history', response_model=BudgetHistory)
async def budget_history(budget_id: uuid.UUID, user: CurrentUser, service: Service, month: Month,
                         count: Annotated[int, Query(ge=1, le=60)] = 12):
    return await service.history(user.id, budget_id, check_month(month), count)


@router.get('/{budget_id}/transactions', response_model=PagePaginatedResponse[TransactionResponse])
async def budget_transactions(budget_id: uuid.UUID, user: CurrentUser, service: Service, month: Month,
                              pagination: Annotated[PagePaginationParams, Query()]):
    return await service.transactions(user.id, budget_id, check_month(month), pagination)
