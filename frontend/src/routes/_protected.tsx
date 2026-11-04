import { AppShell } from '@/components/layout/app-shell'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { sessionOptions } from '@/features/auth/session'
import { getSession } from '@/features/auth/session'

export const Route = createFileRoute('/_protected')({
  beforeLoad: async ({ location }) => {
    const user = await getSession()
    if (!user)
      throw redirect({ to: '/login', search: { redirect: location.href } })
    return { user }
  },
  component: ProtectedLayout,
})

function ProtectedLayout() {
  const router = useRouter()
  const session = useQuery(sessionOptions)
  useEffect(() => {
    if (session.data === null) void router.invalidate()
  }, [session.data, router])
  if (session.isError) throw session.error
  if (!session.data)
    return (
      <p className="p-6" role="status">
        Vérification de la session…
      </p>
    )
  return (
    <AppShell user={session.data}>
      <Outlet />
    </AppShell>
  )
}
