import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ForecastPanel } from '@/features/recurrences/forecast-panel'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_protected/forecasts')({
  validateSearch: (search: Record<string, unknown>): { walletId?: string } => ({
    walletId:
      typeof search.walletId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(search.walletId)
        ? search.walletId
        : undefined,
  }),
  component: ForecastsPage,
})
function ForecastsPage() {
  const { walletId: selection } = Route.useSearch()
  const navigate = Route.useNavigate()
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const walletId =
    wallets.data?.find((wallet) => wallet.id === selection)?.id ??
    wallets.data?.[0]?.id
  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Prévisions
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Anticipez les rentrées et dépenses récurrentes d’un portefeuille. Les
          dépenses ponctuelles futures ne sont pas estimées.
        </p>
      </header>
      {wallets.isPending ? (
        <p role="status">Chargement des portefeuilles…</p>
      ) : wallets.isError ? (
        <div role="alert">
          <p>{wallets.error.message}</p>
          <Button variant="outline" onClick={() => void wallets.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : !walletId ? (
        <div className="rounded-xl border p-5">
          <p className="text-sm text-muted-foreground">
            Créez un portefeuille pour consulter ses prévisions.
          </p>
          <Link to="/wallets" className="mt-3 inline-block text-sm underline">
            Gérer mes portefeuilles
          </Link>
        </div>
      ) : (
        <>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="forecast-wallet">Portefeuille à analyser</Label>
            <select
              id="forecast-wallet"
              className="h-11 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              value={walletId}
              onChange={(event) =>
                void navigate({
                  search: { walletId: event.target.value },
                  replace: true,
                })
              }
            >
              {wallets.data.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </select>
          </div>
          <ForecastPanel key={walletId} walletId={walletId} manageLink />
        </>
      )}
    </section>
  )
}
