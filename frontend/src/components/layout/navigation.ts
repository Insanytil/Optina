import {
  Home,
  Wallet,
  FolderTree,
  ArrowLeftRight,
  Repeat2,
  ChartNoAxesCombined,
} from 'lucide-react'
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
    items: [
      { label: 'Accueil', to: '/', icon: Home, exact: true },
      { label: 'Vue globale', to: '/overview', icon: ChartNoAxesCombined },
      { label: 'Portefeuilles', to: '/wallets', icon: Wallet },
      { label: 'Transactions', to: '/transactions', icon: ArrowLeftRight },
      { label: 'Récurrences', to: '/recurrences', icon: Repeat2 },
      { label: 'Catégories', to: '/categories', icon: FolderTree },
    ],
  },
]
