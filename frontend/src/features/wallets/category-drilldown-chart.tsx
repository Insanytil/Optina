import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Repeat } from 'lucide-react'
import { Cell, Pie, PieChart } from 'recharts'
import { Button } from '@/components/ui/button'
import { ResponsiveChart } from '@/components/ui/responsive-chart'
import { categoryKeys, loadCategoryTree } from '@/features/categories/api'
import { listTransactions } from '@/features/transactions/api'
import { cn } from 'cn'
import { formatBalance, loadCategoryBreakdown, walletKeys } from './api'
import type { Flow, Origin } from './api'
import { delta, percent, rootColors, shade } from './category-colors'
import { periodMonth, shiftPeriodMonth } from './period'
import type { WalletDateRange } from './period'

const ORIGINS: { value: Origin; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'recurring', label: 'Fixes' },
  { value: 'manual', label: 'Variables' },
]
const GREY = '#94a3b8'
const shortDate = (value: string) =>
  value.slice(5).split('-').reverse().join('/')

interface Slice {
  key: string
  categoryId: string | null
  name: string
  amount: number
  color: string
  share: number
  change: number | null
}

/**
 * Spending by category for the period: a donut with the level total in its
 * centre, the full legend below, and the transactions once a category has no
 * sub-category left. Escape goes up one level.
 */
