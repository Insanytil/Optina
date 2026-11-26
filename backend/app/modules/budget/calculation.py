"""Pure budget arithmetic: calendar periods, dated amounts, carry-over and net spending.

Nothing here touches the database, so it is fully unit-tested.
"""
import calendar
from datetime import date, timedelta
from decimal import Decimal
from app.modules.recurrence.schedule import first_index, next_date

ZERO = Decimal('0.00')
FREQUENCIES = ('week', 'month', 'quarter', 'year', 'once')


def calendar_period(kind: str, anchor: date) -> tuple[date, date]:
    """The calendar week (Monday-Sunday), month, quarter or year containing `anchor`."""
    if kind == 'week':
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=6)
    if kind == 'year':
        return date(anchor.year, 1, 1), date(anchor.year, 12, 31)
    if kind not in ('month', 'quarter'):
        raise ValueError(f'Not a calendar period: {kind}')
    first = ((anchor.month - 1) // 3) * 3 + 1 if kind == 'quarter' else anchor.month
    last = first + 2 if kind == 'quarter' else first
    return date(anchor.year, first, 1), date(anchor.year, last, calendar.monthrange(anchor.year, last)[1])


def period_containing(budget, day: date) -> tuple[date, date] | None:
    """The budget period that contains `day`, or None outside the budget's span."""
    if day < budget.start_date or (budget.end_date and day > budget.end_date):
        return None
    if budget.frequency == 'once':
        return budget.start_date, budget.end_date
    return calendar_period(budget.frequency, day)


def periods_through(budget, last: tuple[date, date], count: int | None = None) -> list[tuple[date, date]]:
    """Periods from the budget start (or the `count` latest) up to and including `last`."""
    if budget.frequency == 'once':
        return [last]
    result = []
    current = last
    while current[0] >= budget.start_date:
        result.append(current)
        if count is not None and len(result) >= count:
            break
        current = calendar_period(budget.frequency, current[0] - timedelta(days=1))
    return result[::-1]


def amount_at(amounts, start: date) -> Decimal:
    """The amount in force for a period starting on `start` (amounts sorted by date)."""
    current = amounts[0]['amount']
    for row in amounts:
        if row['effective_from'] <= start:
            current = row['amount']
    return current


def net_spent(flows) -> Decimal:
    """Expenses minus refunds (incomes in the same scope), never below zero."""
    total = ZERO
    for flow in flows:
        total += flow['amount'] if flow['type'] == 'expense' else -flow['amount']
    return max(ZERO, total)


def ledger(budget, periods, flows) -> list[dict]:
    """Each period's base amount, carried amount, available amount and net spending.

    With carry-over, what is left (or overspent) at the end of a period is added
    to the next one. `periods` must start at the budget's first period for the
    carried amounts to be right.
    """
    rows = []
    carry = ZERO
    for start, end in periods:
        base = amount_at(budget.amounts, start)
        spent = net_spent(flow for flow in flows if start <= flow['date'] <= end)
        available = base + carry
        rows.append(dict(start=start, end=end, base=base, carry=carry, available=available, spent=spent))
        carry = available - spent if budget.carry_over else ZERO
    return rows


def descendants(categories: dict, root) -> set:
    """`root` and every category below it; `categories` maps id -> node with `parent_id`."""
    children = {}
    for identifier, node in categories.items():
        children.setdefault(node.parent_id, []).append(identifier)
    result, stack = set(), [root]
    while stack:
        current = stack.pop()
        if current in result:
            continue
        result.add(current)
        stack.extend(children.get(current, []))
    return result


def pending(rules, receipts, category_ids, wallet_ids, start: date, end: date, today: date) -> list[dict]:
    """Recurring expenses of the scope still to come in [start, end] (not yet generated)."""
    if end < today:
        return []
    items = []
    for rule in rules:
        if rule.type != 'expense' or not rule.is_active or rule.archived or rule.next_date is None:
            continue
        if rule.category_id not in category_ids or rule.wallet_id not in wallet_ids:
            continue
        index = max(rule.next_index, first_index(rule.start_date, rule.frequency_unit, rule.interval, start))
        while (scheduled := next_date(rule.start_date, rule.frequency_unit, rule.interval, index, rule.end_date)) and scheduled <= end:
            if (rule.id, scheduled) not in receipts:
                items.append(dict(recurrence_id=rule.id, date=scheduled, label=rule.label, amount=rule.amount))
            index += 1
    return sorted(items, key=lambda item: (item['date'], str(item['recurrence_id'])))
