import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BudgetWatch } from '@/features/budgets/budget-watch'
import { forecastRecurrences } from '@/features/recurrences/api'
import { localToday } from '@/features/transactions/form-values'
import { ApiError } from '@/lib/api'
import { cn } from 'cn'
import {
  formatBalance,
  loadBalanceHistory,
  loadWalletSummary,
  walletKeys,
} from './api'
import type { WalletSummary } from './api'
import { BalanceChart } from './balance-chart'
import { CategoryDrilldownChart } from './category-drilldown-chart'
import { CreateTransactionButton } from './create-transaction-button'
import { MonthPicker, monthName } from './month-picker'
import {
  currentMonthPeriod,
  periodMonth,
  shiftPeriodMonth,
  validPeriod,
} from './period'
import { WalletTransactions } from './wallet-transactions'
import {
  addDays,
  balanceCurve,
  change,
  changeLabel,
  endBalance,
  incomeBetween,
  lastReal,
  netBetween,
} from './wallet-model'

const money = (value: number) => formatBalance(value.toFixed(2))
const signedMoney = (value: number) => `${value > 0 ? '+' : ''}${money(value)}`
const shortDate = (value: string) =>
  value.slice(5).split('-').reverse().join('/')

/** One wallet: balance, the chosen month at a glance, spending, transactions. */
export function WalletDashboard({ walletId }: { walletId: string }) {
  const [period, setPeriod] = useState(currentMonthPeriod)
  const [tab, setTab] = useState('overview')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const valid = validPeriod(period)
  const today = localToday()
  const month = periodMonth(period)
  const previous = month ? shiftPeriodMonth(period, -1) : null

  const summary = useQuery({
    queryKey: walletKeys.summary(walletId, period.date_from, period.date_to),
    queryFn: ({ signal }) =>
      loadWalletSummary(walletId, period.date_from, period.date_to, signal),
    enabled: valid,
    placeholderData: (data) => data,
  })
  const before = useQuery({
    queryKey: walletKeys.summary(
      walletId,
      previous?.date_from ?? '',
      previous?.date_to ?? '',
    ),
    queryFn: ({ signal }) =>
      loadWalletSummary(
        walletId,
        previous!.date_from,
        previous!.date_to,
        signal,
      ),
    enabled: !!previous,
  })
  // Starts the day before so the first point is the opening balance.
  const opening = addDays(period.date_from, -1)
  const history = useQuery({
    queryKey: walletKeys.balance(walletId, opening, period.date_to),
    queryFn: ({ signal }) =>
      loadBalanceHistory(walletId, opening, period.date_to, signal),
    enabled: valid,
    placeholderData: (data) => data,
  })
  const forecast = useQuery({
    queryKey: ['wallets', 'recurrence-forecast', walletId, 2],
    queryFn: ({ signal }) => forecastRecurrences(walletId, 2, signal),
  })

  const data = summary.data
  const missing =
    summary.error instanceof ApiError &&
    [404, 422].includes(summary.error.status)
  const upcoming = forecast.data?.occurrences ?? []
  const curve = history.data
    ? balanceCurve(history.data.points, upcoming, period.date_to)
    : []
  const openingBalance = Number(history.data?.points[0]?.balance ?? 0)
  const closing = endBalance(curve)
  const isCurrent = period.date_from <= today && today <= period.date_to
  const remainingFrom = addDays(today, 1)

  if (summary.isError && !data)
    return (
      <section className="mx-auto w-full min-w-0 max-w-[1600px] space-y-3 rounded-xl border bg-card p-6">
        <h1 className="font-semibold">
          {missing
            ? 'Portefeuille introuvable'
            : 'Impossible de charger ce portefeuille'}
        </h1>
        <p role="alert" className="text-sm text-muted-foreground">
          {missing
            ? 'Ce portefeuille n’existe plus ou ne vous est pas accessible.'
            : summary.error.message}
        </p>
        {!missing && (
          <Button variant="outline" onClick={() => void summary.refetch()}>
            Réessayer
          </Button>
        )}
      </section>
    )

  return (
    <section className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-5 lg:h-[calc(100svh-5rem)]">
      <Link
        to="/my-wallets"
        className="inline-flex items-center gap-2 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Mes portefeuilles
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="flex items-center gap-2 text-base font-medium">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: data?.wallet.color }}
            />
            <span className="truncate">
              {data?.wallet.name ?? 'Portefeuille'}
            </span>
          </h1>
          <p className="text-4xl font-semibold tracking-tight tabular-nums">
            {data ? formatBalance(data.wallet.balance) : '—'}
            <span className="ml-1 text-xl text-muted-foreground">€</span>
          </p>
          {history.data && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    (lastReal(curve)?.real ?? openingBalance) - openingBalance <
                      0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {signedMoney(
                    (lastReal(curve)?.real ?? openingBalance) - openingBalance,
                  )}
                </span>{' '}
                depuis le {shortDate(opening)}
              </span>
              {closing !== null && (
                <span>
                  {isCurrent ? 'Fin de période prévue' : 'Fin de période'} :{' '}
                  <span className="font-medium text-foreground tabular-nums">
                    {isCurrent && '≈ '}
                    {money(closing)}
                  </span>
                </span>
              )}
            </p>
          )}
        </div>
        {data && (
          <div className="flex flex-wrap gap-2">
            <CreateTransactionButton wallet={data.wallet} />
          </div>
        )}
      </header>

      <MonthPicker
        value={period}
        onChange={(next) => {
          setPeriod(next)
          setCategoryId(null)
        }}
      />

      <Tabs
        value={tab}
        onValueChange={(value: string) => setTab(value)}
        className="min-h-0 flex-1"
      >
        <TabsList variant="line" className="border-b">
          <TabsTrigger value="overview">Aperçu</TabsTrigger>
          <TabsTrigger value="spending">Dépenses</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="min-h-0 pt-3 lg:flex lg:flex-col"
        >
          {!valid ? (
            <p role="alert" className="text-muted-foreground">
              Choisissez une période valide.
            </p>
          ) : (
            <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
                {data && (
                  <Indicators
                    data={data}
                    before={before.data}
                    previousMonth={
                      previous ? previous.date_from.slice(0, 7) : null
                    }
                    incomeToCome={
                      isCurrent
                        ? incomeBetween(upcoming, today, period.date_to)
                        : 0
                    }
                    netToCome={
                      isCurrent
                        ? netBetween(upcoming, today, period.date_to)
                        : 0
                    }
                  />
                )}
                <section className="flex flex-col rounded-xl border bg-card p-4 lg:min-h-0 lg:flex-1">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h2 className="text-sm font-medium">Solde</h2>
                    <p className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span
                          className="h-0.5 w-4 rounded"
                          style={{ background: data?.wallet.color }}
                        />
                        réel
                      </span>
                      {isCurrent && remainingFrom <= period.date_to && (
                        <span className="flex items-center gap-1">
                          <span
                            className="h-0 w-4 border-t-2 border-dashed"
                            style={{ borderColor: data?.wallet.color }}
                          />
                          prévu
                        </span>
                      )}
                    </p>
                  </div>
                  {curve.length ? (
                    <BalanceChart
                      className="h-64 lg:h-auto lg:min-h-40 lg:flex-1"
                      points={curve}
                      color={data?.wallet.color ?? 'var(--primary)'}
                    />
                  ) : history.isPending ? (
                    <div className="h-64 animate-pulse rounded-lg bg-muted/30 lg:h-auto lg:flex-1" />
                  ) : (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                      Aucun solde à afficher sur cette période.
                    </p>
                  )}
                </section>
              </div>
              <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
                <BudgetWatch
                  month={period.date_from}
                  walletId={walletId}
                  className="max-h-80 lg:max-h-none lg:min-h-0 lg:flex-1"
                />
                <Upcoming
                  items={upcoming.slice(0, 5)}
                  pending={forecast.isPending}
                />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="spending"
          className="min-h-0 pt-3 lg:flex lg:flex-col"
        >
          {valid && (
            <CategoryDrilldownChart
              walletId={walletId}
              period={period}
              categoryId={categoryId}
              onSelect={setCategoryId}
            />
          )}
        </TabsContent>

        <TabsContent
          value="transactions"
          className="min-h-0 pt-3 lg:flex lg:flex-col"
        >
          {valid && data && (
            <WalletTransactions
              key={`${period.date_from}:${period.date_to}`}
              wallet={data.wallet}
              period={period}
            />
          )}
        </TabsContent>
      </Tabs>
    </section>
  )
}

