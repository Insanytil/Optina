import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
const load = async (name) => {
  const source = await readFile(
    new URL(`../src/features/budgets/${name}.ts`, import.meta.url),
    'utf8',
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
  )
}
const { budgetProgress, validBudgetAmount } = await load('budget-progress')
const {
  calendarPeriod,
  nextPeriod,
  validDate,
  filterGoals,
  defaultView,
  cumulativeActivity,
} = await load('periods')
test('progress distinguishes actual overspending from future commitments exactly', () => {
  assert.equal(
    budgetProgress('100.00', '50.00', '101.00').status,
    'Dépassement prévu',
  )
  assert.equal(budgetProgress('100.00', '101.00', '101.00').status, 'Dépassé')
  assert.equal(
    budgetProgress('100.00', '79.99', '80.00').status,
    'À surveiller',
  )
  assert.equal(
    budgetProgress('100.00', '99.99', '100.00').status,
    'Objectif atteint',
  )
  assert.equal(
    budgetProgress(
      '99999999999999999.98',
      '99999999999999999.99',
      '99999999999999999.99',
    ).status,
    'Dépassé',
  )
  assert.equal(budgetProgress('100', '1', '400').width, 100)
})
test('calendar periods cover leap years, quarters and weeks crossing years', () => {
  assert.deepEqual(calendarPeriod('week', '2026-01-01'), {
    date_from: '2025-12-29',
    date_to: '2026-01-04',
  })
  assert.deepEqual(calendarPeriod('month', '2024-02-12'), {
    date_from: '2024-02-01',
    date_to: '2024-02-29',
  })
  assert.deepEqual(calendarPeriod('quarter', '2026-05-12'), {
    date_from: '2026-04-01',
    date_to: '2026-06-30',
  })
  assert.deepEqual(calendarPeriod('year', '2026-02-12'), {
    date_from: '2026-01-01',
    date_to: '2026-12-31',
  })
  assert.deepEqual(
    nextPeriod({
      date_from: '2026-12-01',
      date_to: '2026-12-31',
      period_type: 'month',
    }),
    { date_from: '2027-01-01', date_to: '2027-01-31' },
  )
  assert.deepEqual(
    nextPeriod({
      date_from: '2026-02-10',
      date_to: '2026-02-12',
      period_type: 'custom',
    }),
    { date_from: '2026-02-13', date_to: '2026-02-15' },
  )
  assert.equal(validDate('2026-02-29'), false)
  assert.equal(validDate('2024-02-29'), true)
})
test('view filters select whole goals without changing their dates or wallet scope', () => {
  const goal = {
    id: 'annual',
    category_id: 'food',
    period_type: 'year',
    wallet_ids: ['A', 'B'],
    date_from: '2026-01-01',
    date_to: '2026-12-31',
  }
  const view = { ...defaultView('review'), wallet_ids: ['A'] }
  const result = filterGoals([goal], view, '2026-06-01')
  assert.equal(result[0], goal)
  assert.deepEqual(result[0].wallet_ids, ['A', 'B'])
  assert.deepEqual(
    filterGoals([goal], { ...view, status: 'ended' }, '2026-06-01'),
    [],
  )
})
test('cumulative activity preserves exact cents, zero fills and stops at the as-of date', () => {
  const goal = {
    date_from: '2026-01-01',
    date_to: '2026-12-31',
    activity: [
      { date: '2026-01-02', amount: '99999999999999999.98' },
      { date: '2026-01-03', amount: '0.01' },
      { date: '2026-12-01', amount: '100' },
    ],
  }
  const series = cumulativeActivity(goal, '2026-03-15')
  assert.equal(series.length, 3)
  assert.equal(series[0].exact, '99999999999999999.99')
  assert.equal(series[2].exact, '99999999999999999.99')
  assert.deepEqual(cumulativeActivity(goal, '2025-12-31'), [])
})

test('budget limits are positive exact cents within the database precision', () => {
  for (const value of ['1', '0.01', '123,45', '99999999999999999.99'])
    assert.equal(validBudgetAmount(value), true)
  for (const value of ['0', '0.00', '-1', 'NaN', '1.001', '100000000000000000'])
    assert.equal(validBudgetAmount(value), false)
})

test('a saved recurring budget filter follows the series across distinct periods', () => {
  const make = (id, from, to) => ({
    id,
    series_id: 'family-food',
    category_id: 'food',
    period_type: 'month',
    wallet_ids: ['A'],
    date_from: from,
    date_to: to,
  })
  const periods = [
    make('jan', '2026-01-01', '2026-01-31'),
    make('feb', '2026-02-01', '2026-02-28'),
    make('mar', '2026-03-01', '2026-03-31'),
  ]
  const view = { ...defaultView(), budget_ids: ['family-food'], status: 'all' }
  assert.equal(filterGoals(periods, view, '2026-02-15').length, 3)
  assert.deepEqual(
    filterGoals(periods, { ...view, status: 'active' }, '2026-02-15').map(
      (period) => period.id,
    ),
    ['feb'],
  )
  assert.deepEqual(
    filterGoals(periods, { ...view, status: 'ended' }, '2026-02-15').map(
      (period) => period.id,
    ),
    ['jan'],
  )
  assert.deepEqual(
    filterGoals(periods, { ...view, status: 'upcoming' }, '2026-02-15').map(
      (period) => period.id,
    ),
    ['mar'],
  )
})
