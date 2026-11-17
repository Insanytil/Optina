import { api } from '@/lib/api'
import type { TransactionPage } from '@/features/transactions/api'
export type PeriodType = 'week' | 'month' | 'quarter' | 'year' | 'custom'
export type Preset = 'daily' | 'projects' | 'review'
export interface BudgetValues {
  repeats: boolean
  repeat_until: string | null
  name: string
  category_id: string
  date_from: string
  date_to: string
  period_type: PeriodType
  amount: string
  wallet_ids: string[]
}
export interface BudgetDefinition extends BudgetValues {
  series_id: string | null
  series_start: string | null
  is_override: boolean
  id: string
}
export interface Budget extends BudgetDefinition {
  spent: string
  upcoming: string
  committed: string
  remaining: string
  activity: { date: string; amount: string }[]
  occurrences: {
    recurrence_id: string
    date: string
    label: string
    amount: string
  }[]
}
export interface BudgetCollection {
  as_of: string
  items: Budget[]
}
export interface ViewConfig {
  period_types: PeriodType[]
  wallet_ids: string[]
  category_ids: string[]
  budget_ids: string[]
  widgets: ('progress' | 'trend' | 'upcoming')[]
  status: 'all' | 'active' | 'upcoming' | 'ended'
}
export interface ViewValues {
  name: string
  preset: Preset
  config: ViewConfig
  is_default: boolean
}
export interface SavedView extends ViewValues {
  id: string
}
export const budgetKeys = {
  all: ['wallets', 'budgets'] as const,
  list: (from: string, to: string) =>
    ['wallets', 'budgets', 'list', from, to] as const,
  views: ['wallets', 'budgets', 'views'] as const,
  transactions: (id: string, page: number) =>
    ['wallets', 'budgets', 'transactions', id, page] as const,
}
export const loadBudgets = (from: string, to: string, signal?: AbortSignal) =>
  api<BudgetCollection>(`/budgets?date_from=${from}&date_to=${to}`, { signal })
export const saveBudget = (
  values: BudgetValues,
  id?: string,
  scope: 'period' | 'following' = 'period',
) =>
  api<BudgetDefinition>(id ? `/budgets/${id}?scope=${scope}` : '/budgets', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(values),
  })
export const deleteBudget = (id: string) =>
  api<void>(`/budgets/${id}`, { method: 'DELETE' })
export const loadBudgetTransactions = (
  id: string,
  page: number,
  signal?: AbortSignal,
) =>
  api<TransactionPage>(
    `/budgets/${id}/transactions?page=${page}&page_size=20`,
    { signal },
  )
export const loadViews = (signal?: AbortSignal) =>
  api<SavedView[]>('/budgets/views', { signal })
export const saveView = (values: ViewValues, id?: string) =>
  api<SavedView>(id ? `/budgets/views/${id}` : '/budgets/views', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(values),
  })
export const deleteView = (id: string) =>
  api<void>(`/budgets/views/${id}`, { method: 'DELETE' })

export interface BudgetDefinitionPage {
  items: BudgetDefinition[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}
export const loadBudgetDefinitions = (page: number, signal?: AbortSignal) =>
  api<BudgetDefinitionPage>(`/budgets/definitions?page=${page}&page_size=20`, {
    signal,
  })
export const loadBudgetDefinition = (id: string, signal?: AbortSignal) =>
  api<BudgetDefinition>(`/budgets/${id}`, { signal })

export const loadBudgetHistory = (id: string, signal?: AbortSignal) =>
  api<BudgetCollection>(`/budgets/${id}/history?count=12`, { signal })
