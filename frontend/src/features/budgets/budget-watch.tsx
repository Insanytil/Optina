import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { categoryKeys, loadCategoryTree } from '@/features/categories/api'
import { categoryPaths } from '@/features/categories/category-paths'
import { formatBalance } from '@/features/wallets/api'
import { cn } from 'cn'
import { budgetKeys, loadBudgetStatus } from './api'
import type { BudgetStatus } from './api'
import { levelText } from './budget-bar'
import { BudgetDetail } from './budget-detail'
import {
  byAttention,
  level,
  monthLabel,
  monthOf,
  todayIso,
} from './budget-model'
import type { Level } from './budget-model'

const levelStroke: Record<Level, string> = {
  ok: 'stroke-emerald-500',
  watch: 'stroke-amber-500',
  over: 'stroke-rose-500',
}

/**
 * Home column: every budget of `month` (any ISO day of it), most urgent
 * first, as progress rings. Budgets whose wallets are all in `hiddenWallets`

 * are left out. Scrolls on its own; clicking a budget opens its detail.
 */
export function BudgetWatch({
  month: day = todayIso(),
  hiddenWallets = [],
  className,
}: {
  month?: string
  hiddenWallets?: string[]
  className?: string
}) {
  const month = monthOf(day)
  const [selected, setSelected] = useState<string | null>(null)
  const status = useQuery({
    queryKey: budgetKeys.status(month),
    queryFn: ({ signal }) => loadBudgetStatus(month, signal),
    placeholderData: (previous) => previous,
  })
  const categories = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  const paths = categoryPaths(categories.data ?? [])
  const items = byAttention(
    (status.data?.items ?? []).filter((item) =>
      item.wallet_ids.some((id) => !hiddenWallets.includes(id)),
    ),
  )
  const open = items.find((item) => item.id === selected)

  return (
    <section
      aria-labelledby="budget-watch-title"
      className={cn(
        'flex min-h-0 flex-col rounded-xl border bg-card text-sm',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 id="budget-watch-title" className="font-medium">
          Budgets
        </h2>
        <Link
          to="/budgets"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Tous
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
      {status.isPending ? (
        <p role="status" className="px-4 py-3 text-muted-foreground">
          Chargement…
        </p>
      ) : status.isError ? (
        <div className="space-y-2 px-4 py-3">
          <p role="alert">{status.error.message}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void status.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : items.length === 0 && status.data.items.length ? (
        <p className="px-4 py-3 text-muted-foreground">
          Aucun budget sur les portefeuilles affichés.
        </p>
      ) : items.length === 0 ? (
        <div className="space-y-3 px-4 py-4">
          <p className="text-muted-foreground">
            Aucun budget en {monthLabel(month)}.
          </p>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to="/settings/budgets" />}
          >
            <Plus aria-hidden="true" />
            Créer un budget
          </Button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {items.map((item) => (
            <RingRow
              key={item.id}
              item={item}
              onOpen={() => setSelected(item.id)}
            />
          ))}
        </ul>
      )}
      <Sheet
        open={!!open}
        onOpenChange={(value) => {
          if (!value) setSelected(null)
        }}
      >
        <SheetContent className="w-full gap-0 p-0 sm:max-w-lg">
          {open && (
            <BudgetDetail
              key={`${open.id}-${month}`}
              item={open}
              month={month}
              categoryPath={paths.get(open.category_id) ?? 'Catégorie'}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}

const R = 15
const C = 2 * Math.PI * R

function RingRow({ item, onOpen }: { item: BudgetStatus; onOpen: () => void }) {
  const state = level(item)
  const available = Number(item.period.available)
  const spent = Number(item.period.spent)
  const upcoming = Number(item.upcoming)
  const committed = spent + upcoming
  const scale = Math.max(available, committed, 0.01)
  const spentArc = (spent / scale) * C
  const upcomingArc = (upcoming / scale) * C
  const pct = available > 0 ? Math.round((committed / available) * 100) : null
  const remaining = Number(item.remaining)
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-2 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <svg
          viewBox="0 0 40 40"
          className="size-10 shrink-0 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="20"
            cy="20"
            r={R}
            fill="none"
            strokeWidth="5"
            className="stroke-muted"
          />
          <circle
            cx="20"
            cy="20"
            r={R}
            fill="none"
            strokeWidth="5"
            strokeDasharray={`${upcomingArc} ${C}`}
            strokeDashoffset={-spentArc}
            className={cn(levelStroke[state], 'opacity-35')}
          />
          <circle
            cx="20"
            cy="20"
            r={R}
            fill="none"
            strokeWidth="5"
            strokeDasharray={`${spentArc} ${C}`}
            className={levelStroke[state]}
          />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">
            {remaining < 0
              ? `Dépassé de ${formatBalance(String(-remaining))}`
              : `Reste ${formatBalance(item.remaining)}`}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 font-semibold tabular-nums',
            levelText[state],
          )}
        >
          {pct === null ? '—' : `${pct} %`}
        </span>
      </button>
    </li>
  )
}
