"""Repeating budgets, dated templates and independent period snapshots."""
from alembic import op
import sqlalchemy as sa

revision='82f4d90c1b63'
down_revision='71d2bc830f04'
branch_labels=None
depends_on=None


def timestamps():
    return [sa.Column('created_at',sa.DateTime(timezone=True),nullable=False,server_default=sa.text('now()')),
        sa.Column('updated_at',sa.DateTime(timezone=True),nullable=False,server_default=sa.text('now()'))]


def upgrade():
    op.create_table('budget_series',sa.Column('id',sa.Uuid(),nullable=False),sa.Column('user_id',sa.Uuid(),nullable=False),
        sa.Column('period_type',sa.String(16),nullable=False),sa.Column('start_date',sa.Date(),nullable=False),
        sa.Column('end_date',sa.Date(),nullable=True),*timestamps(),sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('id','user_id',name='uq_budget_series_owner'),sa.ForeignKeyConstraint(['user_id'],['users.id']),
        sa.CheckConstraint("period_type IN ('week','month','quarter','year')",name='valid_series_period_type'),
        sa.CheckConstraint('end_date IS NULL OR end_date >= start_date',name='valid_series_dates'))
    op.create_index('ix_budget_series_owner_start','budget_series',['user_id','start_date'])
    op.create_table('budget_versions',sa.Column('id',sa.Uuid(),nullable=False),sa.Column('user_id',sa.Uuid(),nullable=False),
        sa.Column('series_id',sa.Uuid(),nullable=False),sa.Column('effective_from',sa.Date(),nullable=False),
        sa.Column('name',sa.String(255),nullable=False),sa.Column('category_id',sa.Uuid(),nullable=False),
        sa.Column('amount',sa.Numeric(19,2),nullable=False),*timestamps(),sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('id','user_id',name='uq_budget_versions_owner'),sa.UniqueConstraint('series_id','effective_from',name='uq_budget_version_start'),
        sa.ForeignKeyConstraint(['series_id','user_id'],['budget_series.id','budget_series.user_id'],ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['category_id','user_id'],['categories.id','categories.user_id'],ondelete='RESTRICT'),
        sa.CheckConstraint("amount > 0 AND amount <> 'NaN'::numeric",name='positive_amount'))
    op.create_table('budget_version_wallets',sa.Column('version_id',sa.Uuid(),nullable=False),sa.Column('wallet_id',sa.Uuid(),nullable=False),sa.Column('user_id',sa.Uuid(),nullable=False),
        sa.PrimaryKeyConstraint('version_id','wallet_id'),
        sa.ForeignKeyConstraint(['version_id','user_id'],['budget_versions.id','budget_versions.user_id'],ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['wallet_id','user_id'],['wallets.id','wallets.user_id'],ondelete='RESTRICT'))
    op.create_index('ix_budget_version_wallets_wallet','budget_version_wallets',['wallet_id'])
    op.add_column('budgets',sa.Column('series_id',sa.Uuid(),nullable=True))
    op.add_column('budgets',sa.Column('is_override',sa.Boolean(),nullable=False,server_default=sa.false()))
    op.create_foreign_key('fk_budgets_series_id_budget_series','budgets','budget_series',['series_id','user_id'],['id','user_id'],ondelete='RESTRICT')
    op.create_unique_constraint('uq_budget_series_period','budgets',['series_id','date_from'])


def downgrade():
    # Period snapshots remain as independent one-off budgets.
    op.drop_constraint('uq_budget_series_period','budgets',type_='unique')
    op.drop_constraint('fk_budgets_series_id_budget_series','budgets',type_='foreignkey')
    op.drop_column('budgets','is_override')
    op.drop_column('budgets','series_id')
    op.drop_table('budget_version_wallets')
    op.drop_table('budget_versions')
    op.drop_table('budget_series')
