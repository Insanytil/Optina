import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.pagination import PagePaginationParams

CategoryName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wallet_ids: list[uuid.UUID] | None = Field(default=None, max_length=500)
    name: CategoryName
    parent_id: uuid.UUID | None = None


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wallet_ids: list[uuid.UUID] | None = Field(default=None, max_length=500)
    name: CategoryName
    parent_id: uuid.UUID | None = None


class CategoryMove(BaseModel):
    model_config = ConfigDict(extra="forbid")
    parent_id: uuid.UUID | None
    before_id: uuid.UUID | None = None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    wallet_ids: list[uuid.UUID] | None = None
    id: uuid.UUID
    position: int = Field(default=0, ge=0)
    name: str
    parent_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class CategoryListParams(PagePaginationParams):
    parent_id: uuid.UUID | None = None
