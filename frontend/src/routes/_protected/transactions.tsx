import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { currentMonthPeriod, validPeriod } from '@/features/wallets/period'
import { PeriodPicker } from '@/features/wallets/period-picker'
import { WalletTransactions } from '@/features/wallets/wallet-transactions'

interface TransactionsSearch {
  walletId?: string
  from?: string
  to?: string
}
export const Route = createFileRoute('/_protected/transactions')({
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => ({
    walletId: typeof search.walletId === 'string' ? search.walletId : undefined,
    from: typeof search.from === 'string' ? search.from : undefined,
    to: typeof search.to === 'string' ? search.to : undefined,
  }),
  component: TransactionsPage,
})

function TransactionsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [period, setPeriod] = useState(() => {
    const requested = { date_from: search.from ?? '', date_to: search.to ?? '' }
    return validPeriod(requested) ? requested : currentMonthPeriod()
  })
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const wallet =
    wallets.data?.find((item) => item.id === search.walletId) ??
    wallets.data?.[0]
  return (
    <section className="mx-auto w-full min-w-0 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Retrouvez et gérez les mouvements du portefeuille de votre choix.
        </p>
      </header>
      {wallets.isPending ? (
        <p role="status">Chargement des portefeuilles…</p>
      ) : wallets.isError ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {wallets.error.message}
          </p>
          <Button variant="outline" onClick={() => void wallets.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : !wallet ? (
        <p className="rounded-xl border p-6 text-sm">
          Pour commencer,{' '}
          <Link to="/" className="underline">
            créez un portefeuille
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="w-full max-w-xs space-y-2">
              <Label htmlFor="transactions-wallet">Portefeuille</Label>
              <select
                id="transactions-wallet"
                value={wallet.id}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                onChange={(event) =>
                  void navigate({
                    search: { ...search, walletId: event.target.value },
                  })
                }
              >
                {wallets.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  to="/wallets/$walletId"
                  params={{ walletId: wallet.id }}
                />
              }
            >
              Voir le tableau de bord
            </Button>
          </div>
          <PeriodPicker value={period} onChange={setPeriod} />
          {validPeriod(period) && (
            <WalletTransactions
              key={`${wallet.id}:${period.date_from}:${period.date_to}`}
              wallet={wallet}
              period={period}
            />
          )}
        </>
      )}
    </section>
  )
}
