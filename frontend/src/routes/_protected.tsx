import { AppShell } from '@/components/layout/app-shell'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getSession } from '@/features/auth/session'
import { useSession } from '@/features/auth/session-provider'

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
  const user = useSession()
  if (!user)
    return (
      <p className="p-6" role="status">
        Vérification de la session…
      </p>
    )
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  )
}
