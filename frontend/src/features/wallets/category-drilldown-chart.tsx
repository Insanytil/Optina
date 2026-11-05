import { ResponsiveChart } from '@/components/ui/responsive-chart'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChartPie, ChevronRight } from 'lucide-react'
import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import { Button } from '@/components/ui/button'
import { formatBalance, loadCategoryBreakdown, walletKeys } from './api'
import type { WalletDateRange } from './period'

const colors = [
  '#10b981',
  '#38bdf8',
  '#a78bfa',
  '#fbbf24',
  '#fb7185',
  '#2dd4bf',
  '#94a3b8',
]

export function CategoryDrilldownChart({
  walletId,
  period,
  categoryId,
  onSelect,
}: {
  walletId: string
  period: WalletDateRange
  categoryId: string | null
  onSelect: (id: string | null) => void
}) {
  const query = useQuery({
    queryKey: walletKeys.categoryBreakdown(
      walletId,
      period.date_from,
      period.date_to,
      categoryId,
    ),
    queryFn: ({ signal }) =>
      loadCategoryBreakdown(
        walletId,
        period.date_from,
        period.date_to,
        categoryId,
        signal,
      ),
  })
  const data = query.data
  const path = data?.path ?? []
  const generalLabel = `${path.at(-1)?.name ?? 'Catégorie'} — Général`
  const items = data?.items ?? []
  const hasDirect = !!data && Number(data.direct_amount) > 0
  const entries = [
    ...items,
    ...(hasDirect
      ? [
          {
            category_id: null,
            name: generalLabel,
            amount: data!.direct_amount,
          },
        ]
      : []),
  ]
  const slices = entries
    .map((item, index) => ({
      ...item,
      value: Number(item.amount),
      color: colors[index % colors.length],
    }))
    .filter((item) => item.value > 0)
  return (
    <section
      className="flex h-[420px] min-w-0 flex-col overflow-hidden rounded-xl border bg-card p-5"
      aria-busy={query.isFetching}
    >
      <header className="mb-2 flex h-8 shrink-0 items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold">
          <ChartPie className="size-4 text-emerald-500" aria-hidden="true" />
          Répartition par catégorie
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={categoryId === null}
          aria-label="Remonter d’un niveau"
          onClick={() =>
            onSelect(path.length > 1 ? path[path.length - 2].id : null)
          }
        >
          <ArrowLeft aria-hidden="true" />
          Retour
        </Button>
      </header>
      <nav
        aria-label="Niveau du graphique des catégories"
        className="mb-2 h-7 shrink-0 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
      >
        <ol className="flex items-center gap-1 whitespace-nowrap text-xs">
          <li>
            <button
              type="button"
              className={`rounded-sm px-1 py-1 hover:underline focus-visible:outline-2 ${categoryId ? 'text-muted-foreground' : 'font-medium'}`}
              aria-current={categoryId === null ? 'location' : undefined}
              onClick={() => onSelect(null)}
            >
              Toutes les catégories
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
                title={item.name}
                className="max-w-40 truncate rounded-sm px-1 py-1 hover:underline focus-visible:outline-2"
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
        <div
          role="status"
          className="grid min-h-0 flex-1 place-content-center text-sm text-muted-foreground"
        >
          Chargement des catégories…
        </div>
      ) : query.isError ? (
        <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 overflow-y-auto">
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
        data && (
          <div className="grid min-h-0 flex-1 grid-rows-[1.25rem_9.5rem_minmax(0,1fr)_2rem] gap-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <p className="min-w-0 truncate text-muted-foreground">
                {categoryId
                  ? 'Dépenses de cette branche'
                  : 'Total des dépenses'}
              </p>
              <p
                className="min-w-0 truncate text-right font-semibold tabular-nums"
                title={formatBalance(data.total)}
              >
                {formatBalance(data.total)}
              </p>
            </div>
            {slices.length > 0 ? (
              <div
                className="min-h-0"
                role="img"
                aria-label="Répartition des dépenses ; les catégories peuvent être explorées avec les boutons de la légende."
              >
                <ResponsiveChart>
                  <PieChart accessibilityLayer>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={66}
                      paddingAngle={slices.length > 1 ? 3 : 0}
                      stroke="var(--card)"
                      isAnimationActive={false}
                      onClick={(_entry, index) => {
                        const item = slices[index]
                        if (item?.category_id) onSelect(item.category_id)
                      }}
                    >
                      {slices.map((item) => (
                        <Cell
                          key={item.category_id ?? 'direct'}
                          fill={item.color}
                          className={
                            item.category_id
                              ? 'cursor-pointer outline-none hover:opacity-80'
                              : 'outline-none'
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) =>
                        active && payload?.[0] ? (
                          <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                            <p className="font-medium">
                              {payload[0].payload.name}
                            </p>
                            <p className="mt-1 tabular-nums">
                              {formatBalance(payload[0].payload.amount)}
                            </p>
                            {payload[0].payload.category_id && (
                              <p className="mt-2 text-muted-foreground">
                                Cliquer pour explorer
                              </p>
                            )}
                          </div>
                        ) : null
                      }
                    />
                  </PieChart>
                </ResponsiveChart>
              </div>
            ) : (
              <p className="grid min-h-0 place-content-center text-center text-sm text-muted-foreground">
                Aucune dépense à ce niveau sur la période.
              </p>
            )}
            <ul
              key={categoryId ?? 'root'}
              className="min-h-0 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]"
              aria-label="Explorer les catégories"
            >
              {entries.map((item, index) => (
                <li key={item.category_id ?? 'direct'}>
                  {item.category_id ? (
                    <button
                      type="button"
                      onClick={() => onSelect(item.category_id)}
                      aria-label={`Explorer ${item.name}, ${formatBalance(item.amount)}`}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted focus-visible:outline-2"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: colors[index % colors.length] }}
                      />
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={item.name}
                      >
                        {item.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatBalance(item.amount)}
                      </span>
                      <ChevronRight
                        className="size-3 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-2 text-xs">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: colors[index % colors.length] }}
                      />
                      <span className="flex-1">{item.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatBalance(item.amount)}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="line-clamp-2 self-end text-[11px] leading-4 text-muted-foreground">
              {items.length === 0 && categoryId
                ? 'Cette catégorie ne contient pas de sous-catégorie.'
                : 'Cliquez sur une part ou un libellé pour explorer ses sous-catégories.'}
              {hasDirect &&
                ` « ${generalLabel} » regroupe les dépenses rattachées directement à cette catégorie.`}
            </p>
          </div>
        )
      )}
    </section>
  )
}
