"""Independent objective calculations using exact amounts and unposted occurrences."""
from datetime import date
from decimal import Decimal
from app.modules.recurrence.schedule import first_index, next_date


def category_roots(categories):
    roots = {}
    for identifier in categories:
        current = identifier
        chain = []
        seen = set()
        while current is not None and current not in roots:
            if current in seen or current not in categories:
                current = None
                break
            seen.add(current)
            chain.append(current)
            parent = categories[current].parent_id
            if parent is None:
                roots[current] = current
                break
            current = parent
        root = roots.get(current)
        for child in chain:
            roots[child] = root
    return roots


def pending_by_budget(budgets, rules, receipts, roots, today):
    pending = {budget.id: [] for budget in budgets}
    for budget in budgets:
        if budget.date_to < today:
            continue
        wallets = set(budget.wallet_ids)
        for rule in rules:
            if rule.type != 'expense' or not rule.is_active or rule.archived or rule.next_date is None:
                continue
            if roots.get(rule.category_id) != budget.category_id or rule.wallet_id not in wallets:
                continue
            index = max(rule.next_index, first_index(rule.start_date, rule.frequency_unit, rule.interval, budget.date_from))
            while (scheduled := next_date(rule.start_date, rule.frequency_unit, rule.interval, index, rule.end_date)) and scheduled <= budget.date_to:
                if (rule.id, scheduled) not in receipts:
                    pending[budget.id].append(dict(recurrence_id=rule.id, date=scheduled, label=rule.label, amount=rule.amount))
                index += 1
        pending[budget.id].sort(key=lambda item:(item['date'],str(item['recurrence_id'])))
    return pending


def amounts(amount, spent, upcoming):
    committed = spent + upcoming
    return dict(spent=spent, upcoming=upcoming, committed=committed, remaining=amount-committed)
