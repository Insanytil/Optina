import unittest
from datetime import date
from types import SimpleNamespace as Node
from unittest.mock import AsyncMock, Mock
from uuid import uuid4
from sqlalchemy.dialects import postgresql
from app.modules.budget.repository import BudgetRepository
from app.models.budget import BudgetWallet


class BudgetRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_spending_query_is_scoped_and_aggregates_expenses_once(self):
        db=AsyncMock()
        db.execute.return_value=Mock(all=Mock(return_value=[]))
        user=uuid4()
        await BudgetRepository(db).activity(user,[uuid4()])
        compiled=db.execute.await_args.args[0].compile(dialect=postgresql.dialect())
        sql=str(compiled)
        self.assertIn('sum(wallet_transactions.amount)',sql)
        self.assertIn('budget_wallets.user_id =',sql)
        self.assertIn('wallet_transactions.user_id =',sql)
        self.assertIn(user,compiled.params.values())
        self.assertIn('expense',compiled.params.values())
        self.assertIn('standard',compiled.params.values())
        self.assertIn('wallet_transactions.date >= budgets.date_from',sql)
        self.assertIn('wallet_transactions.date <= budgets.date_to',sql)
        self.assertIn('GROUP BY budgets.id, wallet_transactions.date',sql)

    def test_database_allows_overlapping_objectives_and_enforces_ownership(self):
        from sqlalchemy import UniqueConstraint
        table=BudgetWallet.__table__
        self.assertFalse(any(isinstance(constraint,UniqueConstraint) for constraint in table.constraints))
        self.assertEqual(len(table.foreign_key_constraints),2)
        for constraint in table.foreign_key_constraints:
            self.assertIn('user_id',constraint.column_keys)
