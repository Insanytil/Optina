import {
  Home,
  Target,
  Wallet,
  FolderTree,
  ArrowLeftRight,
  Repeat2,
  ChartNoAxesCombined,
  CalendarClock,
  Settings2,
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
    label: 'Visualisation',
    items: [
      { label: 'Accueil', to: '/', icon: Home, exact: true },
      { label: 'Mes portefeuilles', to: '/my-wallets', icon: Wallet },
      { label: 'Vue globale', to: '/overview', icon: ChartNoAxesCombined },
      { label: 'Transactions', to: '/transactions', icon: ArrowLeftRight },
      { label: 'Suivi des budgets', to: '/budgets', icon: Target },
      { label: 'Prévisions', to: '/forecasts', icon: CalendarClock },
    ],
  },
  {
    label: 'Paramétrage',
    items: [
      { label: 'Portefeuilles', to: '/wallets', icon: Wallet, exact: true },
      { label: 'Catégories', to: '/categories', icon: FolderTree },
      {
        label: 'Budgets de dépenses',
        to: '/settings/budgets',
        icon: Settings2,
      },
      { label: 'Récurrences', to: '/recurrences', icon: Repeat2 },
    ],
  },
]
