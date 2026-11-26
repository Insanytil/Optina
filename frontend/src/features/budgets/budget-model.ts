/** Pure budget helpers shared by the settings, tracking and home screens. */

export type Frequency = 'week' | 'month' | 'quarter' | 'year' | 'once'
export type Level = 'ok' | 'watch' | 'over'

export const frequencyLabels: Record<Frequency, string> = {
  week: 'Chaque semaine',
  month: 'Chaque mois',
  quarter: 'Chaque trimestre',
  year: 'Chaque année',
  once: 'Une fois',
}

interface Amounts {
  amounts: { effective_from: string; amount: string }[]
}

interface Tracked {
  alert_threshold: number
  committed: string
  period: { available: string }
}

/** The amount in force on `day` (dates are ISO strings, so they compare as text). */
export function amountOn(budget: Amounts, day: string) {
  let current = budget.amounts[0]?.amount ?? '0'
  for (const row of budget.amounts)
    if (row.effective_from <= day) current = row.amount
  return current
}

/** Amount changes after `day`, to show what is planned. */
export function futureAmounts(budget: Amounts, day: string) {
  // The first amount is the budget's own start, not a change.
  return budget.amounts.slice(1).filter((row) => row.effective_from > day)
}

/** Share of the available amount already spent or still planned (1 = 100 %). */
export function usage(item: Tracked) {
  const available = Number(item.period.available)
  const committed = Number(item.committed)
  if (available <= 0) return committed > 0 ? Infinity : 0
  return committed / available
}

export function level(item: Tracked): Level {
  const ratio = usage(item)
  if (ratio > 1) return 'over'
  return ratio * 100 >= item.alert_threshold ? 'watch' : 'ok'
}

const levelRank: Record<Level, number> = { over: 0, watch: 1, ok: 2 }

/** Overspent first, then by share used, then by name. */
export function byAttention<T extends Tracked & { name: string }>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      levelRank[level(a)] - levelRank[level(b)] ||
      usage(b) - usage(a) ||
      a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
  )
}

/** Budgets needing attention: at or past their alert threshold. */
export function toWatch<T extends Tracked & { name: string }>(items: T[]) {
  return byAttention(items.filter((item) => level(item) !== 'ok'))
}

const pad = (value: number) => String(value).padStart(2, '0')
const iso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** First day of the month containing an ISO date. */
export const monthOf = (day: string) => `${day.slice(0, 7)}-01`

export function addMonths(month: string, count: number) {
  const [year, value] = month.split('-').map(Number)
  return iso(new Date(year, value - 1 + count, 1))
}

export function todayIso() {
  return iso(new Date())
}

const parse = (day: string) => new Date(`${day}T12:00:00`)

export function monthLabel(month: string) {
  return parse(month).toLocaleDateString('fr-BE', {
    month: 'long',
    year: 'numeric',
  })
}

export function shortDate(day: string) {
  return parse(day).toLocaleDateString('fr-BE', {
    day: 'numeric',
    month: 'short',
  })
}

/** A readable name for a budget period. */
export function periodLabel(frequency: Frequency, start: string, end: string) {
  const first = parse(start)
  if (frequency === 'month') return monthLabel(start)
  if (frequency === 'year') return String(first.getFullYear())
  if (frequency === 'quarter')
    return `T${Math.floor(first.getMonth() / 3) + 1} ${first.getFullYear()}`
  return `${shortDate(start)} – ${parse(end).toLocaleDateString('fr-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`
}

/** Short period label for a history chart axis. */
export function periodTick(frequency: Frequency, start: string) {
  const first = parse(start)
  if (frequency === 'month')
    return first.toLocaleDateString('fr-BE', { month: 'short' })
  if (frequency === 'year') return String(first.getFullYear())
  if (frequency === 'quarter') return `T${Math.floor(first.getMonth() / 3) + 1}`
  return shortDate(start)
}

/** A decimal amount typed with a comma or a dot, at most 2 decimals, above 0. */
export function validAmount(value: string) {
  const normalized = value.trim().replace(',', '.')
  return /^\d+(\.\d{1,2})?$/.test(normalized) && Number(normalized) > 0
}

export const normalizeAmount = (value: string) => value.trim().replace(',', '.')
