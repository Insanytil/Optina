import { ForecastPanel } from '@/features/recurrences/forecast-panel'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ListFilter,
  TrendingUp,
  Wallet as WalletIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import {
  formatBalance,
  loadWalletAnalytics,
  loadWalletSummary,
  walletKeys,
} from './api'
import { currentMonthPeriod, validPeriod } from './period'
import { PeriodPicker } from './period-picker'
import { DashboardCharts } from './dashboard-charts'
import { CreateTransactionButton } from './create-transaction-button'

export function WalletDashboard({ walletId }: { walletId: string }) {
  const [period, setPeriod] = useState(currentMonthPeriod)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const valid = validPeriod(period)
  const summary = useQuery({
    queryKey: walletKeys.summary(walletId, period.date_from, period.date_to),
    queryFn: ({ signal }) =>
      loadWalletSummary(walletId, period.date_from, period.date_to, signal),
    enabled: valid,
  })
  const analytics = useQuery({
    queryKey: walletKeys.analytics(walletId, period.date_from, period.date_to),
    queryFn: ({ signal }) =>
      loadWalletAnalytics(walletId, period.date_from, period.date_to, signal),
    enabled: valid && summary.isSuccess,
  })
  const data = summary.data
  const missing =
    summary.error instanceof ApiError &&
    [404, 422].includes(summary.error.status)
  return (
    <section className="mx-auto max-w-[1600px] space-y-5">
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Tous les portefeuilles
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Tableau de bord</p>
          <h1 className="break-words text-2xl font-semibold tracking-tight">
            {data?.wallet.name ?? 'Votre portefeuille'}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                to="/transactions"
                search={{
                  walletId,
                  from: period.date_from,
                  to: period.date_to,
                }}
              />
            }
          >
            <ListFilter aria-hidden="true" />
            Transactions
          </Button>
          {data && <CreateTransactionButton wallet={data.wallet} />}
        </div>
      </header>
      <PeriodPicker value={period} onChange={setPeriod} />
      {valid &&
        (summary.isPending ? (
          <p role="status" className="py-12 text-center text-muted-foreground">
            Chargement du tableau de bord…
          </p>
        ) : summary.isError ? (
          <div className="space-y-3 rounded-xl border bg-card p-6">
            <h2 className="font-semibold">
              {missing
                ? 'Portefeuille introuvable'
                : 'Impossible de charger ce portefeuille'}
            </h2>
            <p role="alert" className="text-sm text-muted-foreground">
              {missing
                ? 'Ce portefeuille n’existe plus ou ne vous est pas accessible.'
                : summary.error.message}
            </p>
            {!missing && (
              <Button
                variant="outline"
                disabled={summary.isFetching}
                onClick={() => void summary.refetch()}
              >
                Réessayer
              </Button>
            )}
          </div>
        ) : (
          data && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  title="Rentrées"
                  amount={data.income}
                  icon={<ArrowDownLeft className="size-4 text-emerald-500" />}
                  positive
                  caption="Sur la période"
                />
                <Metric
                  title="Dépenses"
                  amount={data.expenses}
                  icon={<ArrowUpRight className="size-4 text-rose-400" />}
                  caption="Sur la période"
                />
                <Metric
                  title="Résultat net"
                  amount={data.net}
                  icon={<TrendingUp className="size-4 text-emerald-500" />}
                  positive={!data.net.startsWith('-')}
                  highlight
                  caption="Rentrées − dépenses"
                />
                <Metric
                  title="Solde actuel"
                  amount={data.wallet.balance}
                  icon={<WalletIcon className="size-4 text-muted-foreground" />}
                  caption="Toutes périodes, solde initial inclus"
                />
              </div>
              <ForecastPanel walletId={walletId} manageLink />
              <p className="text-[11px] text-muted-foreground">
                Les mouvements d’ouverture sont exclus des indicateurs et des
                graphiques.
              </p>
              {analytics.isPending ? (
                <div
                  className="grid gap-4 xl:grid-cols-2"
                  role="status"
                  aria-label="Chargement des graphiques"
                >
                  {[0, 1, 2, 3].map((key) => (
                    <div
                      key={key}
                      className="h-72 animate-pulse rounded-xl border bg-muted/30"
                    />
                  ))}
                </div>
              ) : analytics.isError ? (
                <div className="space-y-3 rounded-xl border bg-card p-6">
                  <p role="alert" className="text-sm text-muted-foreground">
                    {analytics.error.message}
                  </p>
                  <Button
                    variant="outline"
                    disabled={analytics.isFetching}
                    onClick={() => void analytics.refetch()}
                  >
                    Recharger les graphiques
                  </Button>
                </div>
              ) : (
                analytics.data && (
                  <DashboardCharts
                    data={analytics.data}
                    walletId={walletId}
                    period={period}
                    categoryId={categoryId}
                    onCategoryChange={setCategoryId}
                  />
                )
              )}
            </>
          )
        ))}
    </section>
  )
}

function Metric({
  title,
  amount,
  caption,
  icon,
  positive = false,
  highlight = false,
}: {
  title: string
  amount: string
  caption: string
  icon: React.ReactNode
  positive?: boolean
  highlight?: boolean
}) {
  return (
    <article
      className={`rounded-xl border bg-card px-5 py-4 ${highlight ? 'border-emerald-500/35' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs text-muted-foreground">{title}</h2>
        <span aria-hidden="true">{icon}</span>
      </div>
      <p
        className={`mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums ${positive ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
      >
        {positive && !amount.startsWith('-') ? '+' : ''}
        {formatBalance(amount)}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">{caption}</p>
    </article>
  )
}
