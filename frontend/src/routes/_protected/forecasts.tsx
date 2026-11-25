import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_HORIZON,
  parseHorizon,
} from '@/features/forecasts/forecast-model'
import type { ForecastHorizon } from '@/features/forecasts/forecast-model'
import { ForecastToolbar } from '@/features/forecasts/forecast-toolbar'
import { ForecastView } from '@/features/forecasts/forecast-view'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'

interface ForecastSearch {
  walletId?: string
  months?: ForecastHorizon
}

export const Route = createFileRoute('/_protected/forecasts')({
  validateSearch: (search: Record<string, unknown>): ForecastSearch => ({
    walletId:
      typeof search.walletId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(search.walletId)
        ? search.walletId
        : undefined,
    months: parseHorizon(search.months),
  }),
  component: ForecastsPage,
})

function ForecastsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const walletId =
    wallets.data?.find((wallet) => wallet.id === search.walletId)?.id ??
    wallets.data?.[0]?.id
  const months = search.months ?? DEFAULT_HORIZON
  const update = (patch: ForecastSearch) =>
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
    })

  if (wallets.isPending)
    return <p role="status">Chargement des portefeuilles…</p>
  if (wallets.isError)
    return (
      <div role="alert" className="space-y-3">
        <p>{wallets.error.message}</p>
        <Button variant="outline" onClick={() => void wallets.refetch()}>
          Réessayer
        </Button>
      </div>
    )
  if (!walletId)
    return (
      <div className="rounded-xl border p-5 text-sm text-muted-foreground">
        Créez un portefeuille pour consulter ses prévisions.{' '}
        <Link to="/wallets" className="underline">
          Gérer mes portefeuilles
        </Link>
      </div>
    )

  return (
    <section className="space-y-2.5">
      <ForecastToolbar
        wallets={wallets.data}
        walletId={walletId}
        months={months}
        onWalletChange={(id) => update({ walletId: id })}
        onMonthsChange={(value) => update({ months: value })}
      />
      <ForecastView key={walletId} walletId={walletId} months={months} />
    </section>
  )
}
