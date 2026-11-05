import unittest
from datetime import date
from app.modules.recurrence.schedule import occurrence_date, first_index, next_date


class ScheduleTests(unittest.TestCase):
    def test_month_end_and_leap_anchor_do_not_drift(self):
        anchor = date(2026, 1, 31)
        self.assertEqual([occurrence_date(anchor, 'month', 1, n) for n in range(4)],
            [anchor, date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30)])
        self.assertEqual(occurrence_date(date(2024,2,29), 'year', 1, 1), date(2025,2,28))
        self.assertEqual(occurrence_date(date(2024,2,29), 'year', 1, 4), date(2028,2,29))

    def test_four_weeks_is_not_monthly(self):
        anchor = date(2026, 1, 1)
        self.assertEqual(occurrence_date(anchor, 'week', 4, 1), date(2026, 1, 29))
        self.assertEqual(occurrence_date(anchor, 'month', 1, 1), date(2026, 2, 1))
        # Both endpoints may fit: some calendar years contain 14 charges.
        self.assertEqual(sum(occurrence_date(anchor, 'week', 4, n).year == 2026 for n in range(15)), 14)

    def test_quarterly_semiannual_and_inclusive_end(self):
        self.assertEqual(occurrence_date(date(2026,8,31), 'month', 3, 1), date(2026,11,30))
        self.assertEqual(occurrence_date(date(2026,8,31), 'month', 6, 1), date(2027,2,28))
        self.assertEqual(next_date(date(2026,1,1), 'month', 1, 1, date(2026,2,1)), date(2026,2,1))
        self.assertIsNone(next_date(date(2026,1,1), 'month', 1, 2, date(2026,2,1)))

    def test_resume_first_date_on_or_after_target(self):
        for unit, interval in [('week',1),('week',4),('month',1),('month',3),('year',1)]:
            for target in [date(2024,1,1),date(2024,2,29),date(2026,7,10)]:
                anchor = date(2024,1,31)
                n = first_index(anchor, unit, interval, target)
                self.assertGreaterEqual(occurrence_date(anchor, unit, interval, n), target)
                if n:
                    self.assertLess(occurrence_date(anchor, unit, interval, n-1), target)
