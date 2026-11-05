import type { Category } from '@/features/categories/api'
import { indexCategories, visibleCategories } from '@/features/categories/tree'

export function categoryAvailable(
  categories: Category[],
  id: string,
  walletId: string,
) {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const seen = new Set<string>()
  let current: string | null = id
  while (current !== null) {
    const category: Category | undefined = byId.get(current)
    if (!category || seen.has(current)) return false
    seen.add(current)
    if (category.wallet_ids != null && !category.wallet_ids.includes(walletId))
      return false
    current = category.parent_id
  }
  return true
}

export function categoryOptions(categories: Category[], walletId?: string) {
  const index = indexCategories(categories)
  const allowed = new Map<string, boolean>()
  return visibleCategories(index, new Set(categories.map((item) => item.id)))
    .filter(({ category }) => {
      const canUse =
        !walletId ||
        ((category.parent_id === null ||
          allowed.get(category.parent_id) === true) &&
          (category.wallet_ids == null ||
            category.wallet_ids.includes(walletId)))
      allowed.set(category.id, canUse)
      return canUse
    })
    .map(({ category, depth }) => ({
      id: category.id,
      label: `${'— '.repeat(Math.min(depth, 12))}${category.name}`,
    }))
}
