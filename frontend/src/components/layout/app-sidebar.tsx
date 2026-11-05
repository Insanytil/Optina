import { ThemeToggle } from '@/features/theme/theme-toggle'
import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { LoaderCircle, LogOut, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { api, ApiError } from '@/lib/api'
import { setAnonymousSession } from '@/features/auth/session'
import type { User } from '@/features/auth/session'
import { AppNavigation } from './app-navigation'
import { navigationGroups } from './navigation'

export function AppSidebar({ user }: { user: User }) {
  const { setOpenMobile } = useSidebar()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function logout() {
    if (pending) return
    setPending(true)
    setError('')
    try {
      try {
        await api<void>('/auth/logout', { method: 'POST' })
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.status === 401)) throw cause
      }
      setAnonymousSession()
      await router.invalidate()
      await router.navigate({
        to: '/login',
        search: { redirect: '/' },
        replace: true,
      })
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'La déconnexion a échoué.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="flex-row items-center justify-between px-5 py-5">
        <Link
          to="/"
          onClick={() => setOpenMobile(false)}
          className="rounded-sm text-xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Optina
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          onClick={() => setOpenMobile(false)}
          aria-label="Fermer le menu"
        >
          <X aria-hidden="true" />
        </Button>
      </SidebarHeader>
      <AppNavigation
        groups={navigationGroups}
        onNavigate={() => setOpenMobile(false)}
      />
      <SidebarSeparator />
      <SidebarFooter className="gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 items-center gap-3 px-1 py-1">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background">
            <UserRound
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Connecté en tant que
            </p>
            <p className="truncate text-sm font-medium" title={user.email}>
              {user.email}
            </p>
          </div>
        </div>
        <ThemeToggle />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          variant="outline"
          className="h-10 w-full justify-start"
          disabled={pending}
          onClick={logout}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <LogOut aria-hidden="true" />
          )}
          {pending ? 'Déconnexion…' : 'Se déconnecter'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
