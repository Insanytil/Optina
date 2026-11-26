import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { ResponsiveChart } from '@/components/ui/responsive-chart'
import { api } from '@/lib/api'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { formatBalance } from './api'
import { currentMonthPeriod, validPeriod } from './period'
import { PeriodPicker } from './period-picker'

interface Comparison {
  balance: string
  income: string
  expenses: string
  net: string
  wallets: {
    id: string
    name: string
    balance: string
    income: string
    expenses: string
    net: string
  }[]
  categories: {
    id: string
    name: string
    income: string
    expenses: string
    net: string
  }[]
}

export function GlobalOverview() {
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const [selection, setSelection] = useState<string[] | null>(null)
  const [period, setPeriod] = useState(currentMonthPeriod)
  const ids = (selection ?? wallets.data?.map((wallet) => wallet.id) ?? [])
    .filter((id) => wallets.data?.some((wallet) => wallet.id === id))
    .sort()
  const query = useQuery({
    queryKey: ['wallets', 'overview', ids, period],
    enabled: ids.length > 0 && validPeriod(period),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        date_from: period.date_from,
        date_to: period.date_to,
      })
      ids.forEach((id) => params.append('wallet_ids', id))
      return api<Comparison>(`/wallets/overview?${params}`, { signal })
    },
  })
  const data = query.data
  return (
    <section className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Vue globale</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cumulez vos portefeuilles ou comparez leurs rentrées et dépenses sur
          une même période.
        </p>
      </header>
      {wallets.isPending ? (
        <p role="status">Chargement des portefeuilles…</p>
      ) : wallets.isError ? (
        <div>
          <p role="alert">{wallets.error.message}</p>
          <Button variant="outline" onClick={() => void wallets.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : wallets.data.length === 0 ? (
        <p className="rounded-xl border p-6">
          Créez votre premier{' '}
          <Link to="/wallets" className="underline">
            portefeuille
          </Link>{' '}
          pour afficher cette vue.
        </p>
      ) : (
        <>
          <fieldset className="space-y-3 rounded-xl border bg-card p-4">
            <legend className="px-1 text-sm font-medium">
              Portefeuilles à comparer
            </legend>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelection(null)}
              >
                Tout sélectionner
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelection([])}
              >
                Tout désélectionner
              </Button>
            </div>
            <div className="flex max-h-48 flex-wrap gap-x-6 gap-y-3 overflow-y-auto">
              {wallets.data.map((wallet) => (
                <label
                  key={wallet.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={ids.includes(wallet.id)}
                    onChange={(e) =>
                      setSelection(
                        e.target.checked
                          ? [...ids, wallet.id]
                          : ids.filter((id) => id !== wallet.id),
                      )
                    }
                  />
                  {wallet.name}
                </label>
              ))}
            </div>
          </fieldset>
          <PeriodPicker value={period} onChange={setPeriod} />
          {ids.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              Sélectionnez au moins un portefeuille.
            </p>
          ) : !validPeriod(period) ? null : query.isPending ? (
            <p role="status" className="py-12 text-center">
              Chargement de la vue globale…
            </p>
          ) : query.isError ? (
            <div>
              <p role="alert">{query.error.message}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : (
            data && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Solde total actuel', data.balance],
                    ['Rentrées sur la période', data.income],
                    ['Dépenses sur la période', data.expenses],
                    ['Résultat net sur la période', data.net],
                  ].map(([label, value]) => (
                    <article
                      key={label}
                      className="rounded-xl border bg-card p-5"
                    >
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p
                        className={`mt-2 text-2xl font-semibold tabular-nums ${value.startsWith('-') ? 'text-rose-400' : ''}`}
                      >
                        {formatBalance(value)}
                      </p>
                    </article>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Le solde total couvre toutes les dates. Les rentrées et
                  dépenses portent sur la période sélectionnée, hors soldes
                  d’ouverture.
                </p>
                <div className="space-y-4 rounded-xl border bg-card p-5">
                  <h2 className="font-semibold">
                    Comparaison par portefeuille
                  </h2>
                  <div className="h-72 min-w-0">
                    <ResponsiveChart>
                      <BarChart
                        data={data.wallets.map((wallet) => ({
                          ...wallet,
                          incomeValue: Number(wallet.income),
                          expenseValue: Number(wallet.expenses),
                        }))}
                      >
                        <CartesianGrid
                          vertical={false}
                          stroke="var(--border)"
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(name) =>
                            String(name).length > 20
                              ? `${String(name).slice(0, 18)}…`
                              : String(name)
                          }
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            const row = data.wallets.find(
                              (wallet) =>
                                wallet.id === payload?.[0]?.payload.id,
                            )
                            return !active || !row ? null : (
                              <div className="space-y-1 rounded-lg border bg-card p-3 text-sm shadow-md">
                                <p className="mb-2 font-medium">{row.name}</p>
                                <p className="text-emerald-500">
                                  Rentrées : {formatBalance(row.income)}
                                </p>
                                <p className="text-rose-400">
                                  Dépenses : {formatBalance(row.expenses)}
                                </p>
                                <p className="border-t pt-2 font-semibold">
                                  Résultat net : {formatBalance(row.net)}
                                </p>
                              </div>
                            )
                          }}
                        />
                        <Legend />
                        <Bar
                          name="Rentrées"
                          dataKey="incomeValue"
                          fill="#10b981"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          name="Dépenses"
                          dataKey="expenseValue"
                          fill="#fb7185"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveChart>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">
                        Résultats par portefeuille
                      </caption>
                      <thead>
                        <tr>
                          {[
                            'Portefeuille',
                            'Solde actuel',
                            'Rentrées',
                            'Dépenses',
                            'Résultat net',
                          ].map((label) => (
                            <th
                              key={label}
                              className="whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground"
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.wallets.map((wallet) => (
                          <tr key={wallet.id} className="border-t">
                            <th scope="row" className="px-3 py-3 font-medium">
                              <Link
                                to="/wallets/$walletId"
                                params={{ walletId: wallet.id }}
                                className="hover:underline"
                              >
                                {wallet.name}
                              </Link>
                            </th>
                            {[
                              wallet.balance,
                              wallet.income,
                              wallet.expenses,
                              wallet.net,
                            ].map((value, index) => (
                              <td
                                key={index}
                                className={`whitespace-nowrap px-3 py-3 tabular-nums ${value.startsWith('-') ? 'text-rose-400' : ''}`}
                              >
                                {formatBalance(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <section className="space-y-3 rounded-xl border bg-card p-5">
                  <h2 className="font-semibold">Catégories communes</h2>
                  <p className="text-xs text-muted-foreground">
                    Les mouvements des sous-catégories sont regroupés sous leur
                    catégorie principale pour tous les portefeuilles
                    sélectionnés.
                  </p>
                  {data.categories.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Aucun mouvement sur cette période.
                    </p>
                  ) : (
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr>
                            {[
                              'Catégorie',
                              'Rentrées',
                              'Dépenses',
                              'Résultat net',
                            ].map((label) => (
                              <th
                                key={label}
                                className="whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground"
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.categories.map((category) => (
                            <tr key={category.id} className="border-t">
                              <th scope="row" className="px-3 py-3 font-medium">
                                {category.name}
                              </th>
                              {[
                                category.income,
                                category.expenses,
                                category.net,
                              ].map((value, index) => (
                                <td
                                  key={index}
                                  className="whitespace-nowrap px-3 py-3 tabular-nums"
                                >
                                  {formatBalance(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )
          )}
        </>
      )}
    </section>
  )
}
