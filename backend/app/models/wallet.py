import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_entity import BaseEntity

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.wallet_transaction import WalletTransaction


class Wallet(BaseEntity):
    __tablename__ = "wallets"
    __table_args__ = (UniqueConstraint("id", "user_id", name="uq_wallets_id_user_id"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(19, 2), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, server_default="#3b82f6")
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    user: Mapped["User"] = relationship(
        back_populates="wallets",
        lazy="raise",
    )

    transactions: Mapped[list["WalletTransaction"]] = relationship(
        back_populates="wallet", foreign_keys="WalletTransaction.wallet_id", passive_deletes="all", lazy="raise",
    )
