import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { afterEach, test } from 'node:test'
import ts from 'typescript'
import { QueryObserver, focusManager } from '@tanstack/react-query'

// Load the actual session module with a controlled API transport.
const transport = `export class ApiError extends Error { constructor(status) { super('API error'); this.status = status } }
export function api(...args) { return globalThis.sessionTestTransport(...args) }`
const transportUrl = `data:text/javascript;base64,${Buffer.from(transport).toString('base64')}`
const source = await readFile(
  new URL('../src/features/auth/session.ts', import.meta.url),
  'utf8',
)
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replaceAll(
    "'@tanstack/react-query'",
    JSON.stringify(import.meta.resolve('@tanstack/react-query')),
  )
  .replaceAll("'@/lib/api'", JSON.stringify(transportUrl))
const session = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)
const { ApiError } = await import(transportUrl)
const user = {
  id: 'user-1',
  email: 'user@example.com',
  is_superuser: false,
  is_verified: true,
}
const {
  queryClient,
  sessionOptions,
  getSession,
  setAnonymousSession,
  refreshSessionAfterLogin,
} = session

afterEach(() => {
  queryClient.clear()
  delete globalThis.sessionTestTransport
})

test('concurrent startup checks share a single request', async () => {
  let calls = 0
  globalThis.sessionTestTransport = async () => {
    calls++
    return user
  }
  const users = await Promise.all([getSession(), getSession(), getSession()])
  assert.deepEqual(users, [user, user, user])
  assert.equal(calls, 1)
})

test('route guards reuse even stale cached sessions without a request', async () => {
  queryClient.setQueryData(sessionOptions.queryKey, user, {
    updatedAt: Date.now() - 10 * 60_000,
  })
  globalThis.sessionTestTransport = () => {
    throw new Error('Unexpected navigation request')
  }
  assert.deepEqual(await getSession(), user)
})

test('background network errors preserve the existing user', async () => {
  queryClient.setQueryData(sessionOptions.queryKey, user)
  globalThis.sessionTestTransport = async () => {
    throw new Error('Offline')
  }
  await assert.rejects(
    queryClient.fetchQuery({ ...sessionOptions, staleTime: 0 }),
    /Offline/,
  )
  assert.deepEqual(await getSession(), user)
})

test('expiration clears private queries and immediately caches anonymous state', async () => {
  queryClient.setQueryData(sessionOptions.queryKey, user)
  queryClient.setQueryData(['wallets', 1], ['private data'])
  globalThis.sessionTestTransport = () => {
    throw new Error('Unexpected expiration request')
  }
  setAnonymousSession()
  assert.equal(await getSession(), null)
  assert.equal(queryClient.getQueryData(['wallets', 1]), undefined)
})

test('login forcibly refreshes a fresh anonymous cache', async () => {
  queryClient.setQueryData(sessionOptions.queryKey, null)
  globalThis.sessionTestTransport = async () => user
  assert.deepEqual(await refreshSessionAfterLogin(), user)
  assert.deepEqual(await getSession(), user)
})

test('401 is an anonymous session, while other errors remain errors', async () => {
  globalThis.sessionTestTransport = async () => {
    throw new ApiError(401)
  }
  assert.equal(await getSession(), null)
  queryClient.clear()
  globalThis.sessionTestTransport = async () => {
    throw new ApiError(500)
  }
  await assert.rejects(getSession())
})

test('returning to the tab refreshes only stale sessions', async () => {
  let calls = 0
  globalThis.sessionTestTransport = async () => {
    calls++
    return user
  }
  queryClient.setQueryData(sessionOptions.queryKey, user)
  queryClient.mount()
  const observer = new QueryObserver(queryClient, sessionOptions)
  const unsubscribe = observer.subscribe(() => {})
  try {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(calls, 0)
    queryClient.setQueryData(sessionOptions.queryKey, user, {
      updatedAt: Date.now() - 6 * 60_000,
    })
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(calls, 1)
  } finally {
    unsubscribe()
    queryClient.unmount()
    focusManager.setFocused(undefined)
  }
})
