"""Calendar arithmetic anchored to the original date (never a clamped occurrence)."""
from calendar import monthrange
from datetime import date, timedelta


def occurrence_date(anchor: date, unit: str, interval: int, index: int) -> date:
    if interval < 1 or index < 0:
        raise ValueError("Invalid recurrence interval or index")
    if unit == "week":
        return anchor + timedelta(weeks=interval * index)
    if unit not in ("month", "year"):
        raise ValueError("Invalid recurrence unit")
    months = interval * index * (12 if unit == "year" else 1)
    year, month = divmod(anchor.year * 12 + anchor.month - 1 + months, 12)
    return date(year, month + 1, min(anchor.day, monthrange(year, month + 1)[1]))


def first_index(anchor: date, unit: str, interval: int, target: date) -> int:
    if target <= anchor:
        return 0
    if unit == "week":
        return ((target - anchor).days + 7 * interval - 1) // (7 * interval)
    months = (target.year - anchor.year) * 12 + target.month - anchor.month
    index = max(0, months // (interval * (12 if unit == "year" else 1)))
    return index + (occurrence_date(anchor, unit, interval, index) < target)


def next_date(anchor: date, unit: str, interval: int, index: int, end: date | None) -> date | None:
    try:
        result = occurrence_date(anchor, unit, interval, index)
    except (ValueError, OverflowError):
        return None
    return None if end and result > end else result
