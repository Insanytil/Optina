import unittest
from datetime import date
from decimal import Decimal as D
from uuid import uuid4
from pydantic import ValidationError
from app.modules.budget.schemas import BudgetWrite
from app.modules.budget.service import reference_day


def payload(**changes):
    values = dict(name='Courses', category_id=uuid4(), wallet_ids=[uuid4()], frequency='month',
                  start_date='2026-09-14', amounts=[dict(effective_from='2026-09-14', amount='400')])
    values.update(changes)
    return BudgetWrite(**values)


class BudgetWriteTests(unittest.TestCase):
    def test_repeating_dates_and_amounts_align_on_periods(self):
        p = payload(end_date='2027-03-10', amounts=[dict(effective_from='2026-01-01', amount='400'), dict(effective_from='2027-01-20', amount='450')])
        self.assertEqual((p.start_date, p.end_date), (date(2026, 9, 1), date(2027, 3, 31)))
        self.assertEqual([a.effective_from for a in p.amounts], [date(2026, 9, 1), date(2027, 1, 1)])
        self.assertEqual(p.alert_threshold, 80)

    def test_duplicate_or_late_amounts_are_rejected(self):
        with self.assertRaises(ValidationError):
            payload(amounts=[dict(effective_from='2026-10-02', amount='1'), dict(effective_from='2026-10-20', amount='2')])
        with self.assertRaises(ValidationError):
            payload(end_date='2026-12-31', amounts=[dict(effective_from='2026-09-01', amount='1'), dict(effective_from='2027-02-01', amount='2')])

    def test_once_needs_end_and_a_single_amount_and_never_carries(self):
        p = payload(frequency='once', start_date='2027-07-03', end_date='2027-07-20', carry_over=True,
                    amounts=[dict(effective_from='2020-01-01', amount='1200')])
        self.assertEqual(p.amounts[0].effective_from, date(2027, 7, 3))
        self.assertFalse(p.carry_over)
        with self.assertRaises(ValidationError):
            payload(frequency='once', start_date='2027-07-03')
        with self.assertRaises(ValidationError):
            payload(frequency='once', start_date='2027-07-03', end_date='2027-07-20',
                    amounts=[dict(effective_from='2027-07-03', amount='1'), dict(effective_from='2027-07-10', amount='2')])

    def test_threshold_bounds(self):
        with self.assertRaises(ValidationError):
            payload(alert_threshold=0)
        self.assertEqual(payload(alert_threshold=95).alert_threshold, 95)

    def test_reference_day(self):
        today = date(2026, 11, 26)
        self.assertEqual(reference_day(date(2026, 11, 1), today), today)
        self.assertEqual(reference_day(date(2026, 10, 1), today), date(2026, 10, 31))
        self.assertEqual(reference_day(date(2027, 2, 1), today), date(2027, 2, 1))
        self.assertEqual(reference_day(date(2028, 2, 1), today), date(2028, 2, 1))
