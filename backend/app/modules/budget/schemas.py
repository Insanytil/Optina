import calendar
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.modules.transaction.schemas import Amount, Label

PeriodType = Literal['week','month','quarter','year','custom']


def calendar_period(kind: str, anchor: date):
    if kind == 'week':
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=6)
    if kind == 'year':
        return date(anchor.year,1,1),date(anchor.year,12,31)
    month = ((anchor.month-1)//3)*3+1 if kind == 'quarter' else anchor.month
    last = month+2 if kind == 'quarter' else month
    return date(anchor.year,month,1),date(anchor.year,last,calendar.monthrange(anchor.year,last)[1])


class BudgetWrite(BaseModel):
    model_config = ConfigDict(extra='forbid')
    repeats: bool = False
    repeat_until: date | None = None
    name: Label
    category_id: uuid.UUID
    date_from: date
    date_to: date
    period_type: PeriodType
    amount: Amount
    wallet_ids: list[uuid.UUID] = Field(min_length=1,max_length=500)

    @field_validator('wallet_ids')
    @classmethod
    def unique_wallets(cls,value): return sorted(set(value))

    @model_validator(mode='after')
    def valid_period(self):
        if not 1900 <= self.date_from.year <= self.date_to.year <= 9998 or self.date_to < self.date_from or (self.date_to-self.date_from).days > 3660:
            raise ValueError('Choisissez une période valide de dix ans au maximum, entre 1900 et 9998.')
        if self.period_type != 'custom' and (self.date_from,self.date_to) != calendar_period(self.period_type,self.date_from):
            raise ValueError('Les dates doivent correspondre à la période calendaire choisie ; sinon utilisez une période personnalisée.')
        if self.repeats:
            if self.period_type == 'custom':
                raise ValueError('Une période personnalisée est ponctuelle. Choisissez une fréquence calendaire pour répéter un budget.')
            if self.repeat_until is not None and (self.repeat_until < self.date_to or self.repeat_until.year > 9998 or calendar_period(self.period_type,self.repeat_until)[1] != self.repeat_until):
                raise ValueError('La fin doit être le dernier jour de la dernière période, après la première période.')
        elif self.repeat_until is not None:
            raise ValueError('Une date de fin de répétition nécessite un budget répétitif.')
        return self


class BudgetResponse(BudgetWrite):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    series_id: uuid.UUID | None = None
    series_start: date | None = None
    is_override: bool = False


class BudgetActivity(BaseModel):
    date: date
    amount: Decimal


class BudgetOccurrence(BaseModel):
    recurrence_id: uuid.UUID
    date: date
    label: str
    amount: Decimal


class BudgetStatus(BudgetResponse):
    spent: Decimal
    upcoming: Decimal
    committed: Decimal
    remaining: Decimal
    activity: list[BudgetActivity]
    occurrences: list[BudgetOccurrence]


class BudgetCollection(BaseModel):
    as_of: date
    items: list[BudgetStatus]
    # Independent goals can overlap: deliberately no additive money totals.


class BudgetViewConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    period_types: list[PeriodType] = Field(min_length=1,max_length=5)
    wallet_ids: list[uuid.UUID] = Field(default_factory=list,max_length=500)
    category_ids: list[uuid.UUID] = Field(default_factory=list,max_length=500)
    budget_ids: list[uuid.UUID] = Field(default_factory=list,max_length=500)
    widgets: list[Literal['progress','trend','upcoming']] = Field(default=['progress','trend','upcoming'],min_length=1,max_length=3)
    status: Literal['all','active','upcoming','ended'] = 'all'

    @field_validator('wallet_ids','category_ids','budget_ids','period_types','widgets')
    @classmethod
    def distinct(cls,value): return list(dict.fromkeys(value))


class BudgetViewWrite(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1,max_length=100)
    preset: Literal['daily','projects','review']
    config: BudgetViewConfig
    is_default: bool = False

    @field_validator('name')
    @classmethod
    def trim_name(cls,value):
        if not value.strip(): raise ValueError('Saisissez un nom de vue.')
        return value.strip()


class BudgetViewResponse(BudgetViewWrite):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
