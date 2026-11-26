"""Replace stored budget periods, series, versions and views with simple budgets.

Budgets start over: existing budget data is dropped (agreed, no real data yet).

Revision ID: d8a41c6e2f90
Revises: b5d2e8f1a3c7
"""
from alembic import op
import sqlalchemy as sa

revision = "d8a41c6e2f90"
down_revision = "b5d2e8f1a3c7"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("budget_version_wallets", "budget_versions", "budget_wallets", "budgets", "budget_series", "budget_views"):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

    op.create_table(
        "budgets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("frequency", sa.String(16), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("carry_over", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("alert_threshold", sa.Integer(), server_default="80", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "user_id", name="uq_budgets_owner"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["category_id", "user_id"], ["categories.id", "categories.user_id"], ondelete="RESTRICT"),
        sa.CheckConstraint("frequency IN ('week','month','quarter','year','once')", name="valid_frequency"),
        sa.CheckConstraint("end_date IS NULL OR end_date >= start_date", name="valid_dates"),
        sa.CheckConstraint("frequency <> 'once' OR end_date IS NOT NULL", name="once_has_end"),
        sa.CheckConstraint("alert_threshold BETWEEN 1 AND 200", name="valid_threshold"),
    )
    op.create_index("ix_budgets_owner", "budgets", ["user_id"])

    op.create_table(
        "budget_wallets",
        sa.Column("budget_id", sa.Uuid(), nullable=False),
        sa.Column("wallet_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("budget_id", "wallet_id"),
        sa.ForeignKeyConstraint(["budget_id", "user_id"], ["budgets.id", "budgets.user_id"], name="fk_budget_wallets_budget_owner", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wallet_id", "user_id"], ["wallets.id", "wallets.user_id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_budget_wallets_wallet", "budget_wallets", ["wallet_id"])

    op.create_table(
        "budget_amounts",
        sa.Column("budget_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(19, 2), nullable=False),
        sa.PrimaryKeyConstraint("budget_id", "effective_from"),
        sa.ForeignKeyConstraint(["budget_id", "user_id"], ["budgets.id", "budgets.user_id"], name="fk_budget_amounts_budget_owner", ondelete="CASCADE"),
        sa.CheckConstraint("amount > 0 AND amount <> 'NaN'::numeric", name="positive_amount"),
    )


def downgrade():
    raise NotImplementedError("The previous budget model cannot be restored; budgets were started over.")
