import { api } from '@/lib/api'

export interface RecurrenceValues {
  wallet_id: string
  category_id: string
  label: string
  type: 'income' | 'expense'
  amount: string
  note: string | null
  frequency_unit: 'week' | 'month' | 'year'
  interval: number
  start_date: string
  end_date: string | null
}
export interface Recurrence extends RecurrenceValues {
  id: string
  next_date: string | null
  is_active: boolean
  archived: boolean
}
export interface Forecast {
  date_from: string
  date_to: string
  current_balance: string
  minimum_balance: string
  months: {
    month: string
    income: string
    expenses: string
    net: string
    opening_balance: string
    closing_balance: string
    minimum_balance: string
    minimum_date: string
  }[]
  occurrences: {
    recurrence_id: string
    label: string
    type: 'income' | 'expense'
    amount: string
    date: string
    scheduled_date: string
  }[]
}
export const recurrenceKeys = { all: ['recurrences'] as const }
export const frequencies = [
  { label: 'Chaque semaine', unit: 'week', interval: 1 },
  { label: 'Toutes les 4 semaines', unit: 'week', interval: 4 },
  { label: 'Chaque mois', unit: 'month', interval: 1 },
  { label: 'Tous les 3 mois', unit: 'month', interval: 3 },
  { label: 'Tous les 6 mois', unit: 'month', interval: 6 },
  { label: 'Chaque année', unit: 'year', interval: 1 },
] as const
export function frequencyLabel(rule: RecurrenceValues) {
  return (
    frequencies.find(
      (f) => f.unit === rule.frequency_unit && f.interval === rule.interval,
    )?.label ??
    `Tous les ${rule.interval} ${rule.frequency_unit === 'week' ? 'semaines' : rule.frequency_unit === 'month' ? 'mois' : 'ans'}`
  )
}
export const listRecurrences = (walletId: string, signal?: AbortSignal) =>
  api<Recurrence[]>(`/recurrences?wallet_id=${walletId}`, { signal })
export const forecastRecurrences = (
  walletId: string,
  months: number,
  signal?: AbortSignal,
) =>
  api<Forecast>(
    `/recurrences/forecast?wallet_id=${walletId}&months=${months}`,
    { signal },
  )
export const saveRecurrence = (values: RecurrenceValues, id?: string) =>
  api<Recurrence>(id ? `/recurrences/${id}` : '/recurrences', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(values),
  })
export const changeRecurrenceStatus = (rule: Recurrence) =>
  api<Recurrence>(`/recurrences/${rule.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: !rule.is_active }),
  })
export const archiveRecurrence = (id: string) =>
  api<void>(`/recurrences/${id}`, { method: 'DELETE' })
