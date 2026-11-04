import { createContext, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { clearPrivateData, sessionOptions } from './session'
import type { User } from './session'

const SessionContext = createContext<User | null | undefined>(undefined)

export function useSession() {
  return useContext(SessionContext)
}

export function SessionProvider({
  children,
  onSessionChange,
}: {
  children: ReactNode
  onSessionChange: () => void
}) {
  const session = useQuery(sessionOptions)
  const previousUser = useRef<string | null | undefined>(undefined)
  const userId =
    session.data === undefined ? undefined : (session.data?.id ?? null)

  useEffect(() => {
    const previous = previousUser.current
    previousUser.current = userId
    if (previous !== undefined && userId !== undefined && previous !== userId) {
      clearPrivateData()
      onSessionChange()
    }
  }, [userId, onSessionChange])

  return (
    <SessionContext.Provider value={session.data}>
      {session.isError && session.data !== undefined && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-3 border-b bg-muted px-4 py-3 text-sm"
        >
          <p>
            Impossible de vérifier votre session : le serveur est momentanément
            injoignable.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={session.isFetching}
            onClick={() => void session.refetch()}
          >
            {session.isFetching ? 'Vérification…' : 'Réessayer'}
          </Button>
        </div>
      )}
      {children}
    </SessionContext.Provider>
  )
}
