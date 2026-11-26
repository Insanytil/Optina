import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Wallet as WalletIcon } from 'lucide-react'
import { formatBalance } from './api'
import type { Wallet } from './api'

/** A wallet tile; management pages pass their buttons through `actions`. */
export function WalletCard({
  wallet,
  actions,
}: {
  wallet: Wallet
  actions?: ReactNode
}) {
  return (
    <article className="min-w-0 rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <WalletIcon className="size-4" aria-hidden="true" />
          </div>
          <h2 className="truncate font-medium" title={wallet.name}>
            <Link
              to="/wallets/$walletId"
              params={{ walletId: wallet.id }}
              className="rounded-sm hover:underline focus-visible:outline-2"
            >
              {wallet.name}
            </Link>
          </h2>
        </div>
        {actions && <div className="flex shrink-0 gap-1">{actions}</div>}
      </div>
      <Link
        to="/wallets/$walletId"
        params={{ walletId: wallet.id }}
        className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Ouvrir le portefeuille ${wallet.name}`}
      >
        <p className="text-xs text-muted-foreground">Solde actuel</p>
        <p className="mt-1 break-words text-2xl font-semibold tracking-tight tabular-nums">
          {formatBalance(wallet.balance)}
        </p>
        <p className="mt-5 text-sm text-muted-foreground">
          Ouvrir le portefeuille →
        </p>
      </Link>
    </article>
  )
}
