import { ResponsiveChart } from '@/components/ui/responsive-chart'
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CalendarDays,
  ChartColumnIncreasing,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { formatBalance } from './api'
import type { WalletAnalytics } from './api'
import type { WalletDateRange } from './period'
import { CategoryDrilldownChart } from './category-drilldown-chart'

const colors = [
  '#10b981',
  '#38bdf8',
  '#a78bfa',
  '#fbbf24',
  '#fb7185',
  '#2dd4bf',
  '#94a3b8',
]
const formatDate = (value: string) => value.split('-').reverse().join('/')
const shortDate = (value: string) =>
  value.slice(5).split('-').reverse().join('/')
const monthLabel = (value: string) =>
  new Date(`${value}-15T12:00:00`).toLocaleDateString('fr-BE', {
    month: 'short',
    year: '2-digit',
  })
const axis = { fontSize: 11, fill: 'var(--muted-foreground)' }

function Panel({
  title,
  icon,
  children,
  className = '',
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`min-w-0 rounded-xl border bg-card p-5 ${className}`}>
      <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}
function Empty({
  children = 'Aucune dépense sur cette période.',
}: {
  children?: ReactNode
}) {
  return (
    <div className="grid h-56 place-content-center text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
function MoneyTooltip({
  title,
  rows,
}: {
  title: ReactNode
  rows: { label: string; amount: string; color: string }[]
}) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-2 font-medium">{title}</p>
      {rows.map((row) => (
        <p
          key={row.label}
          className="flex items-center justify-between gap-6 py-0.5"
        >
          <span style={{ color: row.color }}>{row.label}</span>
          <span className="font-medium tabular-nums">
            {formatBalance(row.amount)}
          </span>
        </p>
      ))}
    </div>
  )
}

