import uuid
from datetime import date as DateValue
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, ForeignKeyConstraint, Index, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_entity import BaseEntity

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.wallet import Wallet


class TransactionType(StrEnum):
    EXPENSE = "expense"
    INCOME = "income"


class TransactionKind(StrEnum):
    STANDARD = "standard"
    OPENING_BALANCE = "opening_balance"


class WalletTransaction(BaseEntity):
    __tablename__ = "wallet_transactions"
    __table_args__ = (
        ForeignKeyConstraint(["wallet_id", "user_id"], ["wallets.id", "wallets.user_id"], name="fk_wallet_transactions_wallet_owner", ondelete="RESTRICT"),
        ForeignKeyConstraint(["category_id", "user_id"], ["categories.id", "categories.user_id"], name="fk_wallet_transactions_category_owner", ondelete="RESTRICT"),
        ForeignKeyConstraint(["recurrence_id", "user_id"], ["recurrences.id", "recurrences.user_id"], name="fk_wallet_transactions_recurrence_owner", ondelete="RESTRICT"),
        CheckConstraint("amount > 0 AND amount <> 'NaN'::numeric", name="positive_amount"),
        CheckConstraint("type IN ('expense', 'income')", name="valid_type"),
        CheckConstraint("kind IN ('standard', 'opening_balance')", name="valid_kind"),
        CheckConstraint("(kind = 'standard' AND category_id IS NOT NULL) OR (kind = 'opening_balance' AND category_id IS NULL)", name="category_kind"),
        Index("ix_wallet_transactions_user_date", "user_id", "date", "id"),
        Index("ix_wallet_transactions_wallet_date", "wallet_id", "date", "id"),
        Index("ix_wallet_transactions_category_date", "category_id", "date", "id"),
        Index("uq_wallet_transactions_opening", "wallet_id", unique=True, postgresql_where=text("kind = 'opening_balance'")),
    )

    recurrence_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    wallet_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default=TransactionKind.STANDARD, server_default="standard")
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 2), nullable=False)
    date: Mapped[DateValue] = mapped_column(Date, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    wallet: Mapped["Wallet"] = relationship(back_populates="transactions", foreign_keys=[wallet_id], lazy="raise")
    category: Mapped["Category | None"] = relationship(back_populates="transactions", foreign_keys=[category_id], lazy="raise")
