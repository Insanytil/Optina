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
  page: (page: number) => ['wallets', page] as const,
}

export function listWallets(page: number, signal?: AbortSignal) {
  return api<WalletPage>(`/wallets?page=${page}&page_size=20`, { signal })
}

export function saveWallet(
  values: { name: string; balance?: string },
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
