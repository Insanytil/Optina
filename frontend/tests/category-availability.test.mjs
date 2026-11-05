import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const url = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
const tree = compile(
  await readFile(
    new URL('../src/features/categories/tree.ts', import.meta.url),
    'utf8',
  ),
)
const source = compile(
  await readFile(
    new URL(
      '../src/features/transactions/category-options.ts',
      import.meta.url,
    ),
    'utf8',
  ),
).replaceAll("'@/features/categories/tree'", JSON.stringify(url(tree)))
const { categoryAvailable, categoryOptions } = await import(url(source))

const categories = [
  {
    id: 'a',
    name: 'Parent',
    parent_id: null,
    position: 0,
    wallet_ids: ['one', 'two'],
  },
  {
    id: 'b',
    name: 'Enfant',
    parent_id: 'a',
    position: 0,
    wallet_ids: ['two', 'three'],
  },
  {
    id: 'c',
    name: 'Petit-enfant',
    parent_id: 'b',
    position: 0,
    wallet_ids: null,
  },
  { id: 'd', name: 'Libre', parent_id: null, position: 1, wallet_ids: null },
]

test('availability intersects all ancestors and accepts future wallets for unrestricted roots', () => {
  assert.equal(categoryAvailable(categories, 'c', 'two'), true)
  assert.equal(categoryAvailable(categories, 'c', 'one'), false)
  assert.equal(categoryAvailable(categories, 'c', 'three'), false)
  assert.equal(categoryAvailable(categories, 'd', 'future'), true)
})

test('options filter after building the full hierarchy and preserve indentation', () => {
  assert.deepEqual(
    categoryOptions(categories, 'one').map((c) => c.id),
    ['a', 'd'],
  )
  assert.deepEqual(
    categoryOptions(categories, 'two').map((c) => c.id),
    ['a', 'b', 'c', 'd'],
  )
  assert.match(
    categoryOptions(categories, 'two').find((c) => c.id === 'c').label,
    /— — /,
  )
})

test('empty restrictions and cycles fail closed', () => {
  assert.equal(
    categoryAvailable(
      [{ id: 'x', parent_id: null, wallet_ids: [] }],
      'x',
      'one',
    ),
    false,
  )
  assert.equal(
    categoryAvailable(
      [{ id: 'x', parent_id: 'x', wallet_ids: null }],
      'x',
      'one',
    ),
    false,
  )
  assert.equal(categoryAvailable(categories, 'missing', 'one'), false)
})
