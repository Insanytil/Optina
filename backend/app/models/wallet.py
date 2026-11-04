import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_entity import BaseEntity

if TYPE_CHECKING:
    from app.models.user import User


class Wallet(BaseEntity):
    __tablename__ = "wallets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(19, 2), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    user: Mapped["User"] = relationship(
        back_populates="wallets",
        lazy="raise",
    )
