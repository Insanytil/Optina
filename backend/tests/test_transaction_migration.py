"""Check generated PostgreSQL DDL ordering without modifying a database."""
import importlib.util
from io import StringIO
from pathlib import Path
import unittest

from alembic.migration import MigrationContext
from alembic.operations import Operations


class TransactionMigrationTests(unittest.TestCase):
    def sql(self, direction):
        path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "4578518bcbe3_create_transactions.py"
        spec = importlib.util.spec_from_file_location("transaction_migration", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        output = StringIO()
        context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
        with Operations.context(context):
            getattr(module, direction)()
        return output.getvalue()

    def test_unique_key_exists_before_referencing_table(self):
        sql = self.sql("upgrade")
        self.assertLess(sql.index("ADD CONSTRAINT uq_wallets_id_user_id UNIQUE"), sql.index("CREATE TABLE wallet_transactions"))
        self.assertIn("REFERENCES wallets (id, user_id)", sql)

    def test_downgrade_removes_referencing_table_before_unique_key(self):
        sql = self.sql("downgrade")
        self.assertLess(sql.index("DROP TABLE wallet_transactions"), sql.index("DROP CONSTRAINT uq_wallets_id_user_id"))

    def test_existing_balances_become_openings_without_being_applied_twice(self):
        sql = self.sql("upgrade")
        self.assertIn("INSERT INTO wallet_transactions", sql)
        self.assertIn("abs(balance)", sql)
        self.assertIn("'opening_balance'", sql)
        self.assertIn("FROM wallets WHERE balance <> 0", sql)
        self.assertNotIn("UPDATE wallets", sql)
        self.assertLess(sql.index("CREATE TABLE wallet_transactions"), sql.index("INSERT INTO wallet_transactions"))
