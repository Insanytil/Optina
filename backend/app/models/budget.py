import uuid
from datetime import date
from decimal import Decimal
from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, ForeignKeyConstraint, Index, JSON, Numeric, PrimaryKeyConstraint, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.base_entity import BaseEntity


class Budget(BaseEntity):
    __tablename__ = 'budgets'
    __table_args__ = (
        UniqueConstraint('id', 'user_id', name='uq_budgets_owner'),
        ForeignKeyConstraint(['category_id', 'user_id'], ['categories.id', 'categories.user_id'], ondelete='RESTRICT'),
        CheckConstraint("amount > 0 AND amount <> 'NaN'::numeric", name='positive_amount'),
        CheckConstraint("date_to >= date_from AND date_to - date_from <= 3660 AND EXTRACT(YEAR FROM date_from) >= 1900 AND EXTRACT(YEAR FROM date_to) <= 9998", name='valid_period'),
        CheckConstraint("period_type IN ('week','month','quarter','year','custom')", name='valid_period_type'),
        ForeignKeyConstraint(['series_id', 'user_id'], ['budget_series.id', 'budget_series.user_id'], ondelete='RESTRICT'),
        UniqueConstraint('series_id', 'date_from', name='uq_budget_series_period'),
        Index('ix_budgets_owner_period', 'user_id', 'date_from', 'date_to'),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(255))
    date_from: Mapped[date] = mapped_column(Date)
    date_to: Mapped[date] = mapped_column(Date)
    period_type: Mapped[str] = mapped_column(String(16))
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 2))
    series_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    is_override: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    series: Mapped['BudgetSeries | None'] = relationship(foreign_keys=[series_id, user_id], lazy='selectin')

    @property
    def repeats(self):
        return self.series_id is not None

    @property
    def repeat_until(self):
        return self.series.end_date if self.series else None

    @property
    def series_start(self):
        return self.series.start_date if self.series else None

    wallet_links: Mapped[list['BudgetWallet']] = relationship(foreign_keys='BudgetWallet.budget_id', cascade='all, delete-orphan', lazy='selectin')

    @property
    def wallet_ids(self) -> list[uuid.UUID]:
        return sorted(link.wallet_id for link in self.wallet_links)


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


class BudgetView(BaseEntity):
    __tablename__ = 'budget_views'
    __table_args__ = (Index('uq_budget_views_default', 'user_id', unique=True, postgresql_where=text('is_default')),)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), index=True)
    name: Mapped[str] = mapped_column(String(100))
    preset: Mapped[str] = mapped_column(String(16))
    config: Mapped[dict] = mapped_column(JSON)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')


class BudgetSeries(BaseEntity):
    __tablename__ = 'budget_series'
    __table_args__ = (
        UniqueConstraint('id', 'user_id', name='uq_budget_series_owner'),
        CheckConstraint("period_type IN ('week','month','quarter','year')", name='valid_series_period_type'),
        CheckConstraint('end_date IS NULL OR end_date >= start_date', name='valid_series_dates'),
        Index('ix_budget_series_owner_start', 'user_id', 'start_date'),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'))
    period_type: Mapped[str] = mapped_column(String(16))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class BudgetVersion(BaseEntity):
    __tablename__ = 'budget_versions'
    __table_args__ = (
        UniqueConstraint('id', 'user_id', name='uq_budget_versions_owner'),
        UniqueConstraint('series_id', 'effective_from', name='uq_budget_version_start'),
        ForeignKeyConstraint(['series_id','user_id'], ['budget_series.id','budget_series.user_id'], ondelete='CASCADE'),
        ForeignKeyConstraint(['category_id','user_id'], ['categories.id','categories.user_id'], ondelete='RESTRICT'),
        CheckConstraint("amount > 0 AND amount <> 'NaN'::numeric", name='positive_amount'),
    )
    series_id: Mapped[uuid.UUID] = mapped_column()
    user_id: Mapped[uuid.UUID] = mapped_column()
    effective_from: Mapped[date] = mapped_column(Date)
    name: Mapped[str] = mapped_column(String(255))
    category_id: Mapped[uuid.UUID] = mapped_column()
    amount: Mapped[Decimal] = mapped_column(Numeric(19,2))
    wallet_links: Mapped[list['BudgetVersionWallet']] = relationship(foreign_keys='BudgetVersionWallet.version_id',cascade='all, delete-orphan',lazy='selectin')

    @property
    def wallet_ids(self):
        return sorted(link.wallet_id for link in self.wallet_links)


class BudgetVersionWallet(Base):
    __tablename__ = 'budget_version_wallets'
    __table_args__ = (
        PrimaryKeyConstraint('version_id','wallet_id'),
        ForeignKeyConstraint(['version_id','user_id'], ['budget_versions.id','budget_versions.user_id'], ondelete='CASCADE'),
        ForeignKeyConstraint(['wallet_id','user_id'], ['wallets.id','wallets.user_id'], ondelete='RESTRICT'),
        Index('ix_budget_version_wallets_wallet','wallet_id'),
    )
    version_id: Mapped[uuid.UUID] = mapped_column()
    wallet_id: Mapped[uuid.UUID] = mapped_column()
    user_id: Mapped[uuid.UUID] = mapped_column()
