import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/wallets/period.ts', import.meta.url),
  'utf8',
)
const formSource = await readFile(
  new URL('../src/features/transactions/form-values.ts', import.meta.url),
  'utf8',
)
const compile = (value) =>
  ts
    .transpileModule(value, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replaceAll("'zod'", JSON.stringify(import.meta.resolve('zod')))
const url = (value) =>
  `data:text/javascript;base64,${Buffer.from(value).toString('base64')}`
const compiled = compile(source).replaceAll(
  "'@/features/transactions/form-values'",
  JSON.stringify(url(compile(formSource))),
)
const {
  monthPeriod,
  shiftPeriodMonth,
  validPeriod,
  periodMonth,
  currentMonthPeriod,
  presetPeriod,
} = await import(url(compiled))

test('month ranges include correct leap-year and month-end boundaries', () => {
  assert.deepEqual(monthPeriod('2024-02'), {
    date_from: '2024-02-01',
    date_to: '2024-02-29',
  })
  assert.deepEqual(monthPeriod('2026-02'), {
    date_from: '2026-02-01',
    date_to: '2026-02-28',
  })
  assert.deepEqual(monthPeriod('2026-04'), {
    date_from: '2026-04-01',
    date_to: '2026-04-30',
  })
})

test('month navigation crosses year boundaries correctly', () => {
  assert.deepEqual(
    shiftPeriodMonth(monthPeriod('2026-01'), -1),
    monthPeriod('2025-12'),
  )
  assert.deepEqual(
    shiftPeriodMonth(monthPeriod('2026-12'), 1),
    monthPeriod('2027-01'),
  )
})

test('invalid and incomplete periods cannot trigger dashboard queries', () => {
  assert.equal(validPeriod({ date_from: '', date_to: '2026-01-31' }), false)
  assert.equal(
    validPeriod({ date_from: '2026-02-01', date_to: '2026-01-31' }),
    false,
  )
  assert.equal(
    validPeriod({ date_from: '2026-02-31', date_to: '2026-03-31' }),
    false,
  )
  assert.equal(monthPeriod('2026-13'), null)
  assert.equal(monthPeriod('invalid'), null)
})

test('custom periods are distinguished from complete calendar months', () => {
  assert.equal(periodMonth(monthPeriod('2026-01')), '2026-01')
  assert.equal(
    periodMonth({ date_from: '2026-01-05', date_to: '2026-01-31' }),
    '',
  )
  assert.equal(
    validPeriod({ date_from: '2026-01-05', date_to: '2026-01-05' }),
    true,
  )
  assert.equal(validPeriod(currentMonthPeriod()), true)
})

test('rolling presets include today and cross month boundaries exactly', () => {
  const now = new Date(2026, 0, 4, 15, 0)
  assert.deepEqual(presetPeriod('7d', now), {
    date_from: '2025-12-29',
    date_to: '2026-01-04',
  })
  assert.deepEqual(presetPeriod('30d', now), {
    date_from: '2025-12-06',
    date_to: '2026-01-04',
  })
})

test('calendar presets contain complete months and years', () => {
  const now = new Date(2026, 0, 4)
  assert.deepEqual(presetPeriod('3m', now), {
    date_from: '2025-11-01',
    date_to: '2026-01-31',
  })
  assert.deepEqual(presetPeriod('year', now), {
    date_from: '2026-01-01',
    date_to: '2026-12-31',
  })
})
