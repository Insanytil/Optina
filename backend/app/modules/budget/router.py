import uuid
from datetime import date
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, model_validator
from sqlalchemy.exc import IntegrityError, DataError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.pagination import PagePaginatedResponse, PagePaginationParams
from app.db.session import get_async_session
from app.modules.auth.dependencies import CurrentUser, CsrfProtectedSession
from app.modules.budget.views import BudgetViewService
from app.modules.budget.schemas import BudgetWrite, BudgetResponse, BudgetCollection, BudgetViewWrite, BudgetViewResponse
from app.modules.transaction.schemas import TransactionResponse

router=APIRouter(prefix='/budgets',tags=['budgets'])


def get_budget_service(db: Annotated[AsyncSession,Depends(get_async_session)]): return BudgetViewService(db)
Service=Annotated[BudgetViewService,Depends(get_budget_service)]


async def write(service,operation):
    try: return await operation
    except (IntegrityError,DataError):
        await service.db.rollback()
        raise HTTPException(409,'Une référence a changé. Vérifiez les éléments sélectionnés.') from None


class BudgetListParams(BaseModel):
    date_from: date
    date_to: date
    @model_validator(mode='after')
    def valid_range(self):
        if self.date_from>self.date_to or not 1900<=self.date_from.year<=self.date_to.year<=9998 or (self.date_to-self.date_from).days>3660:
            raise ValueError('Choisissez une période valide de dix ans au maximum.')
        return self


@router.get('',response_model=BudgetCollection)
async def list_budgets(user:CurrentUser,service:Service,params:Annotated[BudgetListParams,Query()]):
    return await service.list(user.id,params.date_from,params.date_to)


@router.get('/views',response_model=list[BudgetViewResponse])
async def list_views(user:CurrentUser,service:Service): return await service.views(user.id)


@router.post('/views',response_model=BudgetViewResponse,status_code=201)
async def create_view(payload:BudgetViewWrite,auth:CsrfProtectedSession,service:Service):
    return await write(service,service.save_view(auth.user.id,payload))


@router.patch('/views/{view_id}',response_model=BudgetViewResponse)
async def update_view(view_id:uuid.UUID,payload:BudgetViewWrite,auth:CsrfProtectedSession,service:Service):
    return await write(service,service.save_view(auth.user.id,payload,view_id))


@router.delete('/views/{view_id}',status_code=204)
async def delete_view(view_id:uuid.UUID,auth:CsrfProtectedSession,service:Service):
    await write(service,service.delete_view(auth.user.id,view_id))
    return Response(status_code=204)


@router.get('/definitions',response_model=PagePaginatedResponse[BudgetResponse])
async def budget_definitions(user:CurrentUser,service:Service,pagination:Annotated[PagePaginationParams,Query()]):
    return await service.definitions(user.id,pagination)


@router.get('/{budget_id}',response_model=BudgetResponse)
async def get_budget(budget_id:uuid.UUID,user:CurrentUser,service:Service):
    return BudgetResponse.model_validate(await service.required(user.id,budget_id))


@router.post('',response_model=BudgetResponse,status_code=201)
async def create_budget(payload:BudgetWrite,auth:CsrfProtectedSession,service:Service):
    return await write(service,service.save(auth.user.id,payload))


@router.patch('/{budget_id}',response_model=BudgetResponse)
async def update_budget(budget_id:uuid.UUID,payload:BudgetWrite,auth:CsrfProtectedSession,service:Service,scope:Literal['period','following']='period'):
    return await write(service,service.save(auth.user.id,payload,budget_id,scope))


@router.delete('/{budget_id}',status_code=204)
async def delete_budget(budget_id:uuid.UUID,auth:CsrfProtectedSession,service:Service):
    await write(service,service.delete(auth.user.id,budget_id))
    return Response(status_code=204)


@router.get('/{budget_id}/transactions',response_model=PagePaginatedResponse[TransactionResponse])
async def budget_transactions(budget_id:uuid.UUID,user:CurrentUser,service:Service,pagination:Annotated[PagePaginationParams,Query()]):
    return await service.transactions(user.id,budget_id,pagination)


@router.get('/{budget_id}/history',response_model=BudgetCollection)
async def budget_history(budget_id:uuid.UUID,user:CurrentUser,service:Service,count:Annotated[int,Query(ge=1,le=60)]=12):
    return await service.history(user.id,budget_id,count)
