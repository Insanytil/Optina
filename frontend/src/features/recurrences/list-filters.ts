import { categoryPaths } from '@/features/categories/category-paths'
import type { Category } from '@/features/categories/api'
import type { Recurrence } from './api'

export { categoryPaths } from '@/features/categories/category-paths'

export interface RecurrenceFilters {
  search: string
  type: 'all' | 'income' | 'expense'
  status: 'all' | 'active' | 'paused' | 'ended'
  categoryId: string
  sort: 'date' | 'category' | 'amount-desc' | 'amount-asc' | 'label'
}
export const defaultRecurrenceFilters: RecurrenceFilters = {
  search: '',
  type: 'all',
  status: 'all',
  categoryId: '',
  sort: 'date',
}
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
const compareText = (a: string, b: string) =>
  a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true })

export function recurrenceStatus(rule: Recurrence) {
  return !rule.next_date ? 'ended' : rule.is_active ? 'active' : 'paused'
}

export function filterRecurrences(
  rules: Recurrence[],
  categories: Category[],
  filters: RecurrenceFilters,
) {
  const index = new Map(categories.map((category) => [category.id, category]))
  const paths = categoryPaths(categories)
  const search = normalize(filters.search.trim())
  function matchesCategory(id: string) {
    if (!filters.categoryId) return true
    const visited = new Set<string>()
    let current: string | null = id
    while (current && !visited.has(current)) {
      if (current === filters.categoryId) return true
      visited.add(current)
      current = index.get(current)?.parent_id ?? null
    }
    return false
  }
  const result = rules.filter(
    (rule) =>
      (filters.type === 'all' || rule.type === filters.type) &&
      (filters.status === 'all' || recurrenceStatus(rule) === filters.status) &&
      matchesCategory(rule.category_id) &&
      (!search ||
        normalize(
          `${rule.label} ${paths.get(rule.category_id) ?? ''}`,
        ).includes(search)),
  )
  const cents = (amount: string) => {
    const [whole, fraction = ''] = amount.split('.')
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  }
  return result.sort((a, b) => {
    let comparison = 0
    if (filters.sort === 'category')
      comparison = compareText(
        paths.get(a.category_id) ?? '',
        paths.get(b.category_id) ?? '',
      )
    if (filters.sort === 'date') {
      const rank = { active: 0, paused: 1, ended: 2 }
      comparison =
        rank[recurrenceStatus(a)] - rank[recurrenceStatus(b)] ||
        compareText(a.next_date ?? '9999', b.next_date ?? '9999')
    }
    if (filters.sort.startsWith('amount')) {
      const left = cents(a.amount),
        right = cents(b.amount)
      comparison = left < right ? -1 : left > right ? 1 : 0
      if (filters.sort === 'amount-desc') comparison *= -1
    }
    return (
      comparison || compareText(a.label, b.label) || compareText(a.id, b.id)
    )
  })
}
