/** Display helpers for the forecast screen (fr-BE). */
const money = new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
})
const compactMoney = new Intl.NumberFormat('fr-BE', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const atNoon = (date: string) => new Date(`${date}T12:00:00`)

export const formatCents = (cents: number) => money.format(cents / 100)

/** Explicit + / − sign, for changes and nets. */
export const formatSignedCents = (cents: number) =>
  `${cents >= 0 ? '+' : '−'}${money.format(Math.abs(cents) / 100)}`

export const formatAxisCents = (cents: number) =>
  compactMoney.format(cents / 100)

export const formatDate = (date: string) =>
  new Intl.DateTimeFormat('fr-BE', { day: '2-digit', month: '2-digit' }).format(
    atNoon(date),
  )

export const formatDay = (date: string) => date.slice(8, 10)

export const formatMonth = (month: string) =>
  new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' }).format(
    atNoon(`${month}-01`),
  )

export const formatShortMonth = (month: string) =>
  new Intl.DateTimeFormat('fr-BE', { month: 'short' }).format(
    atNoon(`${month}-01`),
  )

export const amountTone = (cents: number) =>
  cents < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
