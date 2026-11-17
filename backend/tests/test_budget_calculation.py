import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace as Node
from uuid import uuid4
from app.modules.budget.calculation import amounts, category_roots, pending_by_budget
from app.modules.budget.schemas import BudgetWrite, calendar_period
from pydantic import ValidationError


class BudgetCalculationTests(unittest.TestCase):
    def setUp(self):
        self.root,self.child,self.wallet,self.other = [uuid4() for _ in range(4)]
        self.budget = Node(id=uuid4(),category_id=self.root,wallet_ids=[self.wallet],date_from=date(2026,1,1),date_to=date(2026,1,31))
        self.roots = {self.root:self.root,self.child:self.root}
        self.rule = Node(id=uuid4(),category_id=self.child,wallet_id=self.wallet,type='expense',is_active=True,archived=False,
            label='Charge',start_date=date(2026,1,1),next_date=date(2026,1,1),next_index=0,frequency_unit='month',interval=1,end_date=None,amount=Decimal('100.01'))

    def pending(self, receipts=(), month=date(2026,1,1), today=date(2026,1,15), budgets=None, rules=None):
        from calendar import monthrange
        self.budget.date_from=month
        self.budget.date_to=date(month.year,month.month,monthrange(month.year,month.month)[1])
        rows=pending_by_budget(budgets or [self.budget],rules or [self.rule],set(receipts),self.roots,today)
        return {key:sum((row['amount'] for row in items),Decimal('0')) for key,items in rows.items()}

    def test_posting_changes_breakdown_without_double_counting_commitments(self):
        before = self.pending()[self.budget.id]
        self.assertEqual(before,Decimal('100.01'))
        after = self.pending([(self.rule.id,date(2026,1,1))])[self.budget.id]
        self.assertEqual(after,0)
        self.assertEqual(amounts(Decimal('1000'),Decimal('200'),before)['committed'],
            amounts(Decimal('1000'),Decimal('300.01'),after)['committed'])
        # A receipt survives deletion of its transaction: it must never be reserved again.
        self.assertEqual(amounts(Decimal('1000'),Decimal(0),after)['remaining'],Decimal('1000'))

    def test_four_week_cycle_has_two_payments_in_one_calendar_month(self):
        self.rule.frequency_unit='week'
        self.rule.interval=4
        self.assertEqual(self.pending()[self.budget.id],Decimal('200.02'))
        self.assertEqual(self.pending(month=date(2026,2,1))[self.budget.id],Decimal('100.01'))
        self.rule.next_index=1
        self.rule.next_date=date(2026,1,29)
        self.assertEqual(self.pending()[self.budget.id],Decimal('100.01'))

    def test_calendar_end_and_overdue_current_month(self):
        self.rule.start_date=date(2026,1,31)
        self.rule.next_date=date(2026,1,31)
        self.rule.end_date=date(2026,3,31)
        self.assertEqual(self.pending(month=date(2026,2,1))[self.budget.id],Decimal('100.01'))
        self.assertEqual(self.pending(month=date(2026,4,1))[self.budget.id],0)
        self.assertEqual(self.pending(month=date(2026,1,1),today=date(2026,1,31))[self.budget.id],Decimal('100.01'))
        self.assertEqual(self.pending(month=date(2026,1,1),today=date(2026,2,1))[self.budget.id],0)

    def test_paused_archived_income_and_finished_rules_are_not_reserved(self):
        for name,value in [('is_active',False),('archived',True),('type','income'),('next_date',None)]:
            old=getattr(self.rule,name)
            setattr(self.rule,name,value)
            self.assertEqual(self.pending()[self.budget.id],0)
            setattr(self.rule,name,old)

    def test_multiwallet_scopes_and_roots_are_independent(self):
        other=Node(id=uuid4(),category_id=self.root,wallet_ids=[self.other],date_from=self.budget.date_from,date_to=self.budget.date_to)
        result=self.pending(budgets=[self.budget,other])
        self.assertEqual(result[self.budget.id],Decimal('100.01'))
        self.assertEqual(result[other.id],0)
        self.rule.category_id=uuid4()
        self.assertEqual(self.pending()[self.budget.id],0)

    def test_deep_category_tree_rolls_up_and_cycles_fail_closed(self):
        nodes={self.root:Node(parent_id=None)}
        parent=self.root
        for _ in range(1200):
            child=uuid4()
            nodes[child]=Node(parent_id=parent)
            parent=child
        self.assertEqual(category_roots(nodes)[parent],self.root)
        cycle=uuid4()
        self.assertIsNone(category_roots({cycle:Node(parent_id=cycle)})[cycle])

    def test_budget_schema_validates_month_amount_scope_and_normalizes_duplicates(self):
        values=dict(name='Courses',category_id=self.root,date_from='2026-01-01',date_to='2026-01-31',period_type='month',amount='100.01',wallet_ids=[self.wallet,self.wallet])
        self.assertEqual(BudgetWrite(**values).wallet_ids,[self.wallet])
        for field,value in [('date_from','2026-01-02'),('amount','0'),('amount','NaN'),('amount','1.001'),('wallet_ids',[])]:
            with self.subTest(field=field,value=value), self.assertRaises(ValidationError):
                BudgetWrite(**{**values,field:value})
        for kind,anchor,expected in [('week',date(2026,1,1),(date(2025,12,29),date(2026,1,4))),('month',date(2024,2,5),(date(2024,2,1),date(2024,2,29))),('quarter',date(2026,5,12),(date(2026,4,1),date(2026,6,30))),('year',date(2026,8,1),(date(2026,1,1),date(2026,12,31)))]:
            self.assertEqual(calendar_period(kind,anchor),expected)
        custom=BudgetWrite(**{**values,'period_type':'custom','date_from':'2026-02-13','date_to':'2026-05-04'})
        self.assertEqual(custom.date_to,date(2026,5,4))
        for dates in [('2026-02-01','2026-01-01'),('2026-01-01','2040-01-01')]:
            with self.assertRaises(ValidationError):
                BudgetWrite(**{**values,'period_type':'custom','date_from':dates[0],'date_to':dates[1]})

    def test_overlapping_annual_and_monthly_objectives_remain_independent(self):
        annual=Node(id=uuid4(),category_id=self.root,wallet_ids=[self.wallet],date_from=date(2026,1,1),date_to=date(2026,12,31))
        result=pending_by_budget([self.budget,annual],[self.rule],set(),self.roots,date(2026,1,15))
        self.assertEqual(len(result[self.budget.id]),1)
        self.assertEqual(len(result[annual.id]),12)
        self.assertEqual(sum(row['amount'] for row in result[annual.id]),Decimal('1200.12'))
        # In February January is ended, but its overdue occurrence belongs to the ongoing annual objective.
        result=pending_by_budget([self.budget,annual],[self.rule],set(),self.roots,date(2026,2,15))
        self.assertEqual(result[self.budget.id],[])
        self.assertEqual(len(result[annual.id]),12)
