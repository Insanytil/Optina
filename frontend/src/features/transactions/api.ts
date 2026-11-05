import { api } from '@/lib/api'
import type { Wallet, WalletPage } from '@/features/wallets/api'

export type TransactionType = 'expense' | 'income'
export interface Transaction {
  recurrence_id?: string | null
  id: string
  wallet_id: string
  category_id: string | null
  type: TransactionType
  kind: 'standard' | 'opening_balance'
  amount: string
  date: string
  label: string
  note: string | null
  created_at: string
  updated_at: string
}
export interface TransactionValues {
  wallet_id: string
  category_id: string | null
  type: TransactionType
  amount: string
  date: string
  label: string
  note: string | null
}
export interface TransactionFilters {
  wallet_id: string
  category_id: string
  type: string
  kind: string
  date_from: string
  date_to: string
  include_subcategories: boolean
}
export interface TransactionPage {
  items: Transaction[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}
export const transactionKeys = {
  all: ['transactions'] as const,
  page: (page: number, filters: TransactionFilters) =>
    ['transactions', page, filters] as const,
}
export const walletOptionsKey = ['wallets', 'options'] as const

export function listTransactions(
  page: number,
  filters: TransactionFilters,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ page: String(page), page_size: '20' })
  for (const [key, value] of Object.entries(filters))
    if (value !== '') query.set(key, String(value))
  return api<TransactionPage>(`/transactions?${query}`, { signal })
}
export function saveTransaction(values: TransactionValues, id?: string) {
  return api<Transaction>(id ? `/transactions/${id}` : '/transactions', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(values),
  })
}
export function deleteTransaction(id: string) {
  return api<void>(`/transactions/${id}`, { method: 'DELETE' })
}
export async function loadWalletOptions(
  signal?: AbortSignal,
): Promise<Wallet[]> {
  const items: Wallet[] = []
  let page = 1
  while (true) {
    const result = await api<WalletPage>(
      `/wallets?page=${page}&page_size=100`,
      { signal },
    )
    items.push(...result.items)
    if (page >= result.pagination.total_pages) return items
    page++
  }
}
