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
  queryFn: async () => {
    try {
      return await api<User>('/auth/me')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  staleTime: 0,
})

export function getSession() {
  return queryClient.fetchQuery(sessionOptions)
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
