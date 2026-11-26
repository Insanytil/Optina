import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatBalance } from '@/features/wallets/api'
import { cn } from 'cn'
import { budgetKeys, loadBudgetHistory, loadBudgetTransactions } from './api'
import type { BudgetStatus } from './api'
import { BudgetBar, levelText } from './budget-bar'
import { level, periodLabel, periodTick, shortDate } from './budget-model'

function Figure({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('truncate font-semibold tabular-nums', className)}>
        {value}
      </dd>
    </div>
  )
}

/** The side sheet content for one budget in the tracking page. */
export function BudgetDetail({
  item,
  month,
  categoryPath,
}: {
  item: BudgetStatus
  month: string
  categoryPath: string
}) {
  const [page, setPage] = useState(1)
  const history = useQuery({
    queryKey: budgetKeys.history(item.id, month),
    queryFn: ({ signal }) => loadBudgetHistory(item.id, month, signal),
  })
  const transactions = useQuery({
    queryKey: budgetKeys.transactions(item.id, month, page),
    queryFn: ({ signal }) =>
      loadBudgetTransactions(item.id, month, page, signal),
    placeholderData: (previous) => previous,
  })
  const state = level(item)
  const remaining = Number(item.remaining)
  const carry = Number(item.period.carry)
  const periods = history.data?.periods ?? []
  const scale = Math.max(
    1,
    ...periods.map((p) => Math.max(Number(p.available), Number(p.spent))),
  )

  return (
    <>
      <SheetHeader className="gap-0.5 border-b px-5 py-4">
        <SheetDescription className="truncate text-xs">
          {categoryPath} ·{' '}
          {periodLabel(item.frequency, item.period.start, item.period.end)}
        </SheetDescription>
        <SheetTitle className="truncate pr-8 text-lg">{item.name}</SheetTitle>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4 text-sm">
        <section className="space-y-3" aria-label="Situation">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure
              label="Disponible"
              value={formatBalance(item.period.available)}
            />
            <Figure label="Dépensé" value={formatBalance(item.period.spent)} />
            <Figure label="Encore prévu" value={formatBalance(item.upcoming)} />
            <Figure
              label={remaining < 0 ? 'Dépassement' : 'Reste'}
              value={formatBalance(String(Math.abs(remaining)))}
              className={levelText[state]}
            />
          </dl>
          <BudgetBar
            spent={Number(item.period.spent)}
            upcoming={Number(item.upcoming)}
            available={Number(item.period.available)}
            level={state}
          />
          {carry !== 0 && (
            <p className="text-xs text-muted-foreground">
              {formatBalance(item.period.base)} {carry > 0 ? '+' : '−'}{' '}
              {formatBalance(String(Math.abs(carry)))}{' '}
              {carry > 0 ? 'reportés' : 'de dépassement reporté'} de la période
              précédente.
            </p>
          )}
        </section>

        {item.occurrences.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-medium">Échéances récurrentes à venir</h3>
            <ul className="divide-y rounded-lg border">
              {item.occurrences.map((occurrence) => (
                <li
                  key={`${occurrence.recurrence_id}-${occurrence.date}`}
                  className="flex justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground tabular-nums">
                      {shortDate(occurrence.date)}
                    </span>{' '}
                    {occurrence.label}
                  </span>
                  <span className="tabular-nums">
                    −{formatBalance(occurrence.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {item.frequency !== 'once' && (
          <section className="space-y-2">
            <h3 className="font-medium">Historique</h3>
            {history.isError ? (
              <p role="alert">{history.error.message}</p>
            ) : (
              <figure className="space-y-1">
                <div
                  className="flex h-28 items-end gap-1"
                  role="img"
                  aria-label="Dépensé par période comparé au montant disponible"
                >
                  {periods.map((period) => {
                    const spent = Number(period.spent)
                    const available = Number(period.available)
                    const over = spent > available
                    const current = period.start === item.period.start
                    return (
                      <div
                        key={period.start}
                        className="relative flex h-full min-w-0 flex-1 items-end"
                        title={`${periodLabel(item.frequency, period.start, period.end)} : ${formatBalance(period.spent)} sur ${formatBalance(period.available)}`}
                      >
                        {/* Available amount as a faint frame, spending inside. */}
                        <div
                          className="absolute inset-x-0 bottom-0 rounded-t-sm border border-b-0 border-dashed border-muted-foreground/40"
                          style={{
                            height: `${(Math.max(available, 0) / scale) * 100}%`,
                          }}
                        />
                        <div
                          className={cn(
                            'relative w-full rounded-t-sm',
                            over ? 'bg-rose-500' : 'bg-primary/60',
                            current && !over && 'bg-primary',
                          )}
                          style={{ height: `${(spent / scale) * 100}%` }}
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-1 text-[10px] text-muted-foreground">
                  {periods.map((period) => (
                    <span
                      key={period.start}
                      className="min-w-0 flex-1 truncate text-center"
                    >
                      {periodTick(item.frequency, period.start)}
                    </span>
                  ))}
                </div>
                <figcaption className="text-xs text-muted-foreground">
                  Barres : dépensé. Cadre pointillé : montant disponible.
                </figcaption>
              </figure>
            )}
          </section>
        )}

        <section className="space-y-2">
          <h3 className="font-medium">Transactions de la période</h3>
          {transactions.isError ? (
            <p role="alert">{transactions.error.message}</p>
          ) : transactions.data?.items.length === 0 ? (
            <p className="text-muted-foreground">Aucune transaction.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {transactions.data?.items.map((transaction) => {
                const refund = transaction.type === 'income'
                return (
                  <li
                    key={transaction.id}
                    className="flex justify-between gap-3 px-3 py-2"
                  >
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground tabular-nums">
                        {shortDate(transaction.date)}
                      </span>{' '}
                      {transaction.label}
                      {refund && (
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          · remboursement
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'tabular-nums',
                        refund && 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {refund ? '+' : '−'}
                      {formatBalance(transaction.amount)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {(transactions.data?.pagination.total_pages ?? 0) > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Précédentes
              </Button>
              <span>
                Page {page} / {transactions.data?.pagination.total_pages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={
                  page >= (transactions.data?.pagination.total_pages ?? 1)
                }
                onClick={() => setPage(page + 1)}
              >
                Suivantes
              </Button>
            </div>
          )}
        </section>
      </div>
      <div className="border-t px-5 py-3 text-right">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/settings/budgets" />}
        >
          Modifier les budgets
        </Button>
      </div>
    </>
  )
}
