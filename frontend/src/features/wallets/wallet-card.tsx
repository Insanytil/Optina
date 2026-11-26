import type { CSSProperties, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Wallet as WalletIcon } from 'lucide-react'
import { cn } from 'cn'
import { formatBalance } from './api'
import type { Wallet } from './api'

/**
 * A wallet tile, tinted with the wallet's color (the same one the calendar
 * uses). The whole card opens the wallet; `actions` stay clickable on top.
 */
export function WalletCard({
  wallet,
  color = 'var(--primary)',
  actions,
}: {
  wallet: Wallet
  color?: string
  actions?: ReactNode
}) {
  const negative = Number(wallet.balance) < 0
  return (
    <article
      style={{ '--wallet': color } as CSSProperties}
      className="group relative isolate flex min-w-0 flex-col gap-6 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--wallet)_45%,transparent)] hover:shadow-md focus-within:border-[color-mix(in_oklab,var(--wallet)_45%,transparent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {/* Soft wash of the wallet color in the top-right corner. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-16 -z-10 size-48 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-30"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
              color,
            }}
          >
            <WalletIcon className="size-5" aria-hidden="true" />
          </div>
          <h2 className="truncate font-medium" title={wallet.name}>
            <Link
              to="/wallets/$walletId"
              params={{ walletId: wallet.id }}
              className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {wallet.name}
            </Link>
          </h2>
        </div>
        {actions ? (
          <div className="relative z-10 flex shrink-0 gap-1">{actions}</div>
        ) : (
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
          />
        )}
      </div>
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Solde actuel
        </p>
        <p
          className={cn(
            'mt-1 text-3xl font-semibold tracking-tight break-words tabular-nums',
            negative && 'text-rose-600 dark:text-rose-400',
          )}
        >
          {formatBalance(wallet.balance)}
        </p>
      </div>
      {/* Accent line in the wallet color. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1 opacity-70"
        style={{ backgroundColor: color }}
      />
    </article>
  )
}
