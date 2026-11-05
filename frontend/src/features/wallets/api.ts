import { api } from '@/lib/api'

export interface Wallet {
  id: string
  name: string
  balance: string
  created_at: string
  updated_at: string
}

export interface WalletPage {
  items: Wallet[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

export const walletKeys = {
  all: ['wallets'] as const,
  categoryBreakdown: (
    id: string,
    from: string,
    to: string,
    categoryId: string | null,
  ) => ['wallets', 'category-breakdown', id, from, to, categoryId] as const,
  analytics: (id: string, from: string, to: string) =>
    ['wallets', 'analytics', id, from, to] as const,
  summary: (id: string, dateFrom: string, dateTo: string) =>
    ['wallets', 'summary', id, dateFrom, dateTo] as const,
  page: (page: number) => ['wallets', page] as const,
}

export function listWallets(page: number, signal?: AbortSignal) {
  return api<WalletPage>(`/wallets?page=${page}&page_size=20`, { signal })
}

export function saveWallet(
  values: { name: string; balance?: string; opening_date?: string },
  id?: string,
) {
  return api<Wallet>(id ? `/wallets/${id}` : '/wallets', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(values),
  })
}

export function formatBalance(value: string) {
  const [whole, fraction = ''] = value.split('.')
  const sign = value.startsWith('-') ? '−' : ''
  return `${sign}${BigInt(whole.replace('-', '')).toLocaleString('fr-BE')},${fraction.padEnd(2, '0')}`
}

export function deleteWallet(id: string) {
  return api<void>(`/wallets/${id}`, { method: 'DELETE' })
}

export interface WalletSummary {
  wallet: Wallet
  date_from: string
  date_to: string
  income: string
  expenses: string
  net: string
}

export function loadWalletSummary(
  id: string,
  dateFrom: string,
  dateTo: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
  return api<WalletSummary>(`/wallets/${id}/summary?${query}`, { signal })
}

export interface WalletAnalytics {
  expense_granularity: 'day' | 'week' | 'month' | 'year'
  expenses_by_date: { date: string; amount: string }[]
  expenses_by_category: {
    category_id: string | null
    name: string
    amount: string
  }[]
  monthly: { month: string; income: string; expenses: string }[]
  top_expenses: {
    id: string
    label: string
    category_name: string
    date: string
    amount: string
  }[]
  activity: { date: string; count: number }[]
  activity_from: string
  activity_to: string
}

export function loadWalletAnalytics(
  id: string,
  dateFrom: string,
  dateTo: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
  return api<WalletAnalytics>(`/wallets/${id}/analytics?${query}`, { signal })
}

export interface CategoryBreakdown {
  path: { id: string; name: string }[]
  items: { category_id: string | null; name: string; amount: string }[]
  direct_amount: string
  total: string
}

export function loadCategoryBreakdown(
  walletId: string,
  from: string,
  to: string,
  categoryId: string | null,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ date_from: from, date_to: to })
  if (categoryId) params.set('category_id', categoryId)
  return api<CategoryBreakdown>(
    `/wallets/${walletId}/category-breakdown?${params}`,
    { signal },
  )
}
