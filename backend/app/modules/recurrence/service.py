import uuid
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.category import Category
from app.modules.category.repository.category_repository import CategoryRepository
from app.models.recurrence import Recurrence, RecurrenceOccurrence
from app.models.wallet_transaction import WalletTransaction
from app.modules.recurrence.clock import daily_window
from app.modules.recurrence.repository import RecurrenceRepository
from app.modules.recurrence.schedule import first_index, next_date
from app.modules.recurrence.schemas import RecurrenceResponse, RecurrenceWrite, ForecastResponse
from app.modules.wallet.repository.wallet_repository import WalletRepository


async def business_today(db: AsyncSession) -> date:
    # PostgreSQL ships timezone data on all supported hosts, including Windows.
    return await db.scalar(select(func.cast(func.timezone(settings.recurrence_timezone, func.now()), Date)))


async def generate_due(db: AsyncSession, rule: Recurrence, cutoff: date, *, batch_size=500) -> int:
    """Caller MUST hold the rule row lock; receipt, balance and cursor commit together."""
    if not rule.is_active or rule.archived:
        return 0
    if rule.next_date is None or rule.next_date > cutoff:
        return 0
    recorded = await RecurrenceRepository(db).recorded_dates(rule.id, rule.next_date, cutoff)
    wallets = WalletRepository(db)
    if not await wallets.lock_many(user_id=rule.user_id, wallet_ids=[rule.wallet_id]):
        raise RuntimeError("Recurring wallet missing")
    count = 0
    while rule.next_date and rule.next_date <= cutoff and count < batch_size:
        scheduled = rule.next_date
        if scheduled not in recorded:
            movement = WalletTransaction(user_id=rule.user_id, wallet_id=rule.wallet_id,
                category_id=rule.category_id, recurrence_id=rule.id, type=rule.type,
                kind="standard", amount=rule.amount, date=scheduled, label=rule.label, note=rule.note)
            db.add(movement)
            await db.flush()
            db.add(RecurrenceOccurrence(recurrence_id=rule.id, scheduled_date=scheduled, transaction_id=movement.id))
            await wallets.adjust_balance(user_id=rule.user_id, wallet_id=rule.wallet_id,
                amount=rule.amount if rule.type == "income" else -rule.amount)
            recorded.add(scheduled)
        rule.next_index += 1
        rule.next_date = next_date(rule.start_date, rule.frequency_unit, rule.interval, rule.next_index, rule.end_date)
        count += 1
    await db.flush()
    return count


class RecurrenceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = RecurrenceRepository(db)

    async def required(self, user_id, recurrence_id):
        rule = await self.repository.get(user_id, recurrence_id)
        if rule is None:
            raise HTTPException(404, "Récurrence introuvable.")
        return rule

    async def validate_links(self, user_id, payload):
        # Same lock order as ordinary transaction creation: wallet, then category.
        if not await WalletRepository(self.db).lock_many(user_id=user_id, wallet_ids=[payload.wallet_id]):
            raise HTTPException(404, "Portefeuille introuvable.")
        category = await self.db.scalar(select(Category.id).where(
            Category.id == payload.category_id, Category.user_id == user_id).with_for_update(read=True, key_share=True))
        if category is None:
            raise HTTPException(404, "Catégorie introuvable.")
        if not await CategoryRepository(self.db).is_available(user_id=user_id, category_id=payload.category_id, wallet_id=payload.wallet_id):
            raise HTTPException(409, "Cette catégorie n’est pas disponible dans ce portefeuille.")

    async def save(self, user_id: uuid.UUID, payload: RecurrenceWrite, recurrence_id: uuid.UUID | None = None):
        await CategoryRepository(self.db).lock_for_user(user_id=user_id)
        today = await business_today(self.db)
        cutoff, _ = await daily_window(self.db)
        if payload.start_date < date(today.year - 10, today.month, min(today.day, 28)):
            raise HTTPException(422, "La première échéance ne peut pas remonter à plus de dix ans.")
        rule = await self.required(user_id, recurrence_id) if recurrence_id else None
        if rule:
            if rule.wallet_id != payload.wallet_id:
                raise HTTPException(409, "Créez une nouvelle récurrence pour changer de portefeuille.")
            await generate_due(self.db, rule, cutoff)
            if rule.is_active and rule.next_date and rule.next_date <= cutoff:
                raise HTTPException(409, "Le rattrapage est en cours. Réessayez dans quelques instants.")
            changed = any(getattr(rule, key) != getattr(payload, key) for key in ("start_date", "frequency_unit", "interval"))
            if changed and payload.start_date <= today:
                raise HTTPException(409, "Un nouveau calendrier doit commencer à une date future.")
        else:
            changed = True
        await self.validate_links(user_id, payload)
        if rule is None:
            values = payload.model_dump()
            active = values.pop("is_active", True)
            rule = Recurrence(user_id=user_id, is_active=active, archived=False, next_index=0, **values)
            self.db.add(rule)
        else:
            for key, value in payload.model_dump().items():
                setattr(rule, key, value)
        if changed:
            rule.next_index = 0
        rule.next_date = next_date(rule.start_date, rule.frequency_unit, rule.interval, rule.next_index, rule.end_date)
        await self.db.flush()
        # Already-due rules post on save; today waits until 06:00.
        await generate_due(self.db, rule, cutoff)
        response = RecurrenceResponse.model_validate(rule)
        await self.db.commit()
        return response

    async def status(self, user_id, recurrence_id, active: bool | None):
        await CategoryRepository(self.db).lock_for_user(user_id=user_id)
        rule = await self.required(user_id, recurrence_id)
        if active:
            await self.validate_links(user_id, rule)
        today = await business_today(self.db)
        cutoff, _ = await daily_window(self.db)
        if rule.is_active:
            await generate_due(self.db, rule, cutoff)
            if rule.next_date and rule.next_date <= cutoff:
                raise HTTPException(409, "Le rattrapage est en cours. Réessayez dans quelques instants.")
        if active is None:
            rule.archived = True
            rule.is_active = False
        else:
            if active and not rule.is_active:
                # A deliberate pause skips its occurrences; downtime does not.
                resume_from = today if cutoff < today else today + timedelta(days=1)
                rule.next_index = max(rule.next_index, first_index(rule.start_date, rule.frequency_unit, rule.interval, resume_from))
                rule.next_date = next_date(rule.start_date, rule.frequency_unit, rule.interval, rule.next_index, rule.end_date)
            rule.is_active = active
            await generate_due(self.db, rule, cutoff)
        response = RecurrenceResponse.model_validate(rule)
        await self.db.commit()
        return response

    async def forecast(self, user_id, wallet_id, months: int):
        # Read one consistent snapshot with respect to recurring generation and
        # transaction writes, all of which lock this wallet before adjusting it.
        wallets = await WalletRepository(self.db).lock_many(user_id=user_id, wallet_ids=[wallet_id])
        if not wallets:
            raise HTTPException(404, "Portefeuille introuvable.")
        today = await business_today(self.db)
        y, m = divmod(today.year * 12 + today.month - 1 + months - 1, 12)
        end = date(y, m + 1, monthrange(y, m + 1)[1])
        events = []
        for rule in await self.repository.list_for_user(user_id, wallet_id):
            if not rule.is_active:
                continue
            recorded = await self.repository.recorded_dates(rule.id, rule.next_date, end)
            index = rule.next_index
            while (scheduled := next_date(rule.start_date, rule.frequency_unit, rule.interval, index, rule.end_date)) and scheduled <= end:
                if scheduled not in recorded:
                    events.append(dict(recurrence_id=rule.id, label=rule.label, type=rule.type,
                        amount=rule.amount, scheduled_date=scheduled, date=max(today, scheduled)))
                index += 1
        events.sort(key=lambda event: (event['date'], str(event['recurrence_id'])))
        response = build_forecast(today, end, wallets[0].balance, events)
        await self.db.commit()  # Release the read lock promptly.
        return response


def build_forecast(today, end, balance, events):
    daily = defaultdict(lambda: [Decimal(0), Decimal(0)])
    for event in events:
        daily[event['date']][event['type'] == 'expense'] += event['amount']
    rows = []
    minimum = balance
    year, month = today.year, today.month
    while date(year, month, 1) <= end:
        opening = balance
        low = balance
        low_date = max(today, date(year, month, 1))
        income = expenses = Decimal(0)
        for day in sorted(daily):
            if (day.year, day.month) != (year, month):
                continue
            received, spent = daily[day]
            income += received
            expenses += spent
            balance += received - spent
            if balance < low:
                low, low_date = balance, day
        minimum = min(minimum, low)
        rows.append(dict(month=f'{year:04}-{month:02}', income=income, expenses=expenses,
            net=income-expenses, opening_balance=opening, closing_balance=balance,
            minimum_balance=low, minimum_date=low_date))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return ForecastResponse(date_from=today, date_to=end, current_balance=rows[0]['opening_balance'],
        minimum_balance=minimum, months=rows, occurrences=events)
