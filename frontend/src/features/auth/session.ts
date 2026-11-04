import { QueryClient, queryOptions } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'

export interface User {
  id: string
  email: string
  is_superuser: boolean
  is_verified: boolean
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

export const sessionOptions = queryOptions({
  queryKey: ['auth', 'me'],
  queryFn: async ({ signal }) => {
    try {
      return await api<User>('/auth/me', { signal })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  // Route guards read the cache; focus/reconnect refresh only stale sessions.
  staleTime: 5 * 60_000,
  refetchOnMount: false,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
})

export function getSession() {
  return queryClient.ensureQueryData(sessionOptions)
}

export function clearPrivateData() {
  void queryClient.cancelQueries({
    predicate: (query) => query.queryKey[0] !== 'auth',
  })
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== 'auth',
  })
  queryClient.getMutationCache().clear()
}

export function setAnonymousSession() {
  void queryClient.cancelQueries({ queryKey: sessionOptions.queryKey })
  clearPrivateData()
  queryClient.setQueryData(sessionOptions.queryKey, null)
}

export async function refreshSessionAfterLogin() {
  void queryClient.cancelQueries({ queryKey: sessionOptions.queryKey })
  clearPrivateData()
  return queryClient.fetchQuery({ ...sessionOptions, staleTime: 0 })
}

export function safeRedirect(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s]/.test(value)
  )
    return '/'
  const url = new URL(value, window.location.origin)
  return url.origin === window.location.origin &&
    !/^\/login(?:\/|$)/.test(url.pathname)
    ? url.pathname + url.search + url.hash
    : '/'
}
