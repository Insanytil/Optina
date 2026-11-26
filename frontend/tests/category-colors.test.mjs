import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/wallets/category-colors.ts', import.meta.url),
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

test('top-level categories keep their color by tree position', () => {
  const colors = model.rootColors([
    { id: 'b', parent_id: null, position: 2 },
    { id: 'child', parent_id: 'a', position: 0 },
    { id: 'a', parent_id: null, position: 1 },
  ])
  assert.equal(colors.get('a'), model.PALETTE[0])
  assert.equal(colors.get('b'), model.PALETTE[1])
  assert.equal(colors.has('child'), false)
})

test('children get lighter shades of the parent color', () => {
  assert.equal(model.shade('#000000', 0, 3), '#000000')
  assert.equal(model.shade('#000000', 1, 2), '#4d4d4d')
  assert.equal(model.shade('#10b981', 2, 1), '#10b981')
})

test('shares and changes', () => {
  assert.equal(model.percent(25, 200), 13)
  assert.equal(model.percent(5, 0), 0)
  assert.equal(model.delta(110, 100), 10)
  assert.equal(model.delta(50, 0), null)
  assert.equal(model.delta(50, undefined), null)
})
