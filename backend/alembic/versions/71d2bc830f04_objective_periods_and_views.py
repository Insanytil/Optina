"""Objective periods, intentional overlaps and personal views.

Revision ID: 71d2bc830f04
Revises: f56a2d91c780
"""
from alembic import op
import sqlalchemy as sa

revision='71d2bc830f04'
down_revision='f56a2d91c780'
branch_labels=None
depends_on=None


def coverage_fk():
    # Earlier constraints may have been named by PostgreSQL or Alembic.
    if op.get_context().as_sql: return 'fk_budget_wallets_budget_id_budgets'
    return next(key['name'] for key in sa.inspect(op.get_bind()).get_foreign_keys('budget_wallets') if key['referred_table']=='budgets')


def upgrade():
    op.drop_constraint(coverage_fk(),'budget_wallets',type_='foreignkey')
    op.drop_constraint('uq_budget_wallets_coverage','budget_wallets',type_='unique')
    op.drop_index('ix_budget_wallets_owner_month',table_name='budget_wallets')
    op.drop_column('budget_wallets','month')
    op.drop_column('budget_wallets','category_id')
    op.drop_constraint('uq_budgets_scope','budgets',type_='unique')
    op.drop_constraint('valid_month','budgets',type_='check')
    op.drop_index('ix_budgets_owner_month',table_name='budgets')
    op.alter_column('budgets','month',new_column_name='date_from',existing_type=sa.Date())
    op.add_column('budgets',sa.Column('date_to',sa.Date(),nullable=True))
    op.add_column('budgets',sa.Column('name',sa.String(255),nullable=True))
    op.add_column('budgets',sa.Column('period_type',sa.String(16),nullable=False,server_default='month'))
    # A structural conversion keeps any existing monthly goals intact.
    op.execute("UPDATE budgets SET date_to=(date_from + interval '1 month' - interval '1 day')::date, name=(SELECT name FROM categories WHERE categories.id=budgets.category_id)")
    op.alter_column('budgets','date_to',nullable=False)
    op.alter_column('budgets','name',nullable=False)
    op.alter_column('budgets','period_type',server_default=None)
    op.create_check_constraint('valid_period','budgets',"date_to >= date_from AND date_to - date_from <= 3660 AND EXTRACT(YEAR FROM date_from) >= 1900 AND EXTRACT(YEAR FROM date_to) <= 9998")
    op.create_check_constraint('valid_period_type','budgets',"period_type IN ('week','month','quarter','year','custom')")
    op.create_unique_constraint('uq_budgets_owner','budgets',['id','user_id'])
    op.create_foreign_key('fk_budget_wallets_budget_owner','budget_wallets','budgets',['budget_id','user_id'],['id','user_id'],ondelete='CASCADE')
    op.create_index('ix_budgets_owner_period','budgets',['user_id','date_from','date_to'])
    op.create_table('budget_views',sa.Column('id',sa.Uuid(),nullable=False),sa.Column('user_id',sa.Uuid(),nullable=False),
        sa.Column('name',sa.String(100),nullable=False),sa.Column('preset',sa.String(16),nullable=False),
        sa.Column('config',sa.JSON(),nullable=False),sa.Column('is_default',sa.Boolean(),nullable=False,server_default=sa.false()),
        sa.Column('created_at',sa.DateTime(timezone=True),nullable=False,server_default=sa.text('now()')),
        sa.Column('updated_at',sa.DateTime(timezone=True),nullable=False,server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),sa.ForeignKeyConstraint(['user_id'],['users.id']))
    op.create_index('ix_budget_views_user_id','budget_views',['user_id'])
    op.create_index('uq_budget_views_default','budget_views',['user_id'],unique=True,postgresql_where=sa.text('is_default'))


def downgrade():
    # Rolling back cannot express custom periods or overlapping objectives.
    # Refuse rather than silently delete or change their meaning.
    if not op.get_context().as_sql:
        invalid=op.get_bind().scalar(sa.text("SELECT EXISTS(SELECT 1 FROM budgets WHERE period_type <> 'month') OR EXISTS(SELECT 1 FROM budget_wallets a JOIN budget_wallets b ON a.wallet_id=b.wallet_id AND a.budget_id<b.budget_id JOIN budgets x ON x.id=a.budget_id JOIN budgets y ON y.id=b.budget_id WHERE x.category_id=y.category_id AND x.date_from=y.date_from)"))
        if invalid: raise RuntimeError('Des périodes non mensuelles ou objectifs superposés empêchent ce retour de schéma. Exportez/adaptez ces objectifs avant de réessayer.')
    op.drop_table('budget_views')
    op.drop_constraint('fk_budget_wallets_budget_owner','budget_wallets',type_='foreignkey')
    op.drop_constraint('uq_budgets_owner','budgets',type_='unique')
    op.drop_constraint('valid_period','budgets',type_='check')
    op.drop_constraint('valid_period_type','budgets',type_='check')
    op.drop_index('ix_budgets_owner_period',table_name='budgets')
    op.drop_column('budgets','date_to')
    op.drop_column('budgets','name')
    op.drop_column('budgets','period_type')
    op.alter_column('budgets','date_from',new_column_name='month',existing_type=sa.Date())
    op.create_check_constraint('valid_month','budgets',"EXTRACT(DAY FROM month) = 1 AND EXTRACT(YEAR FROM month) BETWEEN 1900 AND 9998")
    op.create_unique_constraint('uq_budgets_scope','budgets',['id','user_id','category_id','month'])
    op.create_index('ix_budgets_owner_month','budgets',['user_id','month'])
    op.add_column('budget_wallets',sa.Column('category_id',sa.Uuid(),nullable=True))
    op.add_column('budget_wallets',sa.Column('month',sa.Date(),nullable=True))
    op.execute('UPDATE budget_wallets SET category_id=budgets.category_id, month=budgets.month FROM budgets WHERE budgets.id=budget_wallets.budget_id')
    op.alter_column('budget_wallets','category_id',nullable=False)
    op.alter_column('budget_wallets','month',nullable=False)
    op.create_unique_constraint('uq_budget_wallets_coverage','budget_wallets',['user_id','category_id','month','wallet_id'])
    op.create_foreign_key('fk_budget_wallets_budget_id_budgets','budget_wallets','budgets',['budget_id','user_id','category_id','month'],['id','user_id','category_id','month'],ondelete='CASCADE')
    op.create_index('ix_budget_wallets_owner_month','budget_wallets',['user_id','month'])
