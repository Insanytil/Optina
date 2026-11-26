import { api } from '@/lib/api'
import type { TransactionPage } from '@/features/transactions/api'

export type Frequency = 'week' | 'month' | 'quarter' | 'year' | 'once'

export interface DatedAmount {
  effective_from: string
  amount: string
}

export interface BudgetValues {
  name: string
  category_id: string
  wallet_ids: string[]
  frequency: Frequency
  start_date: string
  end_date: string | null
  amounts: DatedAmount[]
  carry_over: boolean
  alert_threshold: number
}

export interface Budget extends BudgetValues {
  id: string
}

export interface BudgetPeriod {
  start: string
  end: string
  /** The period's own amount. */
  base: string
  /** Carried from the previous period (negative after overspending). */
  carry: string
  available: string
  /** Expenses minus refunds, never below zero. */
  spent: string
}

export interface BudgetOccurrence {
  recurrence_id: string
  date: string
  label: string
  amount: string
}

export interface BudgetStatus extends Budget {
  period: BudgetPeriod
  upcoming: string
  committed: string
  remaining: string
  occurrences: BudgetOccurrence[]
}

export interface BudgetStatusList {
  as_of: string
  month: string
  items: BudgetStatus[]
}

export interface BudgetHistory {
  as_of: string
  periods: BudgetPeriod[]
}

// Under 'wallets' so transaction and wallet changes refresh budgets too.
export const budgetKeys = {
  all: ['wallets', 'budgets'] as const,
  list: ['wallets', 'budgets', 'list'] as const,
  status: (month: string) => ['wallets', 'budgets', 'status', month] as const,
  history: (id: string, month: string) =>
    ['wallets', 'budgets', 'history', id, month] as const,
  transactions: (id: string, month: string, page: number) =>
    ['wallets', 'budgets', 'transactions', id, month, page] as const,
}

export const loadBudgets = (signal?: AbortSignal) =>
  api<Budget[]>('/budgets', { signal })
export const loadBudgetStatus = (month: string, signal?: AbortSignal) =>
  api<BudgetStatusList>(`/budgets/status?month=${month}`, { signal })
export const saveBudget = (values: BudgetValues, id?: string) =>
  api<Budget>(id ? `/budgets/${id}` : '/budgets', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(values),
  })
export const deleteBudget = (id: string) =>
  api<void>(`/budgets/${id}`, { method: 'DELETE' })
export const loadBudgetHistory = (
  id: string,
  month: string,
  signal?: AbortSignal,
) =>
  api<BudgetHistory>(`/budgets/${id}/history?month=${month}&count=12`, {
    signal,
  })
export const loadBudgetTransactions = (
  id: string,
  month: string,
  page: number,
  signal?: AbortSignal,
) =>
  api<TransactionPage>(
    `/budgets/${id}/transactions?month=${month}&page=${page}&page_size=20`,
    { signal },
  )
