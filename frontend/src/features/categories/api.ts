import { api } from '@/lib/api'

export interface Category {
  id: string
  position: number
  name: string
  parent_id: string | null
  created_at: string
  updated_at: string
}

export interface CategoryPage {
  items: Category[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

export const categoryKeys = {
  all: ['categories'] as const,
  tree: ['categories', 'tree'] as const,
  list: (parentId: string | null, page: number) =>
    ['categories', 'list', parentId, page] as const,
  path: (id: string | null) => ['categories', 'path', id] as const,
}

export function listCategories(
  parentId: string | null,
  page: number,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ page: String(page), page_size: '20' })
  if (parentId) query.set('parent_id', parentId)
  return api<CategoryPage>(`/categories?${query}`, { signal })
}

export function categoryPath(id: string, signal?: AbortSignal) {
  return api<Category[]>(`/categories/${id}/path`, { signal })
}

export function saveCategory(
  values: { name: string; parent_id: string | null },
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
