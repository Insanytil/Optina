import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/wallets/wallet-model.ts', import.meta.url),
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

const history = [
  { date: '2026-10-31', balance: '1000.00' },
  { date: '2026-11-01', balance: '900.00' },
  { date: '2026-11-02', balance: '850.00' },
]
const upcoming = [
  { date: '2026-11-02', type: 'expense', amount: '50.00' },
  { date: '2026-11-04', type: 'income', amount: '2000.00' },
  { date: '2026-12-01', type: 'expense', amount: '700.00' },
]

test('the curve drops the opening point then projects to the end', () => {
  const curve = model.balanceCurve(history, upcoming, '2026-11-04')
  assert.deepEqual(
    curve.map((p) => [p.date, p.real, p.projected]),
    [
      ['2026-11-01', 900, null],
      ['2026-11-02', 850, 800],
      ['2026-11-03', null, 800],
      ['2026-11-04', null, 2800],
    ],
  )
  assert.equal(model.endBalance(curve), 2800)
  assert.equal(model.lastReal(curve).date, '2026-11-02')
})

test('a past period has no projection', () => {
  const curve = model.balanceCurve(history, upcoming, '2026-11-02')
  assert.ok(curve.every((p) => p.projected === null))
  assert.equal(model.endBalance(curve), 850)
})

test('totals and comparisons', () => {
  assert.equal(model.netBetween(upcoming, '2026-11-01', '2026-11-30'), 1950)
  assert.equal(model.incomeBetween(upcoming, '2026-11-01', '2026-11-30'), 2000)
  assert.equal(model.addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(
    model.changeLabel(model.change(88, 100), 'oct.'),
    '−12 % vs oct.',
  )
  assert.equal(model.changeLabel(model.change(100, 100), 'oct.'), '= oct.')
  assert.equal(model.change(5, 0), null)
})

test('movements are grouped by day with a signed total', () => {
  const groups = model.groupByDay([
    { date: '2026-11-23', type: 'expense', amount: '7.40' },
    { date: '2026-11-23', type: 'income', amount: '20.00' },
    { date: '2026-11-20', type: 'expense', amount: '78.32' },
  ])
  assert.deepEqual(
    groups.map((g) => [g.date, g.net, g.items.length]),
    [
      ['2026-11-23', 12.6, 2],
      ['2026-11-20', -78.32, 1],
    ],
  )
})

test('notes keep real rises and the biggest expense due this week', () => {
  const result = model.notes(
    [
      { id: 'food', name: 'Alimentation', amount: 453 },
      { id: 'fun', name: 'Loisirs', amount: 30 },
      { id: 'car', name: 'Transport', amount: 110 },
      { id: null, name: 'Général', amount: 500 },
    ],
    new Map([
      ['food', 330],
      ['fun', 10],
      ['car', 100],
    ]),
    [
      { date: '2026-11-29', type: 'expense', amount: '904.18', label: 'Loyer' },
      {
        date: '2026-11-27',
        type: 'expense',
        amount: '150',
        label: 'Assurance',
      },
      {
        date: '2026-12-10',
        type: 'expense',
        amount: '2000',
        label: 'Plus tard',
      },
      { date: '2026-11-28', type: 'income', amount: '3000', label: 'Salaire' },
    ],
    '2026-11-26',
  )
  assert.deepEqual(result, [
    {
      kind: 'rise',
      categoryId: 'food',
      name: 'Alimentation',
      ratio: 123 / 330,
    },
    { kind: 'due', label: 'Loyer', amount: 904.18, days: 3 },
  ])
})
