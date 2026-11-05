import uuid
import calendar
from datetime import date as DateValue, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

WalletName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class WalletCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: WalletName
    opening_date: DateValue = Field(default_factory=DateValue.today)
    balance: Decimal = Field(default=Decimal("0.00"), max_digits=19, decimal_places=2, allow_inf_nan=False)


    @field_validator("opening_date")
    @classmethod
    def valid_opening_date(cls, value: DateValue) -> DateValue:
        if value > DateValue.today():
            raise ValueError("La date d'ouverture ne peut pas être dans le futur.")
        return value


class WalletUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: WalletName


class WalletResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    balance: Decimal
    created_at: datetime
    updated_at: datetime


class WalletPeriod(BaseModel):
    date_from: DateValue = Field(default_factory=lambda: DateValue.today().replace(day=1))
    date_to: DateValue = Field(default_factory=lambda: DateValue.today().replace(
        day=calendar.monthrange(DateValue.today().year, DateValue.today().month)[1]))

    @model_validator(mode="after")
    def valid_period(self):
        if self.date_from > self.date_to:
            raise ValueError("La date de début doit précéder la date de fin.")
        return self


class WalletSummaryResponse(BaseModel):
    wallet: WalletResponse
    date_from: DateValue
    date_to: DateValue
    income: Decimal
    expenses: Decimal
    net: Decimal


class ExpenseBucket(BaseModel):
    date: DateValue
    amount: Decimal


class CategoryExpense(BaseModel):
    category_id: uuid.UUID | None
    name: str
    amount: Decimal


class MonthlyMovement(BaseModel):
    month: str
    income: Decimal
    expenses: Decimal


class TopExpense(BaseModel):
    id: uuid.UUID
    label: str
    category_name: str
    date: DateValue
    amount: Decimal


class ActivityDay(BaseModel):
    date: DateValue
    count: int


class WalletAnalyticsResponse(BaseModel):
    expense_granularity: str
    expenses_by_date: list[ExpenseBucket]
    expenses_by_category: list[CategoryExpense]
    monthly: list[MonthlyMovement]
    top_expenses: list[TopExpense]
    activity: list[ActivityDay]
    activity_from: DateValue
    activity_to: DateValue


class WalletCategoryParams(WalletPeriod):
    category_id: uuid.UUID | None = None


class CategoryCrumb(BaseModel):
    id: uuid.UUID
    name: str


class WalletCategoryBreakdown(BaseModel):
    path: list[CategoryCrumb]
    items: list[CategoryExpense]
    direct_amount: Decimal
    total: Decimal
