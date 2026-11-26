import uuid
from datetime import date
from decimal import Decimal
from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, ForeignKeyConstraint, Index, Integer, Numeric, PrimaryKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.base_entity import BaseEntity


class Budget(BaseEntity):
    """A spending reference for a category (and its descendants) on some wallets.

    Periods are never stored: they follow the calendar from `start_date` for a
    repeating budget, or are exactly `start_date`..`end_date` for a one-off one.
    """
    __tablename__ = 'budgets'
    __table_args__ = (
        UniqueConstraint('id', 'user_id', name='uq_budgets_owner'),
        ForeignKeyConstraint(['category_id', 'user_id'], ['categories.id', 'categories.user_id'], ondelete='RESTRICT'),
        CheckConstraint("frequency IN ('week','month','quarter','year','once')", name='valid_frequency'),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name='valid_dates'),
        CheckConstraint("frequency <> 'once' OR end_date IS NOT NULL", name='once_has_end'),
        CheckConstraint("alert_threshold BETWEEN 1 AND 200", name='valid_threshold'),
        Index('ix_budgets_owner', 'user_id'),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(255))
    frequency: Mapped[str] = mapped_column(String(16))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    carry_over: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    alert_threshold: Mapped[int] = mapped_column(Integer, default=80, server_default='80')

    wallet_links: Mapped[list['BudgetWallet']] = relationship(foreign_keys='BudgetWallet.budget_id', cascade='all, delete-orphan', lazy='selectin')
    amount_rows: Mapped[list['BudgetAmount']] = relationship(foreign_keys='BudgetAmount.budget_id', cascade='all, delete-orphan', lazy='selectin',
        order_by='BudgetAmount.effective_from')

    @property
    def wallet_ids(self) -> list[uuid.UUID]:
        return sorted(link.wallet_id for link in self.wallet_links)

    @property
    def amounts(self) -> list[dict]:
        return [dict(effective_from=row.effective_from, amount=row.amount) for row in sorted(self.amount_rows, key=lambda row: row.effective_from)]


class BudgetWallet(Base):
    __tablename__ = 'budget_wallets'
    __table_args__ = (
        PrimaryKeyConstraint('budget_id', 'wallet_id'),
        ForeignKeyConstraint(['budget_id', 'user_id'], ['budgets.id', 'budgets.user_id'], name='fk_budget_wallets_budget_owner', ondelete='CASCADE'),
        ForeignKeyConstraint(['wallet_id', 'user_id'], ['wallets.id', 'wallets.user_id'], ondelete='RESTRICT'),
        Index('ix_budget_wallets_wallet', 'wallet_id'),
    )
    budget_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    wallet_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False)


class BudgetAmount(Base):
    """The amount of each period starting on or after `effective_from`, until the next row."""
    __tablename__ = 'budget_amounts'
    __table_args__ = (
        PrimaryKeyConstraint('budget_id', 'effective_from'),
        ForeignKeyConstraint(['budget_id', 'user_id'], ['budgets.id', 'budgets.user_id'], name='fk_budget_amounts_budget_owner', ondelete='CASCADE'),
        CheckConstraint("amount > 0 AND amount <> 'NaN'::numeric", name='positive_amount'),
    )
    budget_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    effective_from: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 2))
