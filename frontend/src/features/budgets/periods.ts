import type { Budget, PeriodType, Preset, ViewConfig } from './api'
export const periodLabels: Record<PeriodType, string> = {
  week: 'Hebdomadaire',
  month: 'Mensuel',
  quarter: 'Trimestriel',
  year: 'Annuel',
  custom: 'Personnalisé',
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const day = new Date(`${value}T12:00:00Z`)
  return (
    !Number.isNaN(day.getTime()) &&
    day.toISOString().slice(0, 10) === value &&
    Number(value.slice(0, 4)) >= 1900 &&
    Number(value.slice(0, 4)) <= 9998
  )
}
function iso(value: Date) {
  return value.toISOString().slice(0, 10)
}
export function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return iso(date)
}
export function calendarPeriod(type: PeriodType, anchor: string) {
  const year = Number(anchor.slice(0, 4)),
    month = Number(anchor.slice(5, 7))
  if (type === 'week') {
    const weekday = new Date(`${anchor}T12:00:00Z`).getUTCDay()
    const start = addDays(anchor, -((weekday + 6) % 7))
    return { date_from: start, date_to: addDays(start, 6) }
  }
  if (type === 'custom') return { date_from: anchor, date_to: anchor }
  const first =
    type === 'year'
      ? 1
      : type === 'quarter'
        ? Math.floor((month - 1) / 3) * 3 + 1
        : month
  const last = type === 'year' ? 12 : type === 'quarter' ? first + 2 : first
  return {
    date_from: `${year}-${String(first).padStart(2, '0')}-01`,
    date_to: iso(new Date(Date.UTC(year, last, 0, 12))),
  }
}
export function nextPeriod(
  budget: Pick<Budget, 'date_from' | 'date_to' | 'period_type'>,
) {
  const start = addDays(budget.date_to, 1)
  if (budget.period_type !== 'custom')
    return calendarPeriod(budget.period_type, start)
  const days = Math.round(
    (Date.parse(budget.date_to) - Date.parse(budget.date_from)) / 86400000,
  )
  return { date_from: start, date_to: addDays(start, days) }
}
export function defaultView(_preset?: Preset): ViewConfig {
  return {
    period_types: ['week', 'month', 'quarter', 'year', 'custom'],
    wallet_ids: [],
    category_ids: [],
    budget_ids: [],
    widgets: ['progress', 'trend', 'upcoming'],
    status: 'active',
  }
}
export function filterGoals(goals: Budget[], config: ViewConfig, asOf: string) {
  return goals.filter(
    (goal) =>
      config.period_types.includes(goal.period_type) &&
      (!config.wallet_ids.length ||
        goal.wallet_ids.some((id) => config.wallet_ids.includes(id))) &&
      (!config.category_ids.length ||
        config.category_ids.includes(goal.category_id)) &&
      (!config.budget_ids.length ||
        config.budget_ids.includes(goal.id) ||
        (!!goal.series_id && config.budget_ids.includes(goal.series_id))) &&
      (config.status === 'all' ||
        (goal.date_to < asOf
          ? 'ended'
          : goal.date_from > asOf
            ? 'upcoming'
            : 'active') === config.status),
  )
}
export function cumulativeActivity(goal: Budget, asOf: string) {
  const end = goal.date_to < asOf ? goal.date_to : asOf
  if (end < goal.date_from) return []
  const monthly = (Date.parse(end) - Date.parse(goal.date_from)) / 86400000 > 62
  const grouped = new Map<string, bigint>()
  for (const row of goal.activity) {
    if (row.date > end) continue
    const key = monthly ? row.date.slice(0, 7) : row.date
    const [whole, fraction = ''] = row.amount.split('.')
    grouped.set(
      key,
      (grouped.get(key) ?? 0n) +
        BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, '0')),
    )
  }
  const result: { date: string; amount: number; exact: string }[] = []
  let total = 0n,
    current = goal.date_from
  while (current <= end) {
    const key = monthly ? current.slice(0, 7) : current
    total += grouped.get(key) ?? 0n
    result.push({
      date: key,
      amount: Number(total) / 100,
      exact: `${total / 100n}.${String(total % 100n).padStart(2, '0')}`,
    })
    if (monthly) {
      const d = new Date(`${current.slice(0, 7)}-01T12:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() + 1)
      current = iso(d)
    } else current = addDays(current, 1)
  }
  return result
}