export function DashboardCharts({
  data,
  walletId,
  period,
  categoryId,
  onCategoryChange,
}: {
  data: WalletAnalytics
  walletId: string
  period: WalletDateRange
  categoryId: string | null
  onCategoryChange: (id: string | null) => void
}) {
  const daily = data.expenses_by_date.map((row) => ({
    ...row,
    value: Number(row.amount),
  }))
  const monthly = data.monthly.map((row) => ({
    ...row,
    incomeValue: Number(row.income),
    expenseValue: Number(row.expenses),
  }))
  const dailyTitle = {
    day: 'Dépenses par jour',
    week: 'Dépenses par semaine',
    month: 'Dépenses par mois',
    year: 'Dépenses par année',
  }[data.expense_granularity]
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel
        title={dailyTitle}
        icon={
          <ChartColumnIncreasing
            className="size-4 text-emerald-500"
            aria-hidden="true"
          />
        }
      >
        {!daily.some((row) => row.value > 0) ? (
          <Empty />
        ) : (
          <div
            className="h-60"
            role="img"
            aria-label={`${dailyTitle}, ${daily.length} période(s).`}
          >
            <ResponsiveChart>
              <BarChart
                data={daily}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) =>
                    data.expense_granularity === 'year'
                      ? value.slice(0, 4)
                      : data.expense_granularity === 'month'
                        ? monthLabel(value.slice(0, 7))
                        : shortDate(value)
                  }
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis tick={axis} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <MoneyTooltip
                        title={formatDate(payload[0].payload.date)}
                        rows={[
                          {
                            label: 'Dépenses',
                            amount: payload[0].payload.amount,
                            color: colors[0],
                          },
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar
                  dataKey="value"
                  fill={colors[0]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveChart>
          </div>
        )}
      </Panel>
      <CategoryDrilldownChart
        walletId={walletId}
        period={period}
        categoryId={categoryId}
        onSelect={onCategoryChange}
      />
      <Panel
        title="Évolution mensuelle · 12 mois"
        icon={
          <TrendingUp className="size-4 text-emerald-500" aria-hidden="true" />
        }
      >
        <div
          className="h-60"
          role="img"
          aria-label="Comparaison mensuelle des rentrées et dépenses sur les douze mois précédant la fin de période."
        >
          <ResponsiveChart>
            <LineChart
              data={monthly}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                tick={axis}
                tickLine={false}
                axisLine={false}
                minTickGap={20}
              />
              <YAxis tick={axis} tickLine={false} axisLine={false} />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <MoneyTooltip
                      title={monthLabel(payload[0].payload.month)}
                      rows={[
                        {
                          label: 'Rentrées',
                          amount: payload[0].payload.income,
                          color: colors[0],
                        },
                        {
                          label: 'Dépenses',
                          amount: payload[0].payload.expenses,
                          color: '#fb7185',
                        },
                      ]}
                    />
                  ) : null
                }
              />
              <Legend
                iconType="circle"
                iconSize={7}
                wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
              />
              <Line
                type="linear"
                dataKey="incomeValue"
                name="Rentrées"
                stroke={colors[0]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="expenseValue"
                name="Dépenses"
                stroke="#fb7185"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveChart>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Douze mois se terminant en{' '}
          {data.monthly.length
            ? monthLabel(data.monthly[data.monthly.length - 1].month)
            : 'la période'}
          . Soldes initiaux exclus.
        </p>
      </Panel>
      <Panel
        title="Top 5 des dépenses"
        icon={<Trophy className="size-4 text-amber-500" aria-hidden="true" />}
      >
        {data.top_expenses.length === 0 ? (
          <Empty />
        ) : (
          <ol className="space-y-4">
            {data.top_expenses.map((row, index) => (
              <li key={row.id} className="flex items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-500/10 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={row.label}>
                    {row.label}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {row.category_name} · {formatDate(row.date)}
                  </p>
                </div>
                <span className="shrink-0 pt-1 text-sm font-semibold tabular-nums">
                  {formatBalance(row.amount)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Panel
        title="Activité · 90 jours"
        icon={
          <CalendarDays
            className="size-4 text-emerald-500"
            aria-hidden="true"
          />
        }
        className="xl:col-span-2"
      >
        <ActivityGrid data={data} />
      </Panel>
    </div>
  )
}

function ActivityGrid({ data }: { data: WalletAnalytics }) {
  const counts = new Map(data.activity.map((row) => [row.date, row.count]))
  const start = new Date(`${data.activity_from}T12:00:00`)
  const end = new Date(`${data.activity_to}T12:00:00`)
  const days: { date: string; count: number }[] = []
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    days.push({ date, count: counts.get(date) ?? 0 })
  }
  const total = days.reduce((sum, day) => sum + day.count, 0)
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="overflow-x-auto">
          <ul
            aria-label="Nombre de mouvements par jour"
            className="grid grid-flow-col grid-rows-7 gap-1"
          >
            {days.map((day) => (
              <li
                key={day.date}
                title={`${formatDate(day.date)} : ${day.count} mouvement(s)`}
                aria-label={`${formatDate(day.date)} : ${day.count} mouvement(s)`}
                className={`size-3 rounded-[3px] ${day.count === 0 ? 'bg-muted' : day.count < 3 ? 'bg-emerald-500/35' : day.count < 6 ? 'bg-emerald-500/65' : 'bg-emerald-500'}`}
              />
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">{total}</strong>{' '}
          mouvement{total > 1 ? 's' : ''} sur cette période
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>
          Du {formatDate(data.activity_from)} au {formatDate(data.activity_to)}{' '}
          · hors solde initial
        </span>
        <span className="flex items-center gap-1.5">
          Moins
          <span className="size-2.5 rounded-sm bg-muted" />
          <span className="size-2.5 rounded-sm bg-emerald-500/35" />
          <span className="size-2.5 rounded-sm bg-emerald-500/65" />
          <span className="size-2.5 rounded-sm bg-emerald-500" />
          Plus
        </span>
      </div>
    </>
  )
}
