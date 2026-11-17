import type { Category } from './api'

export function categoryPaths(categories: Category[]) {
  const index = new Map(categories.map((category) => [category.id, category]))
  const paths = new Map<string, string>()
  for (const category of categories) {
    const names: string[] = []
    const visited = new Set<string>()
    let current: Category | undefined = category
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      names.push(current.name)
      current = current.parent_id ? index.get(current.parent_id) : undefined
    }
    paths.set(category.id, names.reverse().join(' / '))
  }
  return paths
}
