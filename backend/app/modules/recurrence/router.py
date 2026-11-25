import uuid
from datetime import date
from typing import Annotated
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError, DataError
from fastapi import HTTPException
from app.db.session import get_async_session
from app.modules.auth.dependencies import CurrentUser, CsrfProtectedSession
from app.modules.recurrence.service import RecurrenceService
from app.modules.recurrence.schemas import RecurrenceResponse, RecurrenceWrite, RecurrenceCreate, RecurrenceStatus, ForecastResponse, UpcomingResponse, UPCOMING_MAX_DAYS

router = APIRouter(prefix="/recurrences", tags=["recurrences"])


def get_recurrence_service(db: Annotated[AsyncSession, Depends(get_async_session)]):
    return RecurrenceService(db)

Service = Annotated[RecurrenceService, Depends(get_recurrence_service)]


async def write(service, operation):
    try:
        return await operation
    except (IntegrityError, DataError):
        await service.db.rollback()
        raise HTTPException(409, "La récurrence ne peut pas être enregistrée. Vérifiez le montant, le portefeuille et la catégorie.") from None


@router.get("", response_model=list[RecurrenceResponse])
async def list_rules(user: CurrentUser, service: Service, wallet_id: uuid.UUID | None = None, include_archived: bool = False):
    return await service.repository.list_for_user(user.id, wallet_id, include_archived=include_archived)


@router.get("/forecast", response_model=ForecastResponse)
async def forecast(user: CurrentUser, service: Service, wallet_id: uuid.UUID, months: Annotated[int, Query(ge=1, le=12)] = 3):
    return await service.forecast(user.id, wallet_id, months)


@router.get("/upcoming", response_model=UpcomingResponse)
async def upcoming(user: CurrentUser, service: Service, date_from: Annotated[date, Query(alias="from")], date_to: Annotated[date, Query(alias="to")]):
    if date_to < date_from or (date_to - date_from).days > UPCOMING_MAX_DAYS:
        raise HTTPException(422, f"La période doit être croissante et couvrir au plus {UPCOMING_MAX_DAYS} jours.")
    return await service.upcoming(user.id, date_from, date_to)


@router.post("", response_model=RecurrenceResponse, status_code=201)
async def create(payload: RecurrenceCreate, auth: CsrfProtectedSession, service: Service):
    return await write(service, service.save(auth.user.id, payload))


@router.patch("/{recurrence_id}", response_model=RecurrenceResponse)
async def update(recurrence_id: uuid.UUID, payload: RecurrenceWrite, auth: CsrfProtectedSession, service: Service):
    return await write(service, service.save(auth.user.id, payload, recurrence_id))


@router.patch("/{recurrence_id}/status", response_model=RecurrenceResponse)
async def status(recurrence_id: uuid.UUID, payload: RecurrenceStatus, auth: CsrfProtectedSession, service: Service):
    return await write(service, service.status(auth.user.id, recurrence_id, payload.is_active))


@router.delete("/{recurrence_id}", status_code=204)
async def archive(recurrence_id: uuid.UUID, auth: CsrfProtectedSession, service: Service):
    await write(service, service.status(auth.user.id, recurrence_id, None))
    return Response(status_code=204)
