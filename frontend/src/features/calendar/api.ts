import { api } from '@/lib/api'
import type { CalendarOccurrence } from './calendar-model'

export interface UpcomingResponse {
  date_from: string
  date_to: string
  occurrences: Required<CalendarOccurrence>[]
}

export const upcomingKey = (from: string, to: string) =>
  ['recurrences', 'upcoming', from, to] as const

export const loadUpcoming = (from: string, to: string, signal?: AbortSignal) =>
  api<UpcomingResponse>(`/recurrences/upcoming?from=${from}&to=${to}`, {
    signal,
  })
