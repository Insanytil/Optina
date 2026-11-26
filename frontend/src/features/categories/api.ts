import { api } from '@/lib/api'

export interface Category {
  wallet_ids?: string[] | null
  id: string
  position: number
  name: string
  parent_id: string | null
  created_at: string
  updated_at: string
}

export const categoryKeys = {
  all: ['categories'] as const,
  tree: ['categories', 'tree'] as const,
  usage: ['categories', 'usage'] as const,
}

export function saveCategory(
  values: {
    name: string
    parent_id: string | null
    wallet_ids?: string[] | null
  },
  id?: string,
) {
  return api<Category>(id ? `/categories/${id}` : '/categories', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(values),
  })
}

export function deleteCategory(id: string) {
  return api<void>(`/categories/${id}`, { method: 'DELETE' })
}

export interface CategoryPlacement {
  parent_id: string | null
  before_id: string | null
}

export function loadCategoryTree(signal?: AbortSignal) {
  return api<Category[]>('/categories/tree', { signal })
}

export function moveCategory(id: string, placement: CategoryPlacement) {
  return api<Category>(`/categories/${id}/move`, {
    method: 'POST',
    body: JSON.stringify(placement),
  })
}

export interface CategorySearchScope {
  walletId?: string
  excludeId?: string
  parentId?: string
  rootOnly?: boolean
}

export function searchCategories(
  query: string,
  signal?: AbortSignal,
  scope: CategorySearchScope = {},
) {
  const params = new URLSearchParams({ q: query, limit: '25' })
  if (scope.walletId) params.set('wallet_id', scope.walletId)
  if (scope.excludeId) params.set('exclude_id', scope.excludeId)
  if (scope.parentId) params.set('parent_id', scope.parentId)
  if (scope.rootOnly) params.set('root_only', 'true')
  return api<Category[]>(`/categories/search?${params}`, { signal })
}

/** What still references a category; anything non-zero blocks deletion. */
export interface CategoryUsage {
  category_id: string
  transactions: number
  recurrences: number
  budgets: number
}

export function loadCategoryUsage(signal?: AbortSignal) {
  return api<CategoryUsage[]>('/categories/usage', { signal })
}
