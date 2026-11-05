import importlib.util
from io import StringIO
from pathlib import Path
import unittest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.models.category_wallet import CategoryWallet


class CategoryWalletMigrationTests(unittest.TestCase):
    def test_migration_creates_owner_scoped_association_without_legacy_rewrite(self):
        path=Path(__file__).resolve().parents[1]/'alembic/versions/e41d1c43a209_category_wallet_availability.py'
        spec=importlib.util.spec_from_file_location('category_wallet_migration',path)
        migration=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        self.assertEqual(migration.down_revision,'c3b6e190d284')
        for direction in ['upgrade','downgrade']:
            output=StringIO()
            context=MigrationContext.configure(dialect_name='postgresql',opts={'as_sql':True,'output_buffer':output})
            with Operations.context(context): getattr(migration,direction)()
            sql=output.getvalue()
            if direction=='upgrade':
                self.assertIn('DEFAULT false NOT NULL',sql)
                self.assertIn('FOREIGN KEY(category_id, user_id) REFERENCES categories (id, user_id)',sql)
                self.assertIn('FOREIGN KEY(wallet_id, user_id) REFERENCES wallets (id, user_id)',sql)
                self.assertNotIn('UPDATE ',sql)
                self.assertNotIn('INSERT ',sql)
            else:
                self.assertLess(sql.index('DROP TABLE category_wallets'),sql.index('DROP COLUMN restrict_wallets'))

    def test_association_is_unique_and_both_foreign_keys_enforce_owner(self):
        table=CategoryWallet.__table__
        self.assertEqual(set(table.primary_key.columns.keys()),{'category_id','wallet_id'})
        self.assertEqual(len(table.foreign_key_constraints),2)
        for constraint in table.foreign_key_constraints:
            self.assertIn('user_id',constraint.column_keys)
