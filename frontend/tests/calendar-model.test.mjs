import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const compile = (source) =>
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString('base64')}`
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const modelUrl = compile(
  await read('../src/features/forecasts/forecast-model.ts'),
)
const calendar = await import(
  compile(
    (await read('../src/features/calendar/calendar-model.ts')).replace(
      "'../forecasts/forecast-model'",
      `'${modelUrl}'`,
    ),
  )
)

const occurrence = (date, label, wallet_id = 'w1') => ({
  recurrence_id: label,
  wallet_id,
  wallet_name: wallet_id,
  label,
  type: 'expense',
  amount: '10.00',
  date,
  scheduled_date: date,
})

test('shiftMonth crosses years in both directions', () => {
  assert.equal(calendar.shiftMonth('2026-12', 1), '2027-01')
  assert.equal(calendar.shiftMonth('2026-01', -1), '2025-12')
})

test('gridRange covers whole Monday-to-Sunday weeks', () => {
  // December 2026 starts on a Tuesday and ends on a Thursday.
  assert.deepEqual(calendar.gridRange('2026-12'), {
    from: '2026-11-30',
    to: '2027-01-03',
  })
  // February 2027 starts on a Monday and ends on a Sunday.
  assert.deepEqual(calendar.gridRange('2027-02'), {
    from: '2027-02-01',
    to: '2027-02-28',
  })
})

test('month grid places occurrences and flags past and spill-over days', () => {
  const weeks = calendar.buildCalendarMonth(
    '2026-12',
    [occurrence('2026-12-05', 'Loyer'), occurrence('2026-12-05', 'Énergie')],
    '2026-12-02',
  )
  assert.equal(weeks.length, 5)
  assert.ok(weeks.every((week) => week.length === 7))
  const days = weeks.flat()
  assert.equal(days[0].inMonth, false)
  assert.equal(days.find((d) => d.date === '2026-12-01').isPast, true)
  assert.deepEqual(
    days.find((d) => d.date === '2026-12-05').occurrences.map((o) => o.label),
    ['Loyer', 'Énergie'],
  )
})

const wallets = [
  { id: 'w1', name: 'Courant' },
  { id: 'w2', name: 'Épargne' },
  { id: 'w3', name: 'Joint' },
]

test('filterByWallets hides only the listed wallets', () => {
  const items = [
    occurrence('2026-12-05', 'A', 'w1'),
    occurrence('2026-12-06', 'B', 'w2'),
  ]
  assert.equal(calendar.filterByWallets(items, []).length, 2)
  assert.deepEqual(
    calendar.filterByWallets(items, ['w1']).map((o) => o.label),
    ['B'],
  )
})

test('toggleWallet adds or removes a wallet from the hidden list', () => {
  assert.deepEqual(calendar.toggleWallet([], 'w2'), ['w2'])
  assert.deepEqual(calendar.toggleWallet(['w1', 'w2'], 'w1'), ['w2'])
})

test('legend gives stable colors and the displayed month net per wallet', () => {
  const legend = calendar.buildLegend(
    wallets,
    [
      occurrence('2026-12-05', 'Loyer', 'w1'),
      occurrence('2026-12-20', 'Eau', 'w1'),
      occurrence('2027-01-02', 'Hors mois', 'w2'),
    ],
    '2026-12',
    ['w3'],
  )
  assert.deepEqual(
    legend.map((w) => [w.id, w.color, w.net, w.hidden]),
    [
      ['w1', calendar.WALLET_COLORS[0], -2000, false],
      ['w2', calendar.WALLET_COLORS[1], 0, false],
      ['w3', calendar.WALLET_COLORS[2], 0, true],
    ],
  )
})

test('summarizeDay groups by type, sorts largest first and totals', () => {
  const item = (label, type, amount) => ({
    ...occurrence('2026-12-05', label),
    type,
    amount,
  })
  const summary = calendar.summarizeDay([
    item('Énergie', 'expense', '80.00'),
    item('Salaire', 'income', '2000.00'),
    item('Loyer', 'expense', '900.00'),
    item('Allocations', 'income', '300.00'),
    item('Assurance', 'expense', '80.00'),
  ])
  assert.deepEqual(
    summary.incomes.map((o) => o.label),
    ['Salaire', 'Allocations'],
  )
  assert.deepEqual(
    summary.expenses.map((o) => o.label),
    ['Loyer', 'Assurance', 'Énergie'],
  )
  assert.equal(summary.income, 230000)
  assert.equal(summary.expense, 106000)
  assert.equal(summary.net, 124000)
})
