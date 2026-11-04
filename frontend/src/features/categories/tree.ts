import type { Category, CategoryPlacement } from './api'

export interface CategoryIndex {
  byId: Map<string, Category>
  children: Map<string | null, Category[]>
}

export type DropZone = 'before' | 'inside' | 'after'

export function indexCategories(items: Category[]): CategoryIndex {
  const byId = new Map(items.map((item) => [item.id, item]))
  const children = new Map<string | null, Category[]>()
  for (const item of items) {
    const siblings = children.get(item.parent_id) ?? []
    siblings.push(item)
    children.set(item.parent_id, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  }
  return { byId, children }
}

export function visibleCategories(
  index: CategoryIndex,
  expanded: Set<string>,
  draggingId: string | null = null,
) {
  const stack = (index.children.get(null) ?? [])
    .slice()
    .reverse()
    .map((category) => ({ category, depth: 0 }))
  const rows: { category: Category; depth: number }[] = []
  const visited = new Set<string>()
  while (stack.length) {
    const row = stack.pop()!
    if (visited.has(row.category.id)) continue
    visited.add(row.category.id)
    rows.push(row)
    if (expanded.has(row.category.id) && row.category.id !== draggingId) {
      const children = index.children.get(row.category.id) ?? []
      for (let i = children.length - 1; i >= 0; i--)
        stack.push({ category: children[i], depth: row.depth + 1 })
    }
  }
  return rows
}

export function canMoveCategory(
  index: CategoryIndex,
  id: string,
  parentId: string | null,
) {
  if (!index.byId.has(id)) return false
  const seen = new Set<string>()
  while (parentId !== null) {
    if (parentId === id || seen.has(parentId)) return false
    seen.add(parentId)
    const parent = index.byId.get(parentId)
    if (!parent) return false
    parentId = parent.parent_id
  }
  return true
}

export function dropPlacement(
  index: CategoryIndex,
  activeId: string,
  targetId: string | null,
  zone: DropZone,
): CategoryPlacement | null {
  if (targetId === activeId) return null
  if (targetId === null)
    return canMoveCategory(index, activeId, null)
      ? { parent_id: null, before_id: null }
      : null
  const target = index.byId.get(targetId)
  if (!target) return null
  const parentId = zone === 'inside' ? targetId : target.parent_id
  if (!canMoveCategory(index, activeId, parentId)) return null
  if (zone === 'inside') return { parent_id: parentId, before_id: null }
  const siblings = (index.children.get(parentId) ?? []).filter(
    (item) => item.id !== activeId,
  )
  const position = siblings.findIndex((item) => item.id === targetId)
  return {
    parent_id: parentId,
    before_id:
      zone === 'before' ? targetId : (siblings[position + 1]?.id ?? null),
  }
}

export function applyCategoryMove(
  items: Category[],
  id: string,
  placement: CategoryPlacement,
): Category[] {
  const index = indexCategories(items)
  if (!canMoveCategory(index, id, placement.parent_id)) return items
  const siblings = (index.children.get(placement.parent_id) ?? [])
    .filter((item) => item.id !== id)
    .map((item) => item.id)
  if (placement.before_id !== null && !siblings.includes(placement.before_id))
    return items
  const position =
    placement.before_id === null
      ? siblings.length
      : siblings.indexOf(placement.before_id)
  siblings.splice(position, 0, id)
  const positions = new Map(
    siblings.map((identifier, order) => [identifier, order]),
  )
  return items.map((item) => {
    if (item.id === id)
      return { ...item, parent_id: placement.parent_id, position }
    const order = positions.get(item.id)
    return order === undefined ? item : { ...item, position: order }
  })
}
