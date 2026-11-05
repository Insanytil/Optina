"""Category availability by wallet.

Revision ID: e41d1c43a209
Revises: c3b6e190d284
"""
from alembic import op
import sqlalchemy as sa

revision = "e41d1c43a209"
down_revision = "c3b6e190d284"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("categories", sa.Column("restrict_wallets", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table("category_wallets",
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("wallet_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("category_id", "wallet_id"),
        sa.ForeignKeyConstraint(["category_id", "user_id"], ["categories.id", "categories.user_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wallet_id", "user_id"], ["wallets.id", "wallets.user_id"], ondelete="CASCADE"))
    op.create_index("ix_category_wallets_wallet", "category_wallets", ["wallet_id"])


def downgrade():
    op.drop_table("category_wallets")
    op.drop_column("categories", "restrict_wallets")
