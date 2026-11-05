import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKeyConstraint, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_entity import BaseEntity


class Recurrence(BaseEntity):
    __tablename__ = "recurrences"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_recurrences_id_user_id"),
        ForeignKeyConstraint(["wallet_id", "user_id"], ["wallets.id", "wallets.user_id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["category_id", "user_id"], ["categories.id", "categories.user_id"], ondelete="RESTRICT"),
        CheckConstraint("amount > 0 AND amount <> 'NaN'::numeric", name="positive_amount"),
        CheckConstraint("type IN ('income', 'expense')", name="valid_type"),
        CheckConstraint("frequency_unit IN ('week', 'month', 'year') AND interval BETWEEN 1 AND 120", name="valid_frequency"),
        CheckConstraint("next_index >= 0", name="valid_index"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="valid_end"),
        Index("ix_recurrences_due", "is_active", "next_date"),
        Index("ix_recurrences_user_wallet", "user_id", "wallet_id"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    wallet_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    label: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(16))
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 2))
    note: Mapped[str | None] = mapped_column(Text)
    frequency_unit: Mapped[str] = mapped_column(String(8))
    interval: Mapped[int] = mapped_column(Integer)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    next_index: Mapped[int] = mapped_column(Integer, default=0)
    next_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class RecurrenceOccurrence(BaseEntity):
    """A durable receipt, retained even when the generated transaction is deleted."""
    __tablename__ = "recurrence_occurrences"
    __table_args__ = (
        UniqueConstraint("recurrence_id", "scheduled_date", name="uq_recurrence_occurrences_date"),
        Index("ix_recurrence_occurrences_transaction", "transaction_id"),
        ForeignKeyConstraint(["recurrence_id"], ["recurrences.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["transaction_id"], ["wallet_transactions.id"], ondelete="SET NULL"),
    )
    recurrence_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    scheduled_date: Mapped[date] = mapped_column(Date)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
