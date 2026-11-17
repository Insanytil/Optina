"""Monthly category budgets and non-overlapping wallet coverage.

Revision ID: f56a2d91c780
Revises: e41d1c43a209
"""
from alembic import op
import sqlalchemy as sa

revision = 'f56a2d91c780'
down_revision = 'e41d1c43a209'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('budgets',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('category_id', sa.Uuid(), nullable=False),
        sa.Column('month', sa.Date(), nullable=False),
        sa.Column('amount', sa.Numeric(19, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('id', 'user_id', 'category_id', 'month', name='uq_budgets_scope'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['category_id', 'user_id'], ['categories.id', 'categories.user_id'], ondelete='RESTRICT'),
        sa.CheckConstraint("amount > 0 AND amount <> 'NaN'::numeric", name='positive_amount'),
        sa.CheckConstraint("EXTRACT(DAY FROM month) = 1 AND EXTRACT(YEAR FROM month) BETWEEN 1900 AND 9998", name='valid_month'))
    op.create_index('ix_budgets_owner_month', 'budgets', ['user_id', 'month'])
    op.create_table('budget_wallets',
        sa.Column('budget_id', sa.Uuid(), nullable=False),
        sa.Column('wallet_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('category_id', sa.Uuid(), nullable=False),
        sa.Column('month', sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint('budget_id', 'wallet_id'),
        sa.UniqueConstraint('user_id', 'category_id', 'month', 'wallet_id', name='uq_budget_wallets_coverage'),
        sa.ForeignKeyConstraint(['budget_id', 'user_id', 'category_id', 'month'],
            ['budgets.id', 'budgets.user_id', 'budgets.category_id', 'budgets.month'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['wallet_id', 'user_id'], ['wallets.id', 'wallets.user_id'], ondelete='RESTRICT'))
    op.create_index('ix_budget_wallets_wallet', 'budget_wallets', ['wallet_id'])
    op.create_index('ix_budget_wallets_owner_month', 'budget_wallets', ['user_id', 'month'])


def downgrade():
    op.drop_table('budget_wallets')
    op.drop_table('budgets')
