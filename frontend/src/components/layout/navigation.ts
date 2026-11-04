import { Home } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FileRoutesByTo } from '@/routeTree.gen'

export interface NavigationItem {
  label: string
  to: keyof FileRoutesByTo
  icon: LucideIcon
  /** Use exact matching for a section's index; otherwise child pages stay active. */
  exact?: boolean
}

export interface NavigationGroup {
  label: string
  items: readonly NavigationItem[]
}

/** Add future pages here, after creating their routes. */
export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: 'Mon espace',
    items: [{ label: 'Accueil', to: '/', icon: Home, exact: true }],
  },
]
