import unittest
from datetime import date
from decimal import Decimal as D
from types import SimpleNamespace as Node
from uuid import uuid4
from app.modules.budget import calculation as c


def budget(frequency='month', start=date(2026, 1, 1), end=None, amounts=None, carry_over=False):
    return Node(frequency=frequency, start_date=start, end_date=end, carry_over=carry_over,
                amounts=amounts or [dict(effective_from=start, amount=D('100.00'))])


def flow(day, amount, kind='expense'):
    return dict(date=day, type=kind, amount=D(amount))


class PeriodTests(unittest.TestCase):
    def test_calendar_periods(self):
        self.assertEqual(c.calendar_period('week', date(2026, 11, 26)), (date(2026, 11, 23), date(2026, 11, 29)))
        self.assertEqual(c.calendar_period('month', date(2028, 2, 10)), (date(2028, 2, 1), date(2028, 2, 29)))
        self.assertEqual(c.calendar_period('quarter', date(2026, 11, 26)), (date(2026, 10, 1), date(2026, 12, 31)))
        self.assertEqual(c.calendar_period('year', date(2026, 11, 26)), (date(2026, 1, 1), date(2026, 12, 31)))

    def test_period_containing_respects_span(self):
        b = budget(start=date(2026, 3, 1), end=date(2026, 5, 31))
        self.assertIsNone(c.period_containing(b, date(2026, 2, 28)))
        self.assertEqual(c.period_containing(b, date(2026, 4, 15)), (date(2026, 4, 1), date(2026, 4, 30)))
        self.assertIsNone(c.period_containing(b, date(2026, 6, 1)))
        once = budget('once', date(2027, 7, 3), date(2027, 7, 20))
        self.assertEqual(c.period_containing(once, date(2027, 7, 10)), (date(2027, 7, 3), date(2027, 7, 20)))

    def test_periods_through_starts_at_budget_start(self):
        b = budget(start=date(2026, 9, 1))
        self.assertEqual([p[0] for p in c.periods_through(b, (date(2026, 11, 1), date(2026, 11, 30)))],
                         [date(2026, 9, 1), date(2026, 10, 1), date(2026, 11, 1)])
        self.assertEqual(len(c.periods_through(b, (date(2026, 11, 1), date(2026, 11, 30)), count=2)), 2)

    def test_dated_amounts(self):
        amounts = [dict(effective_from=date(2026, 1, 1), amount=D('400')), dict(effective_from=date(2027, 1, 1), amount=D('450'))]
        self.assertEqual(c.amount_at(amounts, date(2026, 12, 1)), D('400'))
        self.assertEqual(c.amount_at(amounts, date(2027, 1, 1)), D('450'))


class SpendingTests(unittest.TestCase):
    def test_refunds_are_deducted_and_floored_at_zero(self):
        self.assertEqual(c.net_spent([flow(date(2026, 1, 3), '100'), flow(date(2026, 1, 12), '40', 'income')]), D('60'))
        self.assertEqual(c.net_spent([flow(date(2026, 1, 3), '20'), flow(date(2026, 1, 12), '50', 'income')]), D('0'))

    def test_ledger_without_carry_over(self):
        b = budget(amounts=[dict(effective_from=date(2026, 1, 1), amount=D('150'))])
        periods = [(date(2026, 1, 1), date(2026, 1, 31)), (date(2026, 2, 1), date(2026, 2, 28))]
        rows = c.ledger(b, periods, [flow(date(2026, 1, 5), '120')])
        self.assertEqual([r['available'] for r in rows], [D('150'), D('150')])
        self.assertEqual([r['spent'] for r in rows], [D('120'), D('0')])

    def test_ledger_carries_leftover_and_overspending(self):
        b = budget(amounts=[dict(effective_from=date(2026, 1, 1), amount=D('150'))], carry_over=True)
        periods = [(date(2026, 1, 1), date(2026, 1, 31)), (date(2026, 2, 1), date(2026, 2, 28)), (date(2026, 3, 1), date(2026, 3, 31))]
        rows = c.ledger(b, periods, [flow(date(2026, 1, 5), '120'), flow(date(2026, 2, 5), '230')])
        self.assertEqual([r['carry'] for r in rows], [D('0'), D('30'), D('-50')])
        self.assertEqual([r['available'] for r in rows], [D('150'), D('180'), D('100')])


class ScopeTests(unittest.TestCase):
    def test_descendants_include_any_level(self):
        root, child, leaf, other = uuid4(), uuid4(), uuid4(), uuid4()
        tree = {root: Node(parent_id=None), child: Node(parent_id=root), leaf: Node(parent_id=child), other: Node(parent_id=None)}
        self.assertEqual(c.descendants(tree, child), {child, leaf})
        self.assertEqual(c.descendants(tree, root), {root, child, leaf})

    def test_pending_only_counts_scope_and_ungenerated_dates(self):
        category, wallet = uuid4(), uuid4()
        rule = Node(id=uuid4(), type='expense', is_active=True, archived=False, next_date=date(2026, 11, 15), next_index=10,
                    category_id=category, wallet_id=wallet, start_date=date(2026, 1, 15), frequency_unit='month', interval=1,
                    end_date=None, label='Loyer', amount=D('350'))
        today = date(2026, 11, 10)
        items = c.pending([rule], set(), {category}, {wallet}, date(2026, 11, 1), date(2026, 11, 30), today)
        self.assertEqual([i['date'] for i in items], [date(2026, 11, 15)])
        self.assertEqual(c.pending([rule], {(rule.id, date(2026, 11, 15))}, {category}, {wallet}, date(2026, 11, 1), date(2026, 11, 30), today), [])
        self.assertEqual(c.pending([rule], set(), {uuid4()}, {wallet}, date(2026, 11, 1), date(2026, 11, 30), today), [])
        self.assertEqual(c.pending([rule], set(), {category}, {wallet}, date(2026, 10, 1), date(2026, 10, 31), today), [])
