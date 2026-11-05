import importlib.util
from io import StringIO
from pathlib import Path
import unittest
from alembic.migration import MigrationContext
from alembic.operations import Operations


class RecurrenceMigrationTests(unittest.TestCase):
    def sql(self, direction):
        path = Path(__file__).resolve().parents[1] / 'alembic/versions/c3b6e190d284_create_recurrences.py'
        spec = importlib.util.spec_from_file_location('recurrence_migration',path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        output = StringIO()
        context = MigrationContext.configure(dialect_name='postgresql',opts={'as_sql':True,'output_buffer':output})
        with Operations.context(context):
            getattr(module,direction)()
        return output.getvalue()

    def test_fk_dependency_order_and_durable_receipt(self):
        sql = self.sql('upgrade')
        self.assertLess(sql.index('CREATE TABLE recurrences'),sql.index('ADD CONSTRAINT fk_wallet_transactions_recurrence_owner'))
        self.assertLess(sql.index('ADD CONSTRAINT fk_wallet_transactions_recurrence_owner'),sql.index('CREATE TABLE recurrence_occurrences'))
        self.assertIn('UNIQUE (recurrence_id, scheduled_date)',sql)
        self.assertIn('ON DELETE SET NULL',sql)
        sql = self.sql('downgrade')
        self.assertLess(sql.index('DROP TABLE recurrence_occurrences'),sql.index('DROP COLUMN recurrence_id'))
        self.assertLess(sql.index('DROP COLUMN recurrence_id'),sql.index('DROP TABLE recurrences'))
