import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { formatBalance, type Wallet } from '@/features/wallets/api'
import type { Category } from '@/features/categories/api'
import { budgetKeys, loadBudgetTransactions, type Budget } from './api'

export function BudgetTransactions({
  budget,
  title,
  wallets,
  categories,
  onClose,
}: {
  budget: Budget
  title: string
  wallets: Wallet[]
  categories: Category[]
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: budgetKeys.transactions(budget.id, page),
    queryFn: ({ signal }) => loadBudgetTransactions(budget.id, page, signal),
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Dépenses · {title}</DialogTitle>
          <DialogDescription>
            Transactions enregistrées sur la période et les portefeuilles de ce
            budget, sous-catégories incluses.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role="status">Chargement…</p>
        ) : query.isError ? (
          <div>
            <p role="alert">{query.error.message}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : (
          <>
            {!query.data.items.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucune dépense enregistrée.
              </p>
            ) : (
              <ul className="space-y-3">
                {query.data.items.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-start justify-between gap-4 border-b pb-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium">{row.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.date.split('-').reverse().join('/')} ·{' '}
                        {categories.find(
                          (category) => category.id === row.category_id,
                        )?.name ?? 'Catégorie'}
                        {row.recurrence_id ? ' · Récurrente' : ''}
                      </p>
                      <Link
                        to="/transactions"
                        search={{
                          walletId: row.wallet_id,
                          from: budget.date_from,
                          to: budget.date_to,
                        }}
                        className="text-xs text-muted-foreground underline"
                      >
                        {wallets.find((wallet) => wallet.id === row.wallet_id)
                          ?.name ?? 'Voir les transactions'}
                      </Link>
                    </div>
                    <span className="shrink-0 tabular-nums">
                      {formatBalance(row.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {query.data.pagination.total_pages > 1 && (
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Précédent
                </Button>
                <span className="text-xs">
                  Page {page} / {query.data.pagination.total_pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= query.data.pagination.total_pages}
                  onClick={() => setPage(page + 1)}
                >
                  Suivant
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
