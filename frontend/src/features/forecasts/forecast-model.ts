/**
 * Pure forecast view model: turns the API response into everything the
 * forecast screen renders. No React, no formatting, amounts in cents.
 */
import type { Forecast } from '../recurrences/api'

export type ForecastOccurrence = Forecast['occurrences'][number]

export interface BalancePoint {
  date: string
  balance: number
}

export interface DatedAmount {
  amount: number
  date: string
}

export interface ForecastSummary {
  current: number
  final: number
  change: number
  net: number
  minimum: DatedAmount
  occurrenceCount: number
}

export interface ForecastMonth {
  month: string
  income: number
  expenses: number
  net: number
  closing: number
  minimum: DatedAmount
  occurrences: ForecastOccurrence[]
}

export interface ForecastView {
  summary: ForecastSummary
  balance: BalancePoint[]
  /** Occurrences per date, for the chart's movement dots and tooltip. */
  movements: Map<string, ForecastOccurrence[]>
  months: ForecastMonth[]
}

export const FORECAST_HORIZONS = [1, 3, 6, 12] as const
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number]
export const DEFAULT_HORIZON: ForecastHorizon = 3

export function parseHorizon(value: unknown): ForecastHorizon | undefined {
  const number = Number(value)
  return FORECAST_HORIZONS.find((horizon) => horizon === number)
}

/** "-12.3" → -1230. Exact for decimal strings with up to two decimals. */
export function toCents(value: string): number {
  const negative = value.trim().startsWith('-')
  const [whole, fraction = ''] = value.trim().replace(/^[-+]/, '').split('.')
  const cents =
    Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0').slice(0, 2))
  return negative ? -cents : cents
}

export const signedCents = (occurrence: ForecastOccurrence) =>
  occurrence.type === 'income'
    ? toCents(occurrence.amount)
    : -toCents(occurrence.amount)

/** ISO date (YYYY-MM-DD) shifted by whole days, computed in UTC. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** End-of-day balance for every day of the period, starting from today. */
export function buildDailyBalance(
  current: number,
  occurrences: ForecastOccurrence[],
  from: string,
  to: string,
): BalancePoint[] {
  const movements = new Map<string, number>()
  for (const occurrence of occurrences)
    movements.set(
      occurrence.date,
      (movements.get(occurrence.date) ?? 0) + signedCents(occurrence),
    )

  const points: BalancePoint[] = []
  let balance = current
  for (let date = from; date <= to; date = addDays(date, 1)) {
    balance += movements.get(date) ?? 0
    points.push({ date, balance })
  }
  return points
}

/** Occurrences grouped by date, incomes first. */
export function movementsByDate(
  occurrences: ForecastOccurrence[],
): Map<string, ForecastOccurrence[]> {
  const byDate = new Map<string, ForecastOccurrence[]>()
  for (const occurrence of occurrences)
    byDate.set(occurrence.date, [
      ...(byDate.get(occurrence.date) ?? []),
      occurrence,
    ])
  for (const items of byDate.values())
    items.sort((a, b) => signedCents(b) - signedCents(a))
  return byDate
}

/** Earliest lowest point; the first point when the series is empty-safe. */
export function lowestPoint(points: BalancePoint[]): DatedAmount {
  let lowest = points[0]
  for (const point of points) if (point.balance < lowest.balance) lowest = point
  return { amount: lowest.balance, date: lowest.date }
}

export function buildForecastView(forecast: Forecast): ForecastView {
  const current = toCents(forecast.current_balance)
  const balance = buildDailyBalance(
    current,
    forecast.occurrences,
    forecast.date_from,
    forecast.date_to,
  )
  const months = forecast.months.map((month): ForecastMonth => ({
    month: month.month,
    income: toCents(month.income),
    expenses: toCents(month.expenses),
    net: toCents(month.net),
    closing: toCents(month.closing_balance),
    minimum: {
      amount: toCents(month.minimum_balance),
      date: month.minimum_date,
    },
    occurrences: forecast.occurrences.filter((occurrence) =>
      occurrence.date.startsWith(`${month.month}-`),
    ),
  }))
  const final = months.at(-1)?.closing ?? current
  return {
    balance,
    movements: movementsByDate(forecast.occurrences),
    months,
    summary: {
      current,
      final,
      change: final - current,
      net: months.reduce((total, month) => total + month.net, 0),
      minimum: lowestPoint(balance),
      occurrenceCount: forecast.occurrences.length,
    },
  }
}
