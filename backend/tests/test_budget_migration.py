import importlib.util
from io import StringIO
from pathlib import Path
import unittest
from alembic.migration import MigrationContext
from alembic.operations import Operations


class BudgetMigrationTests(unittest.TestCase):
    def test_dependency_order_overlap_constraint_and_no_legacy_rewrite(self):
        path=Path(__file__).resolve().parents[1]/'alembic/versions/f56a2d91c780_create_budgets.py'
        spec=importlib.util.spec_from_file_location('budget_migration',path)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for direction in ['upgrade','downgrade']:
            output=StringIO()
            context=MigrationContext.configure(dialect_name='postgresql',opts={'as_sql':True,'output_buffer':output})
            with Operations.context(context): getattr(module,direction)()
            sql=output.getvalue()
            if direction=='upgrade':
                self.assertLess(sql.index('CREATE TABLE budgets'),sql.index('CREATE TABLE budget_wallets'))
                self.assertIn('UNIQUE (user_id, category_id, month, wallet_id)',sql)
                self.assertIn('REFERENCES budgets (id, user_id, category_id, month)',sql)
                self.assertNotIn('UPDATE ',sql)
                self.assertNotIn('INSERT ',sql)
            else:
                self.assertLess(sql.index('DROP TABLE budget_wallets'),sql.index('DROP TABLE budgets;'))

    def test_objective_migration_replaces_overlap_guard_after_dropping_dependent_fk(self):
        path=Path(__file__).resolve().parents[1]/'alembic/versions/71d2bc830f04_objective_periods_and_views.py'
        spec=importlib.util.spec_from_file_location('objective_migration',path)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        output=StringIO()
        context=MigrationContext.configure(dialect_name='postgresql',opts={'as_sql':True,'output_buffer':output})
        with Operations.context(context): module.upgrade()
        sql=output.getvalue()
        self.assertLess(sql.index('DROP CONSTRAINT fk_budget_wallets_budget_id_budgets'),sql.index('DROP CONSTRAINT uq_budgets_scope'))
        self.assertIn('DROP CONSTRAINT uq_budget_wallets_coverage',sql)
        self.assertLess(sql.index('ADD CONSTRAINT uq_budgets_owner UNIQUE'),sql.index('ADD CONSTRAINT fk_budget_wallets_budget_owner'))
        self.assertIn('CREATE UNIQUE INDEX uq_budget_views_default ON budget_views (user_id) WHERE is_default',sql)

    def test_repeating_budget_migration_orders_ownership_constraints_and_preserves_periods_on_rollback(self):
        path=Path(__file__).resolve().parents[1]/'alembic/versions/82f4d90c1b63_repeating_budgets.py'
        spec=importlib.util.spec_from_file_location('repeating_budget_migration',path)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for direction in ['upgrade','downgrade']:
            output=StringIO()
            context=MigrationContext.configure(dialect_name='postgresql',opts={'as_sql':True,'output_buffer':output})
            with Operations.context(context): getattr(module,direction)()
            sql=output.getvalue()
            if direction=='upgrade':
                self.assertLess(sql.index('CREATE TABLE budget_series'),sql.index('CREATE TABLE budget_versions'))
                self.assertLess(sql.index('CREATE TABLE budget_versions'),sql.index('CREATE TABLE budget_version_wallets'))
                self.assertIn('UNIQUE (series_id, date_from)',sql)
                self.assertIn('REFERENCES budget_series (id, user_id)',sql)
            else:
                self.assertLess(sql.index('DROP CONSTRAINT fk_budgets_series_id_budget_series'),sql.index('DROP TABLE budget_series'))
                self.assertNotIn('DROP TABLE budgets;',sql)
                self.assertNotIn('DELETE FROM budgets',sql)
