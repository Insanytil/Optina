"""Create recurring rules and durable occurrence receipts.

Revision ID: c3b6e190d284
Revises: 4578518bcbe3
"""
from alembic import op
import sqlalchemy as sa

revision = "c3b6e190d284"
down_revision = "4578518bcbe3"
branch_labels = None
depends_on = None


def timestamps():
    return [sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)]


def upgrade():
    op.create_table("recurrences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("wallet_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("amount", sa.Numeric(19, 2), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("frequency_unit", sa.String(8), nullable=False),
        sa.Column("interval", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("next_index", sa.Integer(), nullable=False),
        sa.Column("next_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_recurrences"),
        sa.UniqueConstraint("id", "user_id", name="uq_recurrences_id_user_id"),
        sa.ForeignKeyConstraint(["wallet_id", "user_id"], ["wallets.id", "wallets.user_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["category_id", "user_id"], ["categories.id", "categories.user_id"], ondelete="RESTRICT"),
        sa.CheckConstraint("amount > 0 AND amount <> 'NaN'::numeric", name="positive_amount"),
        sa.CheckConstraint("type IN ('income', 'expense')", name="valid_type"),
        sa.CheckConstraint("frequency_unit IN ('week', 'month', 'year') AND interval BETWEEN 1 AND 120", name="valid_frequency"),
        sa.CheckConstraint("next_index >= 0", name="valid_index"),
        sa.CheckConstraint("end_date IS NULL OR end_date >= start_date", name="valid_end"))
    op.create_index("ix_recurrences_due", "recurrences", ["is_active", "next_date"])
    op.create_index("ix_recurrences_user_wallet", "recurrences", ["user_id", "wallet_id"])
    op.add_column("wallet_transactions", sa.Column("recurrence_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_wallet_transactions_recurrence_owner", "wallet_transactions", "recurrences",
        ["recurrence_id", "user_id"], ["id", "user_id"], ondelete="RESTRICT")
    op.create_table("recurrence_occurrences",
        sa.Column("recurrence_id", sa.Uuid(), nullable=False),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("transaction_id", sa.Uuid(), nullable=True),
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_recurrence_occurrences"),
        sa.UniqueConstraint("recurrence_id", "scheduled_date", name="uq_recurrence_occurrences_date"),
        sa.ForeignKeyConstraint(["recurrence_id"], ["recurrences.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["transaction_id"], ["wallet_transactions.id"], ondelete="SET NULL"))

    op.create_index("ix_recurrence_occurrences_transaction", "recurrence_occurrences", ["transaction_id"])


def downgrade():
    op.drop_table("recurrence_occurrences")
    op.drop_constraint("fk_wallet_transactions_recurrence_owner", "wallet_transactions", type_="foreignkey")
    op.drop_column("wallet_transactions", "recurrence_id")
    op.drop_table("recurrences")
