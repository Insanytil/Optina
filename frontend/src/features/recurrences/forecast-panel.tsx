import { CollapsibleWidget } from '@/components/ui/collapsible-widget'
import { ResponsiveChart } from '@/components/ui/responsive-chart'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
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
import { formatBalance } from '@/features/wallets/api'
import { forecastRecurrences } from './api'

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('fr-BE').format(new Date(`${value}T12:00:00`))
const monthLabel = (value: string) =>
  new Intl.DateTimeFormat('fr-BE', { month: 'short', year: 'numeric' }).format(
    new Date(`${value}-01T12:00:00`),
  )

export function ForecastPanel({
  walletId,
  manageLink = false,
}: {
  walletId: string
  manageLink?: boolean
}) {
  const [months, setMonths] = useState(3)
  const query = useQuery({
    queryKey: ['wallets', 'recurrence-forecast', walletId, months],
    queryFn: ({ signal }) => forecastRecurrences(walletId, months, signal),
    staleTime: 60_000,
  })
  const data = query.data
  return (
    <CollapsibleWidget
      title="Prévisions des récurrences"
      description={
        data
          ? `Échéances à venir du ${dateLabel(data.date_from)} au ${dateLabel(data.date_to)}`
          : 'Échéances à venir à compter d’aujourd’hui'
      }
      contentClassName="space-y-4 px-5 pb-5"
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Prévisions des récurrences actives. Choisissez leur horizon
          ci-dessous.
        </p>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 6, 12].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={months === n ? 'default' : 'outline'}
              aria-pressed={months === n}
              onClick={() => setMonths(n)}
            >
              {n === 1 ? 'Ce mois' : `${n} mois`}
            </Button>
          ))}
          {manageLink && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/recurrences" search={{ walletId }} />}
            >
              Gérer
            </Button>
          )}
        </div>
      </div>
      {query.isPending ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Calcul des échéances…
        </p>
      ) : query.isError ? (
        <div className="space-y-3">
          <p role="alert">{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : (
        data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Solde actuel', data.current_balance],
                [
                  'Solde prévu en fin de période',
                  data.months.at(-1)!.closing_balance,
                ],
                ['Solde minimum prévu', data.minimum_balance],
              ].map(([label, amount]) => (
                <div
                  key={label}
                  className="rounded-lg border bg-background/40 p-4"
                >
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p
                    className={`mt-2 text-xl font-semibold tabular-nums ${amount.startsWith('-') ? 'text-rose-500' : ''}`}
                  >
                    {formatBalance(amount)}
                  </p>
                </div>
              ))}
            </div>
            {data.minimum_balance.startsWith('-') && (
              <p
                role="status"
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
              >
                Les échéances prévues pourraient dépasser votre solde
                disponible. Prévoyez au moins{' '}
                {formatBalance(data.minimum_balance.slice(1))} supplémentaires
                sur cette période.
              </p>
            )}
            {data.occurrences.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucune échéance récurrente à venir sur cette période.
              </p>
            ) : (
              <>
                <div
                  className="h-64 w-full"
                  aria-label="Comparaison mensuelle des rentrées et dépenses récurrentes"
                >
                  <ResponsiveChart>
                    <BarChart
                      data={data.months.map((m) => ({
                        month: monthLabel(m.month),
                        income: Number(m.income),
                        expenses: Number(m.expenses),
                      }))}
                    >
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, label }) => {
                          const month = data.months.find(
                            (item) => monthLabel(item.month) === label,
                          )
                          if (!active || !month) return null
                          return (
                            <div className="min-w-48 rounded-lg border bg-card p-3 text-sm shadow-md">
                              <p className="mb-2 font-medium">
                                {monthLabel(month.month)}
                              </p>
                              <div className="flex justify-between gap-6 text-emerald-500">
                                <span>Rentrées</span>
                                <span className="tabular-nums">
                                  {formatBalance(month.income)}
                                </span>
                              </div>
                              <div className="mt-1 flex justify-between gap-6 text-rose-400">
                                <span>Dépenses</span>
                                <span className="tabular-nums">
                                  {formatBalance(month.expenses)}
                                </span>
                              </div>
                              <div className="mt-2 flex justify-between gap-6 border-t pt-2 font-semibold">
                                <span>Résultat net</span>
                                <span
                                  className={`tabular-nums ${month.net.startsWith('-') ? 'text-rose-400' : 'text-emerald-500'}`}
                                >
                                  {formatBalance(month.net)}
                                </span>
                              </div>
                            </div>
                          )
                        }}
                      />
                      <Legend />
                      <Bar
                        name="Rentrées"
                        dataKey="income"
                        fill="#10b981"
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        name="Dépenses"
                        dataKey="expenses"
                        fill="#fb7185"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveChart>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Prévision par mois</caption>
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        {[
                          'Mois',
                          'Rentrées',
                          'Dépenses',
                          'Différence',
                          'Solde minimum',
                          'Solde final',
                        ].map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap px-3 py-2 font-medium"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.months.map((m) => (
                        <tr key={m.month} className="border-t">
                          <th
                            scope="row"
                            className="whitespace-nowrap px-3 py-3 font-medium"
                          >
                            {monthLabel(m.month)}
                          </th>
                          {[m.income, m.expenses, m.net].map((v, i) => (
                            <td
                              key={i}
                              className="whitespace-nowrap px-3 py-3 tabular-nums"
                            >
                              {formatBalance(v)}
                            </td>
                          ))}
                          <td
                            className={`whitespace-nowrap px-3 py-3 tabular-nums ${m.minimum_balance.startsWith('-') ? 'text-rose-500' : ''}`}
                          >
                            {formatBalance(m.minimum_balance)}
                            <span className="block text-xs text-muted-foreground">
                              le {dateLabel(m.minimum_date)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                            {formatBalance(m.closing_balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Voir les {data.occurrences.length} échéances prévues
                  </summary>
                  <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                    {data.occurrences.map((o) => (
                      <li
                        key={`${o.recurrence_id}:${o.scheduled_date}`}
                        className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"
                      >
                        <span>
                          {dateLabel(o.date)} · {o.label}
                          {o.date !== o.scheduled_date && (
                            <span className="block text-xs text-muted-foreground">
                              Échéance du {dateLabel(o.scheduled_date)} en
                              attente de rattrapage
                            </span>
                          )}
                        </span>
                        <span
                          className={`tabular-nums ${o.type === 'income' ? 'text-emerald-500' : ''}`}
                        >
                          {o.type === 'income' ? '+' : '−'}
                          {formatBalance(o.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Ces prévisions partent du solde actuel et n’incluent que les
              échéances encore à générer. Les dépenses variables et imprévus
              restent à prévoir. Le minimum est calculé en fin de journée.
            </p>
          </>
        )
      )}
    </CollapsibleWidget>
  )
}
