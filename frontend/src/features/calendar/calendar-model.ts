/** Pure month-grid logic for the upcoming calendar (weeks start on Monday). */
import { addDays, signedCents } from '../forecasts/forecast-model'
import type { ForecastOccurrence } from '../forecasts/forecast-model'

export type CalendarOccurrence = ForecastOccurrence & {
  wallet_id?: string
  wallet_name?: string
}

export interface CalendarDay {
  date: string
  inMonth: boolean
  isPast: boolean
  occurrences: CalendarOccurrence[]
}

export type CalendarWeek = CalendarDay[]

export const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']

/** 0 = Monday … 6 = Sunday. */
const weekdayIndex = (date: string) =>
  (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

/** "2026-11" shifted by whole months. */
export function shiftMonth(month: string, offset: number): string {
  const [year, index] = month.split('-').map(Number)
  const total = year * 12 + index - 1 + offset
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** First and last date shown by the month grid, including spill-over days. */
export function gridRange(month: string): { from: string; to: string } {
  const first = `${month}-01`
  const from = addDays(first, -weekdayIndex(first))
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1)
  return { from, to: addDays(last, 6 - weekdayIndex(last)) }
}

export function buildCalendarMonth(
  month: string,
  occurrences: CalendarOccurrence[],
  today: string,
): CalendarWeek[] {
  const byDate = new Map<string, CalendarOccurrence[]>()
  for (const occurrence of occurrences)
    byDate.set(occurrence.date, [
      ...(byDate.get(occurrence.date) ?? []),
      occurrence,
    ])

  const { from, to } = gridRange(month)
  const weeks: CalendarWeek[] = []
  for (let date = from; date <= to;) {
    const week: CalendarWeek = []
    for (let day = 0; day < 7; day++, date = addDays(date, 1))
      week.push({
        date,
        inMonth: date.startsWith(`${month}-`),
        isPast: date < today,
        occurrences: byDate.get(date) ?? [],
      })
    weeks.push(week)
  }
  return weeks
}

/** Distinct mid-tone hues that read on light and dark backgrounds. */
export const WALLET_COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#64748b',
] as const

/** First palette color no wallet uses yet, else the least used one. */
export function nextWalletColor(used: string[]): string {
  const free = WALLET_COLORS.find((color) => !used.includes(color))
  if (free) return free
  const count = (color: string) => used.filter((item) => item === color).length
  return WALLET_COLORS.reduce((best, color) =>
    count(color) < count(best) ? color : best,
  )
}

export interface WalletOption {
  id: string
  name: string
  /** Stored color; older payloads may lack it. */
  color?: string
}

export interface LegendWallet extends WalletOption {
  color: string
  hidden: boolean
  /** Net of the displayed month's occurrences, in cents. */
  net: number
}

/** Each wallet's stored color, falling back to the palette by position. */
export function walletColors(wallets: WalletOption[]): Map<string, string> {
  return new Map(
    wallets.map((wallet, index) => [
      wallet.id,
      wallet.color ?? WALLET_COLORS[index % WALLET_COLORS.length],
    ]),
  )
}

export const filterByWallets = (
  occurrences: CalendarOccurrence[],
  hidden: readonly string[],
) =>
  hidden.length === 0
    ? occurrences
    : occurrences.filter(
        (occurrence) => !hidden.includes(occurrence.wallet_id ?? ''),
      )

export function buildLegend(
  wallets: WalletOption[],
  occurrences: CalendarOccurrence[],
  month: string,
  hidden: readonly string[],
): LegendWallet[] {
  const colors = walletColors(wallets)
  const nets = new Map<string, number>()
  for (const occurrence of occurrences)
    if (occurrence.wallet_id && occurrence.date.startsWith(`${month}-`))
      nets.set(
        occurrence.wallet_id,
        (nets.get(occurrence.wallet_id) ?? 0) + signedCents(occurrence),
      )
  return wallets.map((wallet) => ({
    ...wallet,
    color: colors.get(wallet.id) ?? WALLET_COLORS[0],
    hidden: hidden.includes(wallet.id),
    net: nets.get(wallet.id) ?? 0,
  }))
}

export const toggleWallet = (hidden: readonly string[], walletId: string) =>
  hidden.includes(walletId)
    ? hidden.filter((id) => id !== walletId)
    : [...hidden, walletId]

export interface DaySummary {
  incomes: CalendarOccurrence[]
  expenses: CalendarOccurrence[]
  income: number
  expense: number
  net: number
}

const bySizeThenLabel = (a: CalendarOccurrence, b: CalendarOccurrence) =>
  Math.abs(signedCents(b)) - Math.abs(signedCents(a)) ||
  a.label.localeCompare(b.label, 'fr')

/** Day split into incomes and expenses, largest first, with totals in cents. */
export function summarizeDay(occurrences: CalendarOccurrence[]): DaySummary {
  const incomes = occurrences
    .filter((occurrence) => occurrence.type === 'income')
    .sort(bySizeThenLabel)
  const expenses = occurrences
    .filter((occurrence) => occurrence.type === 'expense')
    .sort(bySizeThenLabel)
  const total = (items: CalendarOccurrence[]) =>
    items.reduce(
      (sum, occurrence) => sum + Math.abs(signedCents(occurrence)),
      0,
    )
  const income = total(incomes)
  const expense = total(expenses)
  return { incomes, expenses, income, expense, net: income - expense }
}