function Indicators({
  data,
  before,
  previousMonth,
  incomeToCome,
  netToCome,
}: {
  data: WalletSummary
  before?: WalletSummary
  previousMonth: string | null
  incomeToCome: number
  netToCome: number
}) {
  const fixed = Number(data.fixed_expenses)
  const variable = Number(data.expenses) - fixed
  const prev = before && previousMonth ? monthName(previousMonth, 'short') : ''
  const vs = (current: number, past: number | undefined) =>
    before && past !== undefined
      ? changeLabel(change(current, past), prev)
      : null
  const net = Number(data.net)
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric
        label="Rentrées"
        value={money(Number(data.income))}
        tone="good"
        caption={
          incomeToCome > 0
            ? `${signedMoney(incomeToCome)} à venir`
            : vs(Number(data.income), before && Number(before.income))
        }
      />
      <Metric
        label="Dépenses fixes"
        value={money(fixed)}
        icon={<Repeat className="size-3.5" aria-hidden="true" />}
        caption={vs(fixed, before && Number(before.fixed_expenses))}
      />
      <Metric
        label="Dépenses variables"
        value={money(variable)}
        caption={vs(
          variable,
          before && Number(before.expenses) - Number(before.fixed_expenses),
        )}
      />
      <Metric
        label="Résultat net"
        value={signedMoney(net)}
        tone={net < 0 ? 'bad' : 'good'}
        caption={
          netToCome
            ? `${signedMoney(net + netToCome)} prévu en fin de période`
            : null
        }
      />
    </div>
  )
}

