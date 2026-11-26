import type { CategoryUsage } from './api'

export const NO_USAGE: Omit<CategoryUsage, 'category_id'> = {
  transactions: 0,
  recurrences: 0,
  budgets: 0,
}

export function usageById(items: CategoryUsage[]) {
  return new Map(items.map((item) => [item.category_id, item]))
}

const count = (value: number, singular: string, plural: string) =>
  `${value} ${value > 1 ? plural : singular}`

/** Why a category cannot be deleted yet, or null when it can. */
export function deletionBlocker(
  usage: Omit<CategoryUsage, 'category_id'>,
  childCount: number,
): string | null {
  if (childCount > 0)
    return `Elle contient ${count(childCount, 'sous-catégorie', 'sous-catégories')} : déplacez-les ou supprimez-les d’abord.`
  if (usage.transactions > 0)
    return `${count(usage.transactions, 'transaction l’utilise', 'transactions l’utilisent')}.`
  if (usage.recurrences > 0)
    return `${count(usage.recurrences, 'récurrence l’utilise', 'récurrences l’utilisent')} : supprimez-la ou changez sa catégorie.`
  if (usage.budgets > 0)
    return `${count(usage.budgets, 'budget l’utilise', 'budgets l’utilisent')}.`
  return null
}
