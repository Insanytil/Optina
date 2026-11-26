/** Stable colors: one per top-level category, lighter shades for its children. */

export const PALETTE = [
  '#10b981',
  '#38bdf8',
  '#a78bfa',
  '#fbbf24',
  '#fb7185',
  '#2dd4bf',
  '#f97316',
  '#818cf8',
  '#a3e635',
  '#f472b6',
]

export function rootColor(index: number) {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]
}

/** Mixes `hex` with white: step 0 is the color itself, later steps get lighter. */
export function shade(hex: string, step: number, count: number) {
  if (count <= 1 || step <= 0) return hex
  const amount = (step / count) * 0.6
  const channel = (i: number) => {
    const value = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
    return Math.round(value + (255 - value) * amount)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(1)}${channel(2)}`
}

interface Node {
  id: string
  parent_id: string | null
  position: number
}

/** Color of each top-level category, by its place in the tree. */
export function rootColors(categories: Node[]) {
  const roots = categories
    .filter((category) => category.parent_id === null)
    .sort((a, b) => a.position - b.position)
  return new Map(roots.map((root, index) => [root.id, rootColor(index)]))
}

/** Share of the total, rounded; 0 when there is no total. */
export function percent(amount: number, total: number) {
  return total > 0 ? Math.round((amount / total) * 100) : 0
}

/** Change against the previous amount, null without a base. */
export function delta(amount: number, previous: number | undefined) {
  if (previous === undefined || previous === 0) return null
  return Math.round(((amount - previous) / previous) * 100)
}