export function CategoryDrilldownChart({
  walletId,
  period,
  categoryId,
  onSelect,
  type = 'expense',
  className,
}: {
  walletId: string
  period: WalletDateRange
  categoryId: string | null
  onSelect: (id: string | null) => void
  type?: Flow
  className?: string
}) {
  const titleId = useId()
  const words =
    type === 'income'
      ? {
          title: 'Répartition des rentrées',
          of: 'rentrées',
          none: 'Aucune rentrée',
        }
      : {
          title: 'Répartition des dépenses',
          of: 'dépenses',
          none: 'Aucune dépense',
        }
  const [origin, setOrigin] = useState<Origin>('all')
  const [hovered, setHovered] = useState<string | null>(null)
  const previous = periodMonth(period) ? shiftPeriodMonth(period, -1) : null

  const query = useQuery({
    queryKey: walletKeys.categoryBreakdown(
      walletId,
      period.date_from,
      period.date_to,
      categoryId,
      origin,
      type,
    ),
    queryFn: ({ signal }) =>
      loadCategoryBreakdown(
        walletId,
        period.date_from,
        period.date_to,
        categoryId,
        origin,
        signal,
        type,
      ),
    placeholderData: (data) => data,
  })
  const before = useQuery({
    queryKey: walletKeys.categoryBreakdown(
      walletId,
      previous?.date_from ?? '',
      previous?.date_to ?? '',
      categoryId,
      origin,
      type,
    ),
    queryFn: ({ signal }) =>
      loadCategoryBreakdown(
        walletId,
        previous!.date_from,
        previous!.date_to,
        categoryId,
        origin,
        signal,
        type,
      ),
    enabled: !!previous,
  })
  const tree = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })

  const data = query.data
  const path = data?.path ?? []
  const total = Number(data?.total ?? 0)
  const roots = rootColors(tree.data ?? [])
  const base = path.length ? (roots.get(path[0].id) ?? GREY) : null
  const pastAmounts = new Map(
    (before.data?.items ?? []).map((item) => [
      item.category_id ?? 'direct',
      Number(item.amount),
    ]),
  )
  if (before.data && Number(before.data.direct_amount) > 0)
    pastAmounts.set('direct', Number(before.data.direct_amount))

  const rows = [
    ...(data?.items ?? []).map((item) => ({
      key: item.category_id ?? 'direct',
      categoryId: item.category_id,
      name: item.name,
      amount: Number(item.amount),
    })),
    ...(data && Number(data.direct_amount) > 0
      ? [
          {
            key: 'direct',
            categoryId: null,
            name: `${path.at(-1)?.name ?? 'Catégorie'} — Général`,
            amount: Number(data.direct_amount),
          },
        ]
      : []),
  ]
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const slices: Slice[] = rows.map((row, index) => ({
    ...row,
    color: base
      ? shade(base, index, rows.length)
      : (roots.get(row.categoryId ?? '') ?? GREY),
    share: percent(row.amount, total),
    change: before.data ? delta(row.amount, pastAmounts.get(row.key)) : null,
  }))
  const leaf = !!categoryId && !!data && data.items.length === 0
  const focus = slices.find((slice) => slice.key === hovered)
  const levelName = path.at(-1)?.name ?? 'Toutes les catégories'
  const up = () => onSelect(path.length > 1 ? path[path.length - 2].id : null)

  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-xl border bg-card p-4 sm:p-5 lg:min-h-0 lg:flex-1',
        className,
      )}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && categoryId) {
          event.stopPropagation()
          up()
        }
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-sm font-semibold">
          {words.title}
        </h2>
        <div
          role="radiogroup"
          aria-label={`Origine des ${words.of}`}
          className="inline-flex rounded-lg bg-muted p-[3px]"
        >
          {ORIGINS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={origin === option.value}
              onClick={() => setOrigin(option.value)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
                origin === option.value &&
                  'bg-background text-foreground shadow-sm',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <nav aria-label="Niveau de catégorie" className="mt-3 overflow-x-auto">
        <ol className="flex items-center gap-1 whitespace-nowrap text-xs">
          <li>
            <button
              type="button"
              className={cn(
                'rounded-sm px-1 py-1 hover:underline focus-visible:outline-2',
                categoryId ? 'text-muted-foreground' : 'font-medium',
              )}
              aria-current={categoryId ? undefined : 'location'}
              onClick={() => onSelect(null)}
            >
              Toutes
            </button>
          </li>
          {path.map((item, index) => (
            <li key={item.id} className="flex items-center gap-1">
              <ChevronRight
                className="size-3 text-muted-foreground"
                aria-hidden="true"
              />
              <button
                type="button"
                className={cn(
                  'max-w-40 truncate rounded-sm px-1 py-1 hover:underline focus-visible:outline-2',
                  index === path.length - 1
                    ? 'font-medium'
                    : 'text-muted-foreground',
                )}
                aria-current={
                  index === path.length - 1 ? 'location' : undefined
                }
                onClick={() => onSelect(item.id)}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {query.isPending ? (
        <p
          role="status"
          className="py-16 text-center text-sm text-muted-foreground"
        >
          Chargement des catégories…
        </p>
      ) : query.isError ? (
        <div className="space-y-3 py-8">
          <p role="alert" className="text-sm text-destructive">
            {query.error.message}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : (
        <div className="flex flex-col lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center lg:gap-8">
          <div
            className="relative mx-auto mt-2 size-52 shrink-0 sm:size-56 lg:mt-0 lg:size-40 xl:size-44 2xl:size-52"
            role="img"
            aria-label={`Répartition de ${formatBalance(total.toFixed(2))} de ${words.of}, ${levelName}`}
          >
            {slices.length > 0 ? (
              <ResponsiveChart>
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius="68%"
                    outerRadius="100%"
                    paddingAngle={slices.length > 1 ? 2 : 0}
                    stroke="var(--card)"
                    isAnimationActive={false}
                    onMouseLeave={() => setHovered(null)}
                    onClick={(_entry, index) => {
                      const slice = slices[index] as Slice | undefined
                      if (slice?.categoryId) onSelect(slice.categoryId)
                    }}
                  >
                    {slices.map((slice) => (
                      <Cell
                        key={slice.key}
                        fill={slice.color}
                        opacity={hovered && hovered !== slice.key ? 0.35 : 1}
                        className={cn(
                          'outline-none',
                          slice.categoryId && 'cursor-pointer',
                        )}
                        onMouseEnter={() => setHovered(slice.key)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveChart>
            ) : (
              <div className="size-full rounded-full border-[18px] border-muted" />
            )}
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
              <p className="text-xl font-semibold tabular-nums sm:text-2xl">
                {formatBalance((focus?.amount ?? total).toFixed(2))}
              </p>
              <p className="mx-auto max-w-32 truncate text-xs text-muted-foreground">
                {focus ? `${focus.name} · ${focus.share} %` : levelName}
              </p>
            </div>
          </div>

          {leaf ? (
            <LeafTransactions
              walletId={walletId}
              categoryId={categoryId}
              period={period}
              origin={origin}
              type={type}
            />
          ) : slices.length === 0 ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {words.none} à ce niveau sur la période.
            </p>
          ) : (
            <ul
              className="mt-4 divide-y lg:mt-0 lg:max-h-full lg:overflow-y-auto"
              aria-label="Catégories"
            >
              {slices.map((slice) => (
                <li key={slice.key}>
                  <LegendRow
                    type={type}
                    slice={slice}
                    active={hovered === slice.key}
                    onHover={setHovered}
                    onOpen={
                      slice.categoryId
                        ? () => onSelect(slice.categoryId)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function LegendRow({
  slice,
  active,
  onHover,
  onOpen,
  type,
}: {
  type: Flow
  slice: Slice
  active: boolean
  onHover: (key: string | null) => void
  onOpen?: () => void
}) {
  const content = (
    <>
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: slice.color }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{slice.name}</span>
      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {slice.share} %
      </span>
      <span className="w-20 shrink-0 text-right font-medium tabular-nums">
        {formatBalance(slice.amount.toFixed(2))}
      </span>
      <Change value={slice.change} type={type} />
      <ChevronRight
        className={cn(
          'size-3.5 shrink-0 text-muted-foreground',
          !onOpen && 'invisible',
        )}
        aria-hidden="true"
      />
    </>
  )
  const className = cn(
    'flex w-full items-center gap-3 px-2 py-2.5 text-left text-sm',
    active && 'bg-muted/60',
  )
  return onOpen ? (
    <button
      type="button"
      className={cn(
        className,
        'rounded-md outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
      )}
      onClick={onOpen}
      onMouseEnter={() => onHover(slice.key)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(slice.key)}
      onBlur={() => onHover(null)}
    >
      {content}
    </button>
  ) : (
    <div
      className={className}
      onMouseEnter={() => onHover(slice.key)}
      onMouseLeave={() => onHover(null)}
    >
      {content}
    </div>
  )
}

function Change({ value, type }: { value: number | null; type: Flow }) {
  return (
    <span
      className={cn(
        'hidden w-14 shrink-0 text-right text-xs tabular-nums sm:block',
        value === null || value === 0
          ? 'text-muted-foreground'
          : value > 0 === (type === 'expense')
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-emerald-600 dark:text-emerald-400',
      )}
      title="Par rapport au mois précédent"
    >
      {value === null
        ? '—'
        : value === 0
          ? '='
          : `${value > 0 ? '▲' : '▼'} ${Math.abs(value)} %`}
    </span>
  )
}

function LeafTransactions({
  walletId,
  categoryId,
  period,
  origin,
  type,
}: {
  type: Flow
  walletId: string
  categoryId: string
  period: WalletDateRange
  origin: Origin
}) {
  const filters = {
    wallet_id: walletId,
    category_id: categoryId,
    type,
    kind: 'standard',
    date_from: period.date_from,
    date_to: period.date_to,
    include_subcategories: true,
  }
  const query = useQuery({
    queryKey: ['transactions', 'leaf', filters],
    queryFn: ({ signal }) => listTransactions(1, filters, signal),
  })
  const items = (query.data?.items ?? [])
    .filter((item) =>
      origin === 'all'
        ? true
        : origin === 'recurring'
          ? !!item.recurrence_id
          : !item.recurrence_id,
    )
    .sort((a, b) => Number(b.amount) - Number(a.amount))
  const total = query.data?.pagination.total ?? 0
  if (query.isPending)
    return (
      <p role="status" className="mt-4 text-sm text-muted-foreground">
        Chargement des transactions…
      </p>
    )
  return (
    <div className="mt-4 lg:mt-0 lg:max-h-full lg:overflow-y-auto">
      <ul className="divide-y" aria-label="Transactions de la catégorie">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 px-2 py-2.5 text-sm"
          >
            <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">
              {shortDate(item.date)}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.recurrence_id && (
              <Repeat
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label="Récurrente"
              />
            )}
            <span className="shrink-0 font-medium tabular-nums">
              {formatBalance(item.amount)}
            </span>
          </li>
        ))}
      </ul>
      {total > (query.data?.items.length ?? 0) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Les {query.data?.items.length} plus récentes sur {total} ; la liste
          complète est dans l’onglet Transactions.
        </p>
      )}
    </div>
  )
}
