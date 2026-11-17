"""Calendar-aligned budget periods. These never create financial transactions."""
from datetime import date, timedelta
from app.modules.budget.schemas import calendar_period


def periods(kind, first, last, start, end):
    current = max(first, calendar_period(kind, start)[0])
    boundary = min(end, last or date(9998,12,31))
    while current <= boundary:
        begin, finish = calendar_period(kind,current)
        if begin.year < 1900 or finish.year > 9998:
            break
        if finish >= start and (last is None or finish <= last):
            yield begin, finish
        if finish.year == 9998 and finish.month == 12 and finish.day == 31:
            break
        current = finish + timedelta(days=1)


def template_at(versions, start):
    return max((version for version in versions if version.effective_from <= start),key=lambda version:version.effective_from,default=None)


def previous_start(kind, anchor, count):
    current = calendar_period(kind,anchor)[0]
    for _ in range(count):
        if current <= date(1900,1,1):
            return date(1900,1,1)
        current = calendar_period(kind,current-timedelta(days=1))[0]
    return max(date(1900,1,1), current)
