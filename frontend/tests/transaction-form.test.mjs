import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/transactions/form-values.ts', import.meta.url),
  'utf8',
)
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replaceAll("'zod'", JSON.stringify(import.meta.resolve('zod')))
const { isPositiveAmount, localToday, transactionFormSchema } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)
const values = {
  wallet_id: 'wallet',
  category_id: 'category',
  type: 'expense',
  amount: '12.34',
  date: '2020-01-01',
  label: 'Courses',
  note: '',
}

test('positive decimal validation preserves cents and large values exactly', () => {
  for (const amount of ['0.01', '12,34', '99999999999999999.99'])
    assert.equal(isPositiveAmount(amount), true)
  for (const amount of [
    '0',
    '0.00',
    '-1',
    '1.234',
    'NaN',
    'Infinity',
    '1e3',
    '100000000000000000.00',
  ])
    assert.equal(isPositiveAmount(amount), false)
})

test('local dates do not shift across midnight due to UTC conversion', () => {
  assert.equal(localToday(new Date(2026, 10, 4, 0, 1)), '2026-11-04')
  assert.equal(localToday(new Date(2026, 10, 4, 23, 59)), '2026-11-04')
})

test('ordinary transactions require a category and a nonempty label', () => {
  const schema = transactionFormSchema(false)
  assert.equal(schema.safeParse(values).success, true)
  assert.equal(schema.safeParse({ ...values, category_id: '' }).success, false)
  assert.equal(schema.safeParse({ ...values, label: ' ' }).success, false)
})

test('opening movements may omit categories and retain direction', () => {
  const schema = transactionFormSchema(true)
  const result = schema.parse({ ...values, category_id: '', type: 'income' })
  assert.equal(result.type, 'income')
  assert.equal(result.category_id, '')
})

test('future dates and impossible calendar dates are rejected', () => {
  const schema = transactionFormSchema(false)
  assert.equal(
    schema.safeParse({ ...values, date: '2999-01-01' }).success,
    false,
  )
  assert.equal(
    schema.safeParse({ ...values, date: '2026-02-31' }).success,
    false,
  )
})
