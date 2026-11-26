import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarClock,
  ChevronLeft,
  Repeat,
  TrendingUp,
} from 'lucide-react'
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
  loadCategoryBreakdown,
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
import type { WalletDateRange } from './period'
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
  notes,
} from './wallet-model'
import type { Note } from './wallet-model'

const money = (value: number) => formatBalance(value.toFixed(2))
const signedMoney = (value: number) => `${value > 0 ? '+' : ''}${money(value)}`
const shortDate = (value: string) =>
  value.slice(5).split('-').reverse().join('/')

type Upcoming = {
  recurrence_id: string
  date: string
  label: string
  type: 'income' | 'expense'
  amount: string
}

/**
 * One wallet. Wide screens: the wallet's figures in a fixed column on the
 * left, the data (balance, spending, transactions) filling the right.
 * Narrow screens: the same, stacked, with sticky tabs.
 */
export function WalletDashboard({ walletId }: { walletId: string }) {
  const [period, setPeriod] = useState(currentMonthPeriod)
  const [tab, setTab] = useState('balance')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [incomeCategoryId, setIncomeCategoryId] = useState<string | null>(null)
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
  const upcoming = (forecast.data?.occurrences ?? []) as Upcoming[]
  const curve = history.data
    ? balanceCurve(history.data.points, upcoming, period.date_to)
    : []
  const openingBalance = Number(history.data?.points[0]?.balance ?? 0)
  const closing = endBalance(curve)
  const isCurrent = period.date_from <= today && today <= period.date_to
  const remainingFrom = addDays(today, 1)
  const changeSinceOpening =
    (lastReal(curve)?.real ?? openingBalance) - openingBalance

  const choosePeriod = (next: WalletDateRange) => {
    setPeriod(next)
    setCategoryId(null)
    setIncomeCategoryId(null)
  }

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

  const budgets = (className: string) => (
    <BudgetWatch
      month={period.date_from}
      walletId={walletId}
      className={className}
    />
  )
  const nextDue = (className?: string) => (
    <UpcomingList
      className={className}
      items={upcoming.slice(0, 5)}
      pending={forecast.isPending}
    />
  )

  return (
    // 5rem = app header (h-10) + main padding (p-5 top and bottom)
    <section className="mx-auto grid w-full min-w-0 max-w-[1600px] gap-5 lg:h-[calc(100svh-5rem)] lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside
        aria-label="Portefeuille"
        className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-hidden"
      >
        <div className="space-y-1">
          <Link
            to="/my-wallets"
            className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Mes portefeuilles
          </Link>
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
          <p className="text-3xl font-semibold tracking-tight tabular-nums lg:text-4xl">
            {data ? formatBalance(data.wallet.balance) : '—'}
            <span className="ml-1 text-lg text-muted-foreground">€</span>
          </p>
          {history.data && (
            <dl className="grid gap-0.5 text-sm text-muted-foreground">
              <div className="flex gap-1">
                <dt>Depuis le {shortDate(opening)} :</dt>
                <dd
                  className={cn(
                    'font-medium tabular-nums',
                    changeSinceOpening < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {signedMoney(changeSinceOpening)}
                </dd>
              </div>
              {closing !== null && (
                <div className="flex gap-1">
                  <dt>
                    {isCurrent ? 'Fin de période prévue' : 'Fin de période'} :
                  </dt>
                  <dd className="font-medium text-foreground tabular-nums">
                    {isCurrent && '≈ '}
                    {money(closing)}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <MonthPicker
          value={period}
          onChange={choosePeriod}
          className="lg:hidden"
        />

        {data && valid && (
          <Indicators
            data={data}
            before={before.data}
            previousMonth={previous ? previous.date_from.slice(0, 7) : null}
            incomeToCome={
              isCurrent ? incomeBetween(upcoming, today, period.date_to) : 0
            }
            netToCome={
              isCurrent ? netBetween(upcoming, today, period.date_to) : 0
            }
          />
        )}

        {budgets('hidden lg:flex lg:min-h-0 lg:flex-1')}
        {nextDue('hidden lg:block')}
      </aside>

      <Tabs
        value={tab}
        onValueChange={(value: string) => setTab(value)}
        className="min-w-0 lg:min-h-0"
      >
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background lg:static">
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="balance" className="flex-none px-3">
              Solde
            </TabsTrigger>
            <TabsTrigger value="spending" className="flex-none px-3">
              Répartition
            </TabsTrigger>
            <TabsTrigger value="transactions" className="flex-none px-3">
              Transactions
            </TabsTrigger>
          </TabsList>
          <div className="ml-auto hidden items-center gap-2 pb-1 lg:flex">
            <MonthPicker
              value={period}
              onChange={choosePeriod}
              className="w-60"
            />
            {data && <CreateTransactionButton wallet={data.wallet} />}
          </div>
        </div>

        <TabsContent
          value="balance"
          className="min-h-0 space-y-4 pt-3 lg:flex lg:flex-col lg:space-y-0"
        >
          {!valid ? (
            <p role="alert" className="text-muted-foreground">
              Choisissez une période valide.
            </p>
          ) : (
            <>
              <section className="flex flex-col rounded-xl border bg-card p-4 lg:min-h-0 lg:flex-1">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium">Solde jour par jour</h2>
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
                <Notes
                  walletId={walletId}
                  period={period}
                  previous={previous}
                  upcoming={upcoming}
                  today={today}
                  onCategory={(id) => {
                    setCategoryId(id)
                    setTab('spending')
                  }}
                />
              </section>
              <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
                {budgets('max-h-80')}
                {nextDue()}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent
          value="spending"
          className="min-h-0 space-y-4 pt-3 lg:flex lg:flex-col lg:space-y-0 lg:gap-4"
        >
          {valid && (
            <>
              <CategoryDrilldownChart
                walletId={walletId}
                period={period}
                categoryId={categoryId}
                onSelect={setCategoryId}
              />
              <CategoryDrilldownChart
                type="income"
                walletId={walletId}
                period={period}
                categoryId={incomeCategoryId}
                onSelect={setIncomeCategoryId}
              />
            </>
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

      {data && (
        <CreateTransactionButton
          wallet={data.wallet}
          round
          className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 lg:hidden"
        />
      )}
    </section>
  )
}

/** A few facts worth a look under the curve; nothing when there is none. */
function Notes({
  walletId,
  period,
  previous,
  upcoming,
  today,
  onCategory,
}: {
  walletId: string
  period: WalletDateRange
  previous: WalletDateRange | null
  upcoming: Upcoming[]
  today: string
  onCategory: (id: string) => void
}) {
  const now = useQuery({
    queryKey: walletKeys.categoryBreakdown(
      walletId,
      period.date_from,
      period.date_to,
      null,
    ),
    queryFn: ({ signal }) =>
      loadCategoryBreakdown(
        walletId,
        period.date_from,
        period.date_to,
        null,
        'all',
        signal,
      ),
  })
  const then = useQuery({
    queryKey: walletKeys.categoryBreakdown(
      walletId,
      previous?.date_from ?? '',
      previous?.date_to ?? '',
      null,
    ),
    queryFn: ({ signal }) =>
      loadCategoryBreakdown(
        walletId,
        previous!.date_from,
        previous!.date_to,
        null,
        'all',
        signal,
      ),
    enabled: !!previous,
  })
  const prevName = previous
    ? monthName(previous.date_from.slice(0, 7), 'short')
    : ''
  const items: Note[] = notes(
    (now.data?.items ?? []).map((item) => ({
      id: item.category_id,
      name: item.name,
      amount: Number(item.amount),
    })),
    new Map(
      (then.data?.items ?? []).flatMap((item) =>
        item.category_id ? [[item.category_id, Number(item.amount)]] : [],
      ),
    ),
    upcoming,
    today,
  )
  if (!items.length) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-xs font-medium text-muted-foreground">À noter</span>
      {items.map((note) =>
        note.kind === 'rise' ? (
          <button
            key={note.categoryId}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
            onClick={() => onCategory(note.categoryId)}
          >
            <TrendingUp
              className="size-3.5 text-rose-600 dark:text-rose-400"
              aria-hidden="true"
            />
            <span className="font-medium">{note.name}</span>
            <span className="text-rose-600 tabular-nums dark:text-rose-400">
              +{Math.round(note.ratio * 100)} %
            </span>
            <span className="text-muted-foreground">vs {prevName}</span>
          </button>
        ) : (
          <Link
            key={`due-${note.label}`}
            to="/forecasts"
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
          >
            <CalendarClock
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="font-medium">{note.label}</span>
            <span className="tabular-nums">−{money(note.amount)}</span>
            <span className="text-muted-foreground">
              {note.days <= 1 ? 'demain' : `dans ${note.days} j`}
            </span>
          </Link>
        ),
      )}
    </div>
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
    <dl className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4 lg:grid-cols-1">
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
          netToCome ? `${signedMoney(net + netToCome)} prévu en fin` : null
        }
      />
    </dl>
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
    <div className="grid min-w-0 bg-card px-3 py-2 lg:grid-cols-[1fr_auto] lg:items-baseline lg:gap-x-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd
        className={cn(
          'truncate text-lg font-semibold tabular-nums lg:text-base',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {value}
      </dd>
      <dd className="min-h-4 truncate text-xs text-muted-foreground lg:col-span-2">
        {caption}
      </dd>
    </div>
  )
}

function UpcomingList({
  items,
  pending,
  className,
}: {
  items: Upcoming[]
  pending: boolean
  className?: string
}) {
  return (
    <section
      aria-labelledby="wallet-upcoming-title"
      className={cn('shrink-0 rounded-xl border bg-card text-sm', className)}
    >
      <div className="flex items-baseline justify-between gap-2 border-b px-4 py-2.5">
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
