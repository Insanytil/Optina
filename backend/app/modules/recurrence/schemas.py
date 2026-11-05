import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.modules.transaction.schemas import Amount, Label
from app.models.wallet_transaction import TransactionType


class RecurrenceWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wallet_id: uuid.UUID
    category_id: uuid.UUID
    label: Label
    type: TransactionType
    amount: Amount
    note: str | None = Field(default=None, max_length=5000)
    frequency_unit: Literal["week", "month", "year"]
    interval: int = Field(ge=1, le=120)
    start_date: date
    end_date: date | None = None

    @model_validator(mode="after")
    def valid_end(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("La fin doit suivre la première échéance.")
        return self


class RecurrenceCreate(RecurrenceWrite):
    is_active: bool = True


class RecurrenceResponse(RecurrenceWrite):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    next_date: date | None
    is_active: bool
    archived: bool


class RecurrenceStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_active: bool


class ForecastMonth(BaseModel):
    month: str
    income: Decimal
    expenses: Decimal
    net: Decimal
    opening_balance: Decimal
    closing_balance: Decimal
    minimum_balance: Decimal
    minimum_date: date


class ForecastOccurrence(BaseModel):
    recurrence_id: uuid.UUID
    label: str
    type: TransactionType
    amount: Decimal
    scheduled_date: date
    date: date


class ForecastResponse(BaseModel):
    date_from: date
    date_to: date
    current_balance: Decimal
    minimum_balance: Decimal
    months: list[ForecastMonth]
    occurrences: list[ForecastOccurrence]
