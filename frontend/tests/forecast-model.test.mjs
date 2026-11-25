import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/forecasts/forecast-model.ts', import.meta.url),
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

const occurrence = (date, type, amount, label = date) => ({
  recurrence_id: label,
  label,
  type,
  amount,
  date,
  scheduled_date: date,
})

test('toCents parses decimal strings exactly', () => {
  assert.equal(model.toCents('12.3'), 1230)
  assert.equal(model.toCents('-0.05'), -5)
  assert.equal(model.toCents('1000'), 100000)
  assert.equal(model.toCents('0.1'), 10)
})

test('parseHorizon only accepts known horizons', () => {
  assert.equal(model.parseHorizon('6'), 6)
  assert.equal(model.parseHorizon(2), undefined)
  assert.equal(model.parseHorizon('abc'), undefined)
})

test('addDays crosses month and year boundaries', () => {
  assert.equal(model.addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(model.addDays('2028-02-28', 1), '2028-02-29')
})

test('daily balance accumulates same-day movements and covers every day', () => {
  const points = model.buildDailyBalance(
    10000,
    [
      occurrence('2026-11-26', 'expense', '150.00'),
      occurrence('2026-11-26', 'income', '20.00'),
      occurrence('2026-11-28', 'income', '100.00'),
    ],
    '2026-11-25',
    '2026-11-28',
  )
  assert.deepEqual(points, [
    { date: '2026-11-25', balance: 10000 },
    { date: '2026-11-26', balance: -3000 },
    { date: '2026-11-27', balance: -3000 },
    { date: '2026-11-28', balance: 7000 },
  ])
  assert.deepEqual(model.lowestPoint(points), {
    amount: -3000,
    date: '2026-11-26',
  })
})

test('forecast view groups occurrences by month and summarizes the period', () => {
  const view = model.buildForecastView({
    date_from: '2026-11-25',
    date_to: '2026-12-31',
    current_balance: '100.00',
    minimum_balance: '-50.00',
    months: [
      {
        month: '2026-11',
        income: '0',
        expenses: '150',
        net: '-150',
        opening_balance: '100',
        closing_balance: '-50',
        minimum_balance: '-50',
        minimum_date: '2026-11-30',
      },
      {
        month: '2026-12',
        income: '200',
        expenses: '0',
        net: '200',
        opening_balance: '-50',
        closing_balance: '150',
        minimum_balance: '-50',
        minimum_date: '2026-12-01',
      },
    ],
    occurrences: [
      occurrence('2026-11-30', 'expense', '150.00', 'Loyer'),
      occurrence('2026-12-25', 'income', '200.00', 'Salaire'),
    ],
  })
  assert.deepEqual(
    view.months.map((m) => m.occurrences.map((o) => o.label)),
    [['Loyer'], ['Salaire']],
  )
  assert.deepEqual(view.summary, {
    current: 10000,
    final: 15000,
    change: 5000,
    net: 5000,
    minimum: { amount: -5000, date: '2026-11-30' },
    occurrenceCount: 2,
  })
  assert.equal(view.balance.length, 37)
})
