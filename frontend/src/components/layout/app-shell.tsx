import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { Home, LoaderCircle, LogOut, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { api, ApiError } from '@/lib/api'
import { queryClient } from '@/features/auth/session'
import type { User } from '@/features/auth/session'

export function AppShell({
  user,
  children,
}: {
  user: User
  children: ReactNode
}) {
  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:ring-2"
      >
        Aller au contenu
      </a>
      <AppMenu user={user} />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
          <SidebarTrigger aria-label="Ouvrir ou fermer le menu" />
          <span className="text-sm font-medium text-muted-foreground">
            Mon espace
          </span>
        </header>
        <div
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-6 outline-none md:p-10"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function AppMenu({ user }: { user: User }) {
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
      queryClient.clear()
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
          Optina<span className="text-muted-foreground">.</span>
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
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Mon espace</SidebarGroupLabel>
          <nav aria-label="Navigation principale">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link
                      to="/"
                      activeOptions={{ exact: true }}
                      activeProps={{
                        'aria-current': 'page',
                        'data-active': true,
                      }}
                    />
                  }
                  onClick={() => setOpenMobile(false)}
                  className="h-10"
                >
                  <Home aria-hidden="true" />
                  <span>Accueil</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>
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
