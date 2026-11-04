import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

WalletName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class WalletCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: WalletName
    balance: Decimal = Field(default=Decimal("0.00"), max_digits=19, decimal_places=2, allow_inf_nan=False)


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
