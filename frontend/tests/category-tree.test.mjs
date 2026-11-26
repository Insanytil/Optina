import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/categories/tree.ts', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const {
  indexCategories,
  visibleCategories,
  dropPlacement,
  canMoveCategory,
  applyCategoryMove,
  searchTree,
  ancestorNames,
  ancestorIds,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)
const item = (id, parent_id = null, position = 0) => ({
  id,
  name: id,
  parent_id,
  position,
})
const categories = [
  item('a'),
  item('b', null, 1),
  item('c', null, 2),
  item('a1', 'a'),
  item('a2', 'a', 1),
  item('a11', 'a1'),
]

test('folded branches hide descendants and preserve sibling ordering', () => {
  const index = indexCategories(categories)
  assert.deepEqual(
    visibleCategories(index, new Set()).map((row) => row.category.id),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(
    visibleCategories(index, new Set(['a'])).map((row) => [
      row.category.id,
      row.depth,
    ]),
    [
      ['a', 0],
      ['a1', 1],
      ['a2', 1],
      ['b', 0],
      ['c', 0],
    ],
  )
  assert.deepEqual(
    visibleCategories(index, new Set(['a', 'a1']), 'a').map(
      (row) => row.category.id,
    ),
    ['a', 'b', 'c'],
  )
})

test('deep hierarchies are flattened iteratively without call stack limits', () => {
  const items = Array.from({ length: 2000 }, (_, n) =>
    item(String(n), n ? String(n - 1) : null),
  )
  const rows = visibleCategories(
    indexCategories(items),
    new Set(items.map((entry) => entry.id)),
  )
  assert.equal(rows.length, 2000)
  assert.equal(rows.at(-1).depth, 1999)
})

test('self and descendant destinations are refused', () => {
  const index = indexCategories(categories)
  assert.equal(canMoveCategory(index, 'a', 'a'), false)
  assert.equal(canMoveCategory(index, 'a', 'a11'), false)
  assert.equal(canMoveCategory(index, 'a', 'missing'), false)
  assert.equal(dropPlacement(index, 'a', 'a', 'before'), null)
  assert.equal(dropPlacement(index, 'a', 'a11', 'inside'), null)
  assert.equal(dropPlacement(index, 'a', 'a1', 'after'), null)
})

test('inside, before, after and root drops compute exact server placements', () => {
  const index = indexCategories(categories)
  assert.deepEqual(dropPlacement(index, 'c', 'a', 'inside'), {
    parent_id: 'a',
    before_id: null,
  })
  assert.deepEqual(dropPlacement(index, 'c', 'b', 'before'), {
    parent_id: null,
    before_id: 'b',
  })
  assert.deepEqual(dropPlacement(index, 'a', 'b', 'after'), {
    parent_id: null,
    before_id: 'c',
  })
  assert.deepEqual(dropPlacement(index, 'a1', null, 'inside'), {
    parent_id: null,
    before_id: null,
  })
})

test('moving downward skips the dragged category in target siblings', () => {
  const index = indexCategories(categories)
  assert.deepEqual(dropPlacement(index, 'b', 'a', 'after'), {
    parent_id: null,
    before_id: 'c',
  })
})

test('optimistic moves preserve the whole subtree and do not mutate cached input', () => {
  const snapshot = structuredClone(categories)
  const moved = applyCategoryMove(categories, 'a1', {
    parent_id: 'b',
    before_id: null,
  })
  assert.equal(moved.find((entry) => entry.id === 'a1').parent_id, 'b')
  assert.equal(moved.find((entry) => entry.id === 'a11').parent_id, 'a1')
  assert.deepEqual(categories, snapshot)
  assert.deepEqual(
    visibleCategories(indexCategories(moved), new Set(['b', 'a1'])).map(
      (row) => row.category.id,
    ),
    ['a', 'b', 'a1', 'a11', 'c'],
  )
})

test('reordering siblings persists positions in the optimistic snapshot', () => {
  const moved = applyCategoryMove(categories, 'c', {
    parent_id: null,
    before_id: 'a',
  })
  assert.deepEqual(
    visibleCategories(indexCategories(moved), new Set()).map(
      (row) => row.category.id,
    ),
    ['c', 'a', 'b'],
  )
})

test('invalid placements leave the original cache intact', () => {
  assert.equal(
    applyCategoryMove(categories, 'a', { parent_id: 'a11', before_id: null }),
    categories,
  )
  assert.equal(
    applyCategoryMove(categories, 'c', { parent_id: null, before_id: 'a1' }),
    categories,
  )
})

const usageSource = await readFile(
  new URL('../src/features/categories/category-usage.ts', import.meta.url),
  'utf8',
)
const { deletionBlocker, descendantUsage } = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(usageSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString('base64')}`
)

test('search keeps matches with their ancestors, ignoring case and accents', () => {
  const index = indexCategories([
    { ...item('food'), name: 'Alimentation' },
    { ...item('groceries', 'food'), name: 'Courses' },
    { ...item('home'), name: 'Logement' },
    { ...item('power', 'home'), name: 'Électricité' },
  ])
  assert.equal(searchTree(index, '  '), null)
  const result = searchTree(index, 'electri')
  assert.deepEqual([...result.shown].sort(), ['home', 'power'])
  assert.deepEqual([...result.open], ['home'])
})

test('ancestor helpers walk from the root and survive cycles', () => {
  const index = indexCategories([item('a'), item('b', 'a'), item('c', 'b')])
  assert.deepEqual(ancestorNames(index, 'c'), ['a', 'b'])
  assert.deepEqual(ancestorIds(index, 'c'), ['b', 'a'])
  const cyclic = indexCategories([item('x', 'y'), item('y', 'x')])
  assert.deepEqual(ancestorIds(cyclic, 'x'), ['y', 'x'])
})

test('deletion is blocked by children first, then by any usage', () => {
  const none = { transactions: 0, recurrences: 0, budgets: 0 }
  assert.equal(deletionBlocker(none, 0), null)
  assert.match(deletionBlocker(none, 2), /2 sous-catégories/)
  assert.match(
    deletionBlocker({ ...none, transactions: 1 }, 0),
    /1 transaction l’utilise/,
  )
  assert.match(deletionBlocker({ ...none, recurrences: 3 }, 0), /3 récurrences/)
  assert.match(deletionBlocker({ ...none, budgets: 1 }, 0), /1 budget/)
})

test('descendant usage adds sub-category counts to every ancestor, not to itself', () => {
  const parents = new Map([
    ['root', null],
    ['mid', 'root'],
    ['leaf', 'mid'],
    ['loop', 'loop'],
  ])
  const usage = new Map([
    [
      'root',
      { category_id: 'root', transactions: 5, recurrences: 0, budgets: 0 },
    ],
    [
      'mid',
      { category_id: 'mid', transactions: 1, recurrences: 0, budgets: 0 },
    ],
    [
      'leaf',
      { category_id: 'leaf', transactions: 2, recurrences: 1, budgets: 0 },
    ],
    [
      'loop',
      { category_id: 'loop', transactions: 9, recurrences: 0, budgets: 0 },
    ],
  ])
  const totals = descendantUsage(parents, usage)
  assert.deepEqual(totals.get('root'), { transactions: 3, recurrences: 1 })
  assert.deepEqual(totals.get('mid'), { transactions: 2, recurrences: 1 })
  assert.equal(totals.get('leaf'), undefined)
  assert.equal(totals.get('loop'), undefined)
})
