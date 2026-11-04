import type { ReactNode } from 'react'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import type { User } from '@/features/auth/session'
import { AppSidebar } from './app-sidebar'

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
      <AppSidebar user={user} />
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
