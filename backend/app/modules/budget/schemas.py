import uuid
from datetime import date
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.modules.budget.calculation import calendar_period
from app.modules.transaction.schemas import Amount, Label

Frequency = Literal['week', 'month', 'quarter', 'year', 'once']


class DatedAmount(BaseModel):
    model_config = ConfigDict(extra='forbid', from_attributes=True)
    effective_from: date
    amount: Amount


class BudgetWrite(BaseModel):
    """A budget definition. Dates and amounts are aligned on the calendar periods.

    A repeating budget starts on the first day of the period containing
    `start_date` and ends (if `end_date` is given) on the last day of the period
    containing it. Each dated amount applies from the start of its period.
    """
    model_config = ConfigDict(extra='forbid')
    name: Label
    category_id: uuid.UUID
    wallet_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    frequency: Frequency
    start_date: date
    end_date: date | None = None
    amounts: list[DatedAmount] = Field(min_length=1, max_length=240)
    carry_over: bool = False
    alert_threshold: int = Field(default=80, ge=1, le=200)

    @field_validator('wallet_ids')
    @classmethod
    def unique_wallets(cls, value):
        return sorted(set(value))

    @model_validator(mode='after')
    def normalize(self):
        if not 1900 <= self.start_date.year <= 9998 or (self.end_date and not 1900 <= self.end_date.year <= 9998):
            raise ValueError('Choisissez des dates entre 1900 et 9998.')
        if self.frequency == 'once':
            if self.end_date is None or self.end_date < self.start_date:
                raise ValueError('Choisissez une date de fin après la date de début.')
            if (self.end_date - self.start_date).days > 3660:
                raise ValueError('Une période ponctuelle dure au plus dix ans.')
            if len(self.amounts) != 1:
                raise ValueError('Un budget ponctuel a un seul montant.')
            self.amounts = [DatedAmount(effective_from=self.start_date, amount=self.amounts[0].amount)]
            self.carry_over = False
            return self

        self.start_date = calendar_period(self.frequency, self.start_date)[0]
        if self.end_date is not None:
            self.end_date = calendar_period(self.frequency, self.end_date)[1]
            if self.end_date < self.start_date:
                raise ValueError('La fin doit suivre le début.')
        aligned = {}
        for row in sorted(self.amounts, key=lambda row: row.effective_from):
            start = max(self.start_date, calendar_period(self.frequency, row.effective_from)[0])
            if self.end_date and start > self.end_date:
                raise ValueError('Un montant commence après la fin du budget.')
            if start in aligned:
                raise ValueError('Deux montants commencent à la même période.')
            aligned[start] = row.amount
        self.amounts = [DatedAmount(effective_from=start, amount=amount) for start, amount in aligned.items()]
        return self


class BudgetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    category_id: uuid.UUID
    wallet_ids: list[uuid.UUID]
    frequency: Frequency
    start_date: date
    end_date: date | None
    amounts: list[DatedAmount]
    carry_over: bool
    alert_threshold: int


class BudgetOccurrence(BaseModel):
    recurrence_id: uuid.UUID
    date: date
    label: str
    amount: Decimal


class BudgetPeriod(BaseModel):
    start: date
    end: date
    base: Decimal
    carry: Decimal
    available: Decimal
    spent: Decimal


class BudgetStatus(BudgetResponse):
    """A budget's period for the requested month, with spending and what is still planned."""
    period: BudgetPeriod
    upcoming: Decimal
    committed: Decimal
    remaining: Decimal
    occurrences: list[BudgetOccurrence]


class BudgetStatusList(BaseModel):
    as_of: date
    month: date
    items: list[BudgetStatus]
    # Budgets can overlap: deliberately no additive totals.


class BudgetHistory(BaseModel):
    as_of: date
    periods: list[BudgetPeriod]
