"""Wallet color.

Revision ID: b5d2e8f1a3c7
Revises: 82f4d90c1b63
"""
from alembic import op
import sqlalchemy as sa

revision = "b5d2e8f1a3c7"
down_revision = "82f4d90c1b63"
branch_labels = None
depends_on = None

# Frozen copy of the palette at the time of this migration.
PALETTE = ["#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b"]


def upgrade():
    op.add_column("wallets", sa.Column("color", sa.String(7), nullable=True))
    # Existing wallets get palette colors in creation order, per user.
    palette = "ARRAY[" + ", ".join(f"'{color}'" for color in PALETTE) + "]"
    op.execute(f"""
        UPDATE wallets SET color = ranked.color
        FROM (
            SELECT id, ({palette})[((row_number() OVER (PARTITION BY user_id ORDER BY created_at, id)) - 1) % {len(PALETTE)} + 1] AS color
            FROM wallets
        ) AS ranked
        WHERE wallets.id = ranked.id
    """)
    op.alter_column("wallets", "color", nullable=False, server_default=PALETTE[0])


def downgrade():
    op.drop_column("wallets", "color")
