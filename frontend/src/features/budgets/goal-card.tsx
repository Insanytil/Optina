import { useId } from 'react'
import {
  CalendarDays,
  ChevronDown,
  Pencil,
  Wallet as WalletIcon,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { ResponsiveChart } from '@/components/ui/responsive-chart'
import { formatBalance } from '@/features/wallets/api'
import type { Wallet } from '@/features/wallets/api'
import type { Budget, ViewConfig } from './api'
import { budgetProgress } from './budget-progress'
import { cumulativeActivity, periodLabels } from './periods'
import { formatDay, formatMonth } from './presentation'

export function GoalCard({
  goal,
  category,
  wallets,
  config,
  asOf,
  onEdit,
  onDetails,
  onHistory,
}: {
  goal: Budget
  category: string
  wallets: Wallet[]
  config: ViewConfig
  asOf: string
  onEdit: () => void
  onDetails: () => void
  onHistory: () => void
}) {
  const id = useId()
  const progress = budgetProgress(goal.amount, goal.spent, goal.committed)
  const tone =
    progress.color === 'rose'
      ? 'text-rose-700 dark:text-rose-300'
      : progress.color === 'amber'
        ? 'text-amber-800 dark:text-amber-300'
        : 'text-emerald-700 dark:text-emerald-300'
  const badge =
    progress.color === 'rose'
      ? 'bg-rose-500/10'
      : progress.color === 'amber'
        ? 'bg-amber-500/10'
        : 'bg-emerald-500/10'
  const bar =
    progress.color === 'rose'
      ? 'bg-rose-500'
      : progress.color === 'amber'
        ? 'bg-amber-500'
        : 'bg-emerald-500'
  const realized = budgetProgress(goal.amount, goal.spent, goal.spent).width
  const trend = config.widgets.includes('trend')
    ? cumulativeActivity(goal, asOf)
    : []
  const ended = goal.date_to < asOf
  const upcoming = goal.date_from > asOf
  const daysLeft = Math.max(
    0,
    Math.round((Date.parse(goal.date_to) - Date.parse(asOf)) / 86400000),
  )
  const negative = goal.remaining.startsWith('-')
  const summaryClass =
    'flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden'
  return (
    <article
      className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-labelledby={id}
    >
      <div className="space-y-5 p-5 sm:p-6">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {category} · {periodLabels[goal.period_type]}
              </p>
              <h2
                id={id}
                className="break-words text-lg font-semibold tracking-tight"
              >
                {goal.name}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`Modifier le budget ${goal.name}`}
              onClick={onEdit}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${badge} ${tone}`}
            >
              {progress.status}
            </span>
            {!ended && !upcoming && (
              <span className="text-xs text-muted-foreground">
                {daysLeft === 0
                  ? 'Dernier jour'
                  : `Encore ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`}
              </span>
            )}
            {(ended || upcoming) && (
              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                {ended ? 'Période terminée' : 'Période à venir'}
              </span>
            )}
          </div>
          {goal.repeats && (
            <p className="text-xs text-muted-foreground">
              Budget répétitif
              {goal.is_override ? ' · Exception pour cette période' : ''}
            </p>
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            {formatDay(goal.date_from)} — {formatDay(goal.date_to)}
          </p>
        </header>
        {config.widgets.includes('progress') ? (
          <section className="space-y-4" aria-label="Dépenses et prévision">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  Dépenses enregistrées
                </p>
                <p className="mt-1 break-words text-2xl font-semibold tabular-nums tracking-tight">
                  {formatBalance(goal.spent)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  Budget sur la période
                </p>
                <p className="mt-1 font-medium tabular-nums">
                  {formatBalance(goal.amount)}
                </p>
              </div>
            </div>
            <div>
              <div
                role="progressbar"
                aria-label={`Dépenses prévues pour ${goal.name}`}
                aria-valuemin={0}
                aria-valuemax={Math.max(100, progress.percent)}
                aria-valuenow={progress.percent}
                aria-valuetext={`${progress.percent.toLocaleString('fr-BE')} % du budget, dépenses enregistrées et récurrences restantes comprises`}
                className="flex h-2.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={`h-full ${bar}`}
                  style={{ width: `${realized}%` }}
                />
                <div
                  className={`h-full opacity-35 ${bar}`}
                  style={{
                    width: `${Math.max(0, progress.width - realized)}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>Enregistré + récurrences restantes</span>
                <span className={`font-medium tabular-nums ${tone}`}>
                  {progress.percent.toLocaleString('fr-BE')} % du budget
                </span>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3">
              <div>
                <dt className="text-xs text-muted-foreground">Encore prévu</dt>
                <dd className="mt-1 break-words text-sm font-medium tabular-nums">
                  {formatBalance(goal.upcoming)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Total prévisionnel
                </dt>
                <dd className="mt-1 break-words text-sm font-medium tabular-nums">
                  {formatBalance(goal.committed)}
                </dd>
              </div>
            </dl>
            <p
              className={`text-sm ${negative ? tone : 'text-muted-foreground'}`}
            >
              <strong className="font-semibold tabular-nums">
                {formatBalance(
                  negative ? goal.remaining.slice(1) : goal.remaining,
                )}
              </strong>
              {negative
                ? ended
                  ? ' au-delà de votre budget.'
                  : ' de dépassement prévu.'
                : ended
                  ? ' en dessous de votre budget.'
                  : ' de marge après les récurrences prévues.'}
            </p>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            Budget :{' '}
            <strong className="text-foreground tabular-nums">
              {formatBalance(goal.amount)}
            </strong>
          </p>
        )}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <WalletIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p className="break-words">
            {goal.wallet_ids
              .map(
                (identifier) =>
                  wallets.find((wallet) => wallet.id === identifier)?.name ??
                  'Portefeuille',
              )
              .join(' · ')}
          </p>
        </div>
      </div>
      {(config.widgets.includes('trend') ||
        config.widgets.includes('upcoming')) && (
        <div className="space-y-1 border-t px-5 py-2 sm:px-6">
          {config.widgets.includes('trend') && (
            <details className="group/trend">
              <summary className={summaryClass}>
                <span>Évolution des dépenses</span>
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open/trend:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mb-3 text-xs text-muted-foreground">
                Cumul des dépenses enregistrées, du début de la période au{' '}
                {formatDay(ended ? goal.date_to : asOf)}. Le pointillé indique
                votre budget.
              </p>
              {!trend.length ? (
                <p className="py-5 text-sm text-muted-foreground">
                  Le graphique sera disponible au début de cette période.
                </p>
              ) : (
                <div
                  className="mb-3 h-44 min-w-0"
                  role="img"
                  aria-label={`Évolution cumulée de ${goal.name} : ${formatBalance(goal.spent)} enregistrés pour un budget de ${formatBalance(goal.amount)}.`}
                >
                  <ResponsiveChart>
                    <AreaChart
                      data={trend}
                      margin={{ left: 0, right: 12, top: 14, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) =>
                          String(value).length === 7
                            ? String(value).slice(5)
                            : String(value)
                                .slice(5)
                                .split('-')
                                .reverse()
                                .join('/')
                        }
                      />
                      <YAxis width={48} tick={{ fontSize: 10 }} />
                      <Tooltip
                        content={({ active, label }) => {
                          const point = trend.find(
                            (item) => item.date === label,
                          )
                          return active && point ? (
                            <div className="rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                              <p>
                                {String(label).length === 10
                                  ? formatDay(String(label))
                                  : formatMonth(String(label))}
                              </p>
                              <p className="mt-1 font-medium">
                                Dépensé : {formatBalance(point.exact)}
                              </p>
                            </div>
                          ) : null
                        }}
                      />
                      <ReferenceLine
                        y={Number(goal.amount)}
                        ifOverflow="extendDomain"
                        stroke="var(--muted-foreground)"
                        strokeDasharray="4 4"
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="var(--primary)"
                        fill="var(--primary)"
                        fillOpacity={0.12}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveChart>
                </div>
              )}
              {trend.length > 0 && (
                <details className="mb-4">
                  <summary className="w-fit cursor-pointer rounded py-2 text-xs text-muted-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
                    Consulter les valeurs du graphique
                  </summary>
                  <div className="max-h-48 overflow-auto rounded-lg border">
                    <table className="w-full text-left text-xs">
                      <caption className="sr-only">
                        Dépenses cumulées pour {goal.name}
                      </caption>
                      <thead className="sticky top-0 bg-card">
                        <tr>
                          <th scope="col" className="p-3 font-medium">
                            Date
                          </th>
                          <th
                            scope="col"
                            className="p-3 text-right font-medium"
                          >
                            Cumul enregistré
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {trend.map((point) => (
                          <tr key={point.date}>
                            <th scope="row" className="px-3 py-2 font-normal">
                              {point.date.length === 7
                                ? formatMonth(point.date)
                                : formatDay(point.date)}
                            </th>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatBalance(point.exact)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </details>
          )}
          {config.widgets.includes('upcoming') && (
            <details className="group/upcoming">
              <summary className={summaryClass}>
                <span>
                  Récurrences restantes{' '}
                  <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                    {goal.occurrences.length}
                  </span>
                </span>
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open/upcoming:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mb-3 text-xs text-muted-foreground">
                Ces montants sont prévus sur la période de ce budget. Ils ne
                sont pas encore enregistrés dans vos dépenses.
              </p>
              {goal.occurrences.length ? (
                <ul className="mb-3 max-h-56 divide-y overflow-y-auto">
                  {goal.occurrences.map((item) => (
                    <li
                      key={`${item.recurrence_id}:${item.date}`}
                      className="flex justify-between gap-3 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium">{item.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDay(item.date)}
                          {item.date < asOf
                            ? ' · En attente de génération'
                            : ''}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums">
                        {formatBalance(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pb-4 text-sm text-muted-foreground">
                  Aucune récurrence restante sur cette période.
                </p>
              )}
            </details>
          )}
        </div>
      )}
      <footer className="border-t bg-muted/15 px-5 py-3 sm:px-6">
        <Button
          variant="outline"
          className="min-h-10 w-full sm:w-auto"
          onClick={onDetails}
        >
          Voir les dépenses enregistrées
        </Button>
        {goal.series_id && (
          <Button
            variant="ghost"
            className="mt-2 min-h-10 w-full sm:ml-2 sm:mt-0 sm:w-auto"
            onClick={onHistory}
          >
            Comparer les périodes
          </Button>
        )}
      </footer>
    </article>
  )
}
