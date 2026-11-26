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
        <header className="flex h-10 shrink-0 items-center border-b px-2">
          <SidebarTrigger aria-label="Ouvrir ou fermer le menu" />
        </header>
        <div
          id="main-content"
          tabIndex={-1}
          className="flex flex-1 flex-col p-5 outline-none"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