function Metric({
  label,
  value,
  caption,
  tone,
  icon,
}: {
  label: string
  value: string
  caption?: string | null
  tone?: 'good' | 'bad'
  icon?: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'mt-1 truncate text-xl font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 min-h-4 truncate text-xs text-muted-foreground">
        {caption}
      </p>
    </div>
  )
}

function Upcoming({
  items,
  pending,
}: {
  items: {
    recurrence_id: string
    date: string
    label: string
    type: string
    amount: string
  }[]
  pending: boolean
}) {
  return (
    <section
      aria-labelledby="wallet-upcoming-title"
      className="shrink-0 rounded-xl border bg-card text-sm"
    >
      <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 id="wallet-upcoming-title" className="font-medium">
          À venir
        </h2>
        <Link
          to="/forecasts"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Prévisions
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
      {pending ? (
        <p role="status" className="px-4 py-3 text-muted-foreground">
          Chargement…
        </p>
      ) : items.length === 0 ? (
        <p className="px-4 py-3 text-muted-foreground">
          Aucune échéance prévue.
        </p>
      ) : (
        <ul className="py-1">
          {items.map((item) => (
            <li
              key={`${item.recurrence_id}-${item.date}`}
              className="flex items-center gap-3 px-4 py-1.5"
            >
              <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">
                {shortDate(item.date)}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  item.type === 'income'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400',
                )}
              >
                {item.type === 'income' ? '+' : '−'}
                {formatBalance(item.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
