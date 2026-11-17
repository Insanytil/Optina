import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/recurrences/list-filters.ts', import.meta.url),
  'utf8',
)
let compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const pathsSource = await readFile(
  new URL('../src/features/categories/category-paths.ts', import.meta.url),
  'utf8',
)
const pathsCode = ts.transpileModule(pathsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText
compiled = compiled.replaceAll(
  "'@/features/categories/category-paths'",
  JSON.stringify(
    `data:text/javascript;base64,${Buffer.from(pathsCode).toString('base64')}`,
  ),
)
const {
  filterRecurrences,
  categoryPaths,
  recurrenceStatus,
  defaultRecurrenceFilters,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)
const categories = [
  { id: 'home', name: 'Logement', parent_id: null },
  { id: 'energy', name: 'Énergie', parent_id: 'home' },
  { id: 'gas', name: 'Gaz', parent_id: 'energy' },
  { id: 'salary', name: 'Salaires', parent_id: null },
]
const rule = (id, changes = {}) => ({
  id,
  label: id,
  category_id: 'gas',
  type: 'expense',
  amount: '10.00',
  next_date: '2026-12-01',
  is_active: true,
  ...changes,
})
const rows = [
  rule('Électricité'),
  rule('Salaire', { type: 'income', category_id: 'salary', amount: '2500.00' }),
  rule('Gaz en pause', { is_active: false }),
  rule('Ancien abonnement', { next_date: null }),
]
const select = (filters, items = rows) =>
  filterRecurrences(items, categories, {
    ...defaultRecurrenceFilters,
    ...filters,
  })

test('type, category subtree, status and accent-insensitive search combine', () => {
  assert.deepEqual(
    select({
      type: 'expense',
      categoryId: 'home',
      status: 'active',
      search: 'energie',
    }).map((r) => r.id),
    ['Électricité'],
  )
  assert.deepEqual(
    select({ type: 'income' }).map((r) => r.id),
    ['Salaire'],
  )
  assert.equal(select({ categoryId: 'missing' }).length, 0)
})
test('status distinguishes ended rules even if inactive', () => {
  assert.equal(
    recurrenceStatus(rule('x', { is_active: false, next_date: null })),
    'ended',
  )
  assert.deepEqual(
    select({ status: 'paused' }).map((r) => r.id),
    ['Gaz en pause'],
  )
  assert.deepEqual(
    select({ status: 'ended' }).map((r) => r.id),
    ['Ancien abonnement'],
  )
})
test('amount sorting preserves cents for values above Number precision', () => {
  const items = [
    rule('small', { amount: '99999999999999999.98' }),
    rule('large', { amount: '99999999999999999.99' }),
    rule('ten', { amount: '10' }),
    rule('nine', { amount: '9.9' }),
  ]
  assert.deepEqual(
    select({ sort: 'amount-desc' }, items).map((r) => r.id),
    ['large', 'small', 'ten', 'nine'],
  )
  assert.deepEqual(
    select({ sort: 'amount-asc' }, items).map((r) => r.id),
    ['nine', 'ten', 'small', 'large'],
  )
})
test('date order prioritizes active upcoming rules then paused and ended without mutating data', () => {
  const items = [
    rule('ended', { next_date: null }),
    rule('paused', { is_active: false, next_date: '2026-01-01' }),
    rule('later', { next_date: '2026-12-20' }),
    rule('soon', { next_date: '2026-12-01' }),
  ]
  const original = [...items]
  assert.deepEqual(
    select({ sort: 'date' }, items).map((r) => r.id),
    ['soon', 'later', 'paused', 'ended'],
  )
  assert.deepEqual(items, original)
})
test('category paths disambiguate equal leaf names and category sort is deterministic', () => {
  assert.equal(categoryPaths(categories).get('gas'), 'Logement / Énergie / Gaz')
  assert.deepEqual(
    select({ sort: 'category', status: 'active' }).map((r) => r.id),
    ['Électricité', 'Salaire'],
  )
  assert.equal(
    categoryPaths([{ id: 'cycle', name: 'Test', parent_id: 'cycle' }]).get(
      'cycle',
    ),
    'Test',
  )
})
