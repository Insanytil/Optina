import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/budgets/budget-model.ts', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const model = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)

const item = (name, committed, available, threshold = 80) => ({
  name,
  committed: String(committed),
  alert_threshold: threshold,
  period: { available: String(available) },
})

test('dated amounts pick the amount in force and list future changes', () => {
  const budget = {
    amounts: [
      { effective_from: '2026-09-01', amount: '400.00' },
      { effective_from: '2027-01-01', amount: '450.00' },
    ],
  }
  assert.equal(model.amountOn(budget, '2026-11-26'), '400.00')
  assert.equal(model.amountOn(budget, '2027-01-01'), '450.00')
  assert.deepEqual(
    model.futureAmounts(budget, '2026-08-01').map((row) => row.amount),
    ['450.00'],
  )
})

test('levels use the per-budget threshold on spent plus planned', () => {
  assert.equal(model.level(item('a', 79, 100)), 'ok')
  assert.equal(model.level(item('a', 80, 100)), 'watch')
  assert.equal(model.level(item('a', 80, 100, 90)), 'ok')
  assert.equal(model.level(item('a', 101, 100)), 'over')
  // Carry-over can leave nothing available.
  assert.equal(model.level(item('a', 10, 0)), 'over')
  assert.equal(model.level(item('a', 0, 0)), 'ok')
})

test('attention order: overspent, then share used, then name', () => {
  const items = [
    item('Logement', 400, 500),
    item('Restaurants', 168, 150),
    item('Courses', 452, 450),
    item('Abonnements', 66, 60),
    item('Cadeaux', 10, 100),
  ]
  assert.deepEqual(
    model.byAttention(items).map((i) => i.name),
    ['Restaurants', 'Abonnements', 'Courses', 'Logement', 'Cadeaux'],
  )
  assert.deepEqual(
    model.toWatch(items).map((i) => i.name),
    ['Restaurants', 'Abonnements', 'Courses', 'Logement'],
  )
})

test('months and amounts', () => {
  assert.equal(model.monthOf('2026-11-26'), '2026-11-01')
  assert.equal(model.addMonths('2026-11-01', 2), '2027-01-01')
  assert.equal(model.addMonths('2026-01-01', -1), '2025-12-01')
  assert.ok(model.validAmount('12,5'))
  assert.ok(!model.validAmount('0'))
  assert.ok(!model.validAmount('1.234'))
  assert.equal(
    model.periodLabel('quarter', '2026-10-01', '2026-12-31'),
    'T4 2026',
  )
  assert.equal(model.periodLabel('year', '2026-01-01', '2026-12-31'), '2026')
})
