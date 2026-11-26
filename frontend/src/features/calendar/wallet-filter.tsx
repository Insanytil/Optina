import { ChevronDown, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from 'cn'
import { amountTone, formatSignedCents } from '../forecasts/format'
import type { LegendWallet } from './calendar-model'

export interface WalletFilterProps {
  legend: LegendWallet[]
  onToggle: (walletId: string) => void
  onShowAll: () => void
  onHideAll: () => void
}

export function WalletSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

const summary = (legend: LegendWallet[]) => {
  const shown = legend.filter((wallet) => !wallet.hidden).length
  if (shown === legend.length) return 'Tous les portefeuilles'
  if (shown === 0) return 'Aucun portefeuille'
  return `${shown} portefeuille${shown > 1 ? 's' : ''} sur ${legend.length}`
}

/**
 * Wallet picker: a fixed-width button (so the header never shifts) opening
 * a checkbox list with each wallet's color and month net.
 */
export function WalletFilter({
  legend,
  onToggle,
  onShowAll,
  onHideAll,
}: WalletFilterProps) {
  if (legend.length < 2) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-56 justify-between"
          />
        }
        aria-label={`Portefeuilles affichés : ${summary(legend)}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Wallet aria-hidden="true" />
          <span className="truncate">{summary(legend)}</span>
        </span>
        <ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {legend.map((wallet) => (
          <DropdownMenuCheckboxItem
            key={wallet.id}
            checked={!wallet.hidden}
            onCheckedChange={() => onToggle(wallet.id)}
          >
            <WalletSwatch color={wallet.color} />
            <span className="min-w-0 flex-1 truncate">{wallet.name}</span>
            <span
              className={cn('text-xs tabular-nums', amountTone(wallet.net))}
            >
              {wallet.net !== 0 && formatSignedCents(wallet.net)}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onShowAll}>Tout afficher</DropdownMenuItem>
        <DropdownMenuItem onClick={onHideAll}>Tout masquer</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
