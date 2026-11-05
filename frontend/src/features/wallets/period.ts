import { z } from 'zod'
import { localToday } from '@/features/transactions/form-values'

export interface WalletDateRange {
  date_from: string
  date_to: string
}
const rangeSchema = z
  .object({ date_from: z.iso.date(), date_to: z.iso.date() })
  .refine((range) => range.date_from <= range.date_to)

export function validPeriod(range: WalletDateRange) {
  return rangeSchema.safeParse(range).success
}

export function monthPeriod(month: string): WalletDateRange | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  const [year, number] = month.split('-').map(Number)
  if (year < 1000 || year > 9999 || number < 1 || number > 12) return null
  const lastDay = new Date(year, number, 0).getDate()
  return { date_from: `${month}-01`, date_to: `${month}-${lastDay}` }
}
export function currentMonthPeriod(): WalletDateRange {
  return monthPeriod(localToday().slice(0, 7))!
}
export function periodMonth(range: WalletDateRange) {
  const month = range.date_from.slice(0, 7)
  const full = monthPeriod(month)
  return full &&
    full.date_from === range.date_from &&
    full.date_to === range.date_to
    ? month
    : ''
}
export function shiftPeriodMonth(range: WalletDateRange, offset: number) {
  const base = validPeriod(range) ? range.date_from : localToday()
  const [year, month] = base.slice(0, 7).split('-').map(Number)
  const shifted = year * 12 + month - 1 + offset
  return monthPeriod(
    `${String(Math.floor(shifted / 12)).padStart(4, '0')}-${String((shifted % 12) + 1).padStart(2, '0')}`,
  )
}

export const periodPresets = [
  { id: '7d', label: '7 jours' },
  { id: '30d', label: '30 jours' },
  { id: 'month', label: 'Ce mois' },
  { id: '3m', label: '3 mois' },
  { id: '6m', label: '6 mois' },
  { id: '12m', label: '1 an' },
  { id: 'year', label: 'Cette année' },
] as const

export function presetPeriod(id: string, now = new Date()): WalletDateRange {
  const today = localToday(now)
  const month = monthPeriod(today.slice(0, 7))!
  if (id === '7d' || id === '30d') {
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (id === '7d' ? 6 : 29),
    )
    return { date_from: localToday(start), date_to: today }
  }
  if (id === 'year')
    return {
      date_from: `${now.getFullYear()}-01-01`,
      date_to: `${now.getFullYear()}-12-31`,
    }
  const count = id === '3m' ? 3 : id === '6m' ? 6 : id === '12m' ? 12 : 1
  return {
    date_from: shiftPeriodMonth(month, 1 - count)!.date_from,
    date_to: month.date_to,
  }
}
