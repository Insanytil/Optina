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
  assert.equal(model.changeLabel(model.change(88, 100), 'oct.'), '−12 % vs oct.')
  assert.equal(model.changeLabel(model.change(100, 100), 'oct.'), '= oct.')
  assert.equal(model.change(5, 0), null)
})
