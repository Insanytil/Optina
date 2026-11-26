/** Pure helpers for the wallet page (no React, no fetch). */

export interface BalancePoint {
  date: string
  balance: string
}
export interface Movement {
  date: string
  type: 'income' | 'expense'
  amount: string
}
export interface CurvePoint {
  date: string
  real: number | null
  projected: number | null
}

export function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const signed = (m: Movement) =>
  m.type === 'income' ? Number(m.amount) : -Number(m.amount)

/** Sum of the movements dated in [from, to], incomes positive. */
export function netBetween(movements: Movement[], from: string, to: string) {
  return movements
    .filter((m) => m.date >= from && m.date <= to)
    .reduce((total, m) => total + signed(m), 0)
}

export function incomeBetween(movements: Movement[], from: string, to: string) {
  return movements
    .filter((m) => m.type === 'income' && m.date >= from && m.date <= to)
    .reduce((total, m) => total + Number(m.amount), 0)
}

/**
 * Real balance for each day of `history` (the first point is the opening, the
 * day before the period, and is left out), then the balance projected from
 * the last real day to `end` with the upcoming movements.
 */
export function balanceCurve(
  history: BalancePoint[],
  upcoming: Movement[],
  end: string,
): CurvePoint[] {
  const points: CurvePoint[] = history
    .slice(1)
    .map((p) => ({ date: p.date, real: Number(p.balance), projected: null }))
  const last = history.at(-1)
  if (!last || last.date >= end) return points
  let balance = Number(last.balance)
  const today = points.at(-1)
  // Joins the two lines; movements due today are not in the balance yet.
  balance += netBetween(upcoming, last.date, last.date)
  if (today) today.projected = balance
  for (let day = addDays(last.date, 1); day <= end; day = addDays(day, 1)) {
    balance += netBetween(upcoming, day, day)
    points.push({ date: day, real: null, projected: balance })
  }
  return points
}

/** Last value of the curve, real or projected. */
export function endBalance(curve: CurvePoint[]) {
  const last = curve.at(-1)
  return last ? (last.projected ?? last.real) : null
}

/** Relative change, null without a meaningful base. */
export function change(current: number, previous: number) {
  if (!previous) return null
  return (current - previous) / Math.abs(previous)
}

export function changeLabel(ratio: number | null, month: string) {
  if (ratio === null) return null
  const pct = Math.round(ratio * 100)
  if (pct === 0) return `= ${month}`
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} % vs ${month}`
}

/** Last day with a real (not projected) balance. */
export function lastReal(curve: CurvePoint[]) {
  for (let i = curve.length - 1; i >= 0; i--)
    if (curve[i].real !== null) return curve[i]
  return undefined
}
