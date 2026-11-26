import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Settings2, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { walletColors } from '@/features/calendar/calendar-model'
import { categoryKeys, loadCategoryTree } from '@/features/categories/api'
import { categoryPaths } from '@/features/categories/category-paths'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { formatBalance } from '@/features/wallets/api'
import { cn } from 'cn'
import { budgetKeys, loadBudgetStatus } from './api'
import type { BudgetStatus } from './api'
import { BudgetBar, levelText } from './budget-bar'
import { BudgetDetail } from './budget-detail'
import {
  addMonths,
  byAttention,
  level,
  monthLabel,
  monthOf,
  periodLabel,
  todayIso,
} from './budget-model'

const LEVEL_LABEL = { ok: 'OK', watch: 'À surveiller', over: 'Dépassé' }

/** Tracking: every budget's period for the chosen month, most urgent first. */
export function BudgetsPage() {
  const current = monthOf(todayIso())
  const [month, setMonth] = useState(current)
  const [walletId, setWalletId] = useState('')
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
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const colors = walletColors(wallets.data ?? [])
  const paths = categoryPaths(categories.data ?? [])
  const items = byAttention(
    (status.data?.items ?? []).filter(
      (item) => !walletId || item.wallet_ids.includes(walletId),
    ),
  )
  const open = items.find((item) => item.id === selected)

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Suivi des budgets
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dépensé et encore prévu, budget par budget.
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/settings/budgets" />}
        >
          <Settings2 aria-hidden="true" />
          Gérer les budgets
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border bg-background">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mois précédent"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <span
            className="min-w-32 text-center text-sm font-medium capitalize"
            aria-live="polite"
          >
            {monthLabel(month)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mois suivant"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        {month !== current && (
          <Button variant="ghost" size="sm" onClick={() => setMonth(current)}>
            Ce mois-ci
          </Button>
        )}
        <div className="relative ml-auto">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-2.5 -translate-y-1/2 rounded-full"
            style={{
              backgroundColor: walletId
                ? colors.get(walletId)
                : 'var(--muted-foreground)',
            }}
          />
          <select
            aria-label="Portefeuille"
            className="h-9 rounded-md border bg-background pr-3 pl-7 text-sm"
            value={walletId}
            onChange={(event) => setWalletId(event.target.value)}
          >
            <option value="">Tous les portefeuilles</option>
            {wallets.data?.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status.isPending ? (
        <p role="status">Chargement…</p>
      ) : status.isError ? (
        <div className="space-y-2">
          <p role="alert">{status.error.message}</p>
          <Button variant="outline" onClick={() => void status.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Target
            className="mx-auto mb-3 size-7 text-muted-foreground"
            aria-hidden="true"
          />
          <p>Aucun budget pour {monthLabel(month)}.</p>
          <Button
            className="mt-4"
            variant="outline"
            nativeButton={false}
            render={<Link to="/settings/budgets" />}
          >
            Gérer les budgets
          </Button>
        </div>
      ) : (
        <ul className="divide-y overflow-clip rounded-xl border bg-card">
          {items.map((item) => (
            <BudgetRow
              key={item.id}
              item={item}
              category={paths.get(item.category_id) ?? 'Catégorie'}
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

function BudgetRow({
  item,
  category,
  onOpen,
}: {
  item: BudgetStatus
  category: string
  onOpen: () => void
}) {
  const state = level(item)
  const remaining = Number(item.remaining)
  const upcoming = Number(item.upcoming)
  return (
    <li className="relative grid gap-2 px-4 py-3 hover:bg-muted/40 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_9rem] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          className="block max-w-full truncate rounded-sm text-left font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
        >
          {item.name}
        </button>
        <p className="truncate text-xs text-muted-foreground">
          {category} ·{' '}
          {periodLabel(item.frequency, item.period.start, item.period.end)}
        </p>
      </div>
      <div className="min-w-0 space-y-1">
        <BudgetBar
          spent={Number(item.period.spent)}
          upcoming={upcoming}
          available={Number(item.period.available)}
          level={state}
        />
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatBalance(item.period.spent)} dépensés
          {upcoming > 0 && ` + ${formatBalance(item.upcoming)} prévus`} sur{' '}
          {formatBalance(item.period.available)}
        </p>
      </div>
      <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
        <p className={cn('font-semibold tabular-nums', levelText[state])}>
          {remaining < 0
            ? `−${formatBalance(String(-remaining))}`
            : formatBalance(item.remaining)}
        </p>
        <p
          className={cn(
            'text-xs',
            state === 'ok' ? 'text-muted-foreground' : levelText[state],
          )}
        >
          {state === 'ok' ? 'restants' : LEVEL_LABEL[state]}
        </p>
      </div>
    </li>
  )
}
